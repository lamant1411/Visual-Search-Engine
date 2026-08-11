"""Tiện ích truy vấn vector trong Qdrant."""

from dataclasses import dataclass
from typing import Any

from qdrant_client import QdrantClient
from qdrant_client.http import models

from app.core.config import settings


@dataclass(frozen=True)
class VectorSearchHit:
    image_id: int
    score: float
    point_id: str
    payload: dict[str, Any]


class QdrantSearchService:
    def __init__(self) -> None:
        self.client = QdrantClient(url=settings.qdrant_url)
        self.collection_name = settings.qdrant_images_collection

    def search(
        self,
        vector: list[float],
        *,
        limit: int,
        offset: int = 0,
        owner_user_id: int | None = None,
    ) -> list[VectorSearchHit]:
        raw_points = self._query_points(vector, limit=limit + offset, owner_user_id=owner_user_id)
        selected_points = raw_points[offset : offset + limit]
        hits: list[VectorSearchHit] = []

        for point in selected_points:
            payload = dict(getattr(point, "payload", None) or {})
            # Hỗ trợ cả key cũ của AI (image_id_int) và key chuẩn mới (image_id).
            image_id = payload.get("image_id") or payload.get("image_id_int")
            if image_id is None:
                continue

            hits.append(
                VectorSearchHit(
                    image_id=int(image_id),
                    score=float(getattr(point, "score", 0.0) or 0.0),
                    point_id=str(getattr(point, "id", "")),
                    payload=payload,
                )
            )

        return hits

    def search_by_ids(
        self,
        vector: list[float],
        image_ids: list[int],
    ) -> list[VectorSearchHit]:
        """Query Qdrant với vector query nhưng chỉ trong tập image_id cho trước.

        Dùng để lấy CLIP similarity score cho các ảnh cụ thể (ví dụ: OCR-only results
        cần được re-rank bằng CLIP). Trả về list đã được sắp xếp theo score giảm dần.
        """
        if not image_ids:
            return []

        # Qdrant filter: chỉ tìm trong các point có image_id nằm trong danh sách
        id_filter = models.Filter(
            must=[
                models.FieldCondition(
                    key="image_id",
                    match=models.MatchAny(any=image_ids),
                )
            ]
        )

        try:
            if hasattr(self.client, "query_points"):
                try:
                    result = self.client.query_points(
                        collection_name=self.collection_name,
                        query=vector,
                        limit=len(image_ids),
                        query_filter=id_filter,
                        with_payload=True,
                    )
                except TypeError:
                    result = self.client.query_points(
                        collection_name=self.collection_name,
                        query=vector,
                        limit=len(image_ids),
                        with_payload=True,
                    )
                raw_points = list(getattr(result, "points", result))
            else:
                try:
                    raw_points = list(
                        self.client.search(
                            collection_name=self.collection_name,
                            query_vector=vector,
                            limit=len(image_ids),
                            query_filter=id_filter,
                            with_payload=True,
                        )
                    )
                except TypeError:
                    raw_points = list(
                        self.client.search(
                            collection_name=self.collection_name,
                            query_vector=vector,
                            limit=len(image_ids),
                            with_payload=True,
                        )
                    )
        except Exception:
            return []

        hits: list[VectorSearchHit] = []
        for point in raw_points:
            payload = dict(getattr(point, "payload", None) or {})
            image_id = payload.get("image_id") or payload.get("image_id_int")
            if image_id is None:
                continue
            hits.append(
                VectorSearchHit(
                    image_id=int(image_id),
                    score=float(getattr(point, "score", 0.0) or 0.0),
                    point_id=str(getattr(point, "id", "")),
                    payload=payload,
                )
            )
        return hits


    def delete_image_vector(self, *, point_id: str | None = None, image_id: int | None = None) -> bool:
        point_ids: list[str] = []
        if point_id:
            point_ids.append(point_id)
        elif image_id is not None:
            point_ids.append(str(image_id))

        if not point_ids:
            return False

        try:
            self.client.delete(
                collection_name=self.collection_name,
                points_selector=models.PointIdsList(points=point_ids),
                wait=True,
            )
            return True
        except Exception:
            # Xoa DB van duoc uu tien; vector mo coi se khong hien thi vi BE loc qua bang images.
            return False

    def get_vector(
        self,
        point_id: str,
        *,
        collection_name: str | None = None,
    ) -> list[float] | None:
        """Return the stored vector for an indexed image point."""
        points = self.client.retrieve(
            collection_name=collection_name or self.collection_name,
            ids=[point_id],
            with_payload=False,
            with_vectors=True,
        )
        if not points:
            return None

        vector = getattr(points[0], "vector", None)
        if isinstance(vector, dict):
            vector = next(iter(vector.values()), None)
        if vector is None:
            return None

        return [float(value) for value in vector]

    def _query_points(
        self,
        vector: list[float],
        *,
        limit: int,
        owner_user_id: int | None = None,
    ) -> list[Any]:
        query_filter = self._owner_filter(owner_user_id)
        if hasattr(self.client, "query_points"):
            try:
                result = self.client.query_points(
                    collection_name=self.collection_name,
                    query=vector,
                    limit=limit,
                    query_filter=query_filter,
                    with_payload=True,
                )
            except TypeError:
                result = self.client.query_points(
                    collection_name=self.collection_name,
                    query=vector,
                    limit=limit,
                    with_payload=True,
                )
            return list(getattr(result, "points", result))

        try:
            return list(
                self.client.search(
                    collection_name=self.collection_name,
                    query_vector=vector,
                    limit=limit,
                    query_filter=query_filter,
                    with_payload=True,
                )
            )
        except TypeError:
            return list(
                self.client.search(
                    collection_name=self.collection_name,
                    query_vector=vector,
                    limit=limit,
                    with_payload=True,
                )
            )


    @staticmethod
    def _owner_filter(owner_user_id: int | None):
        if owner_user_id is None:
            return None

        # Images indexed before user-owned libraries were introduced do not
        # have an owner_user_id payload. They form the shared catalogue; only
        # points with a different, explicit owner must stay private.
        return models.Filter(
            should=[
                models.FieldCondition(
                    key="owner_user_id",
                    match=models.MatchValue(value=owner_user_id),
                ),
                models.IsEmptyCondition(
                    is_empty=models.PayloadField(key="owner_user_id")
                ),
                models.IsNullCondition(
                    is_null=models.PayloadField(key="owner_user_id")
                ),
            ]
        )

"""Tiện ích truy vấn vector trong Qdrant."""

from dataclasses import dataclass
from typing import Any

from qdrant_client import QdrantClient

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

    def search(self, vector: list[float], *, limit: int, offset: int = 0) -> list[VectorSearchHit]:
        raw_points = self._query_points(vector, limit=limit + offset)
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

    def _query_points(self, vector: list[float], *, limit: int) -> list[Any]:
        if hasattr(self.client, "query_points"):
            result = self.client.query_points(
                collection_name=self.collection_name,
                query=vector,
                limit=limit,
                with_payload=True,
            )
            return list(getattr(result, "points", result))

        return list(
            self.client.search(
                collection_name=self.collection_name,
                query_vector=vector,
                limit=limit,
                with_payload=True,
            )
        )

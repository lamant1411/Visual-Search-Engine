import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from app.api.search import search_by_image
from app.schemas.common import ImageStatus
from app.schemas.search import SearchResponse
from app.services.qdrant_service import QdrantSearchService, VectorSearchHit


class QdrantStoredVectorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.service = QdrantSearchService.__new__(QdrantSearchService)
        self.service.client = MagicMock()
        self.service.collection_name = "images_collection"

    def test_get_vector_returns_dense_vector(self) -> None:
        self.service.client.retrieve.return_value = [SimpleNamespace(vector=[0.1, 0.2])]

        result = self.service.get_vector("point-1")

        self.assertEqual(result, [0.1, 0.2])
        self.service.client.retrieve.assert_called_once_with(
            collection_name="images_collection",
            ids=["point-1"],
            with_payload=False,
            with_vectors=True,
        )

    def test_get_vector_supports_named_vectors(self) -> None:
        self.service.client.retrieve.return_value = [
            SimpleNamespace(vector={"image": [0.3, 0.4]})
        ]

        result = self.service.get_vector("point-2", collection_name="legacy_images")

        self.assertEqual(result, [0.3, 0.4])


class FindSimilarEndpointTests(unittest.IsolatedAsyncioTestCase):
    async def test_image_id_reuses_vector_and_excludes_source_image(self) -> None:
        image = SimpleNamespace(
            id=42,
            owner_user_id=None,
            status=ImageStatus.indexed,
            original_filename="source.webp",
            storage_path="/static/images/source.webp",
            mime_type="image/webp",
        )
        embedding = SimpleNamespace(
            qdrant_point_id="point-42",
            collection_name="images_collection",
            vector_status="synced",
        )
        db = SimpleNamespace(get=AsyncMock(side_effect=[image, embedding]))
        stored_vector = [0.1] * 512
        source_hit = VectorSearchHit(image_id=42, score=1.0, point_id="point-42", payload={})
        similar_hit = VectorSearchHit(image_id=99, score=0.9, point_id="point-99", payload={})
        qdrant_service = MagicMock()
        qdrant_service.get_vector.return_value = stored_vector
        qdrant_service.search.return_value = [source_hit, similar_hit]
        expected = SearchResponse(items=[], page=2, limit=2, total=0)

        with (
            patch("app.api.search.QdrantSearchService", return_value=qdrant_service),
            patch("app.api.search.build_search_response_from_hits", new=AsyncMock(return_value=expected)) as build_response,
            patch("app.api.search.ai_embedding_client.embed_image", new=AsyncMock()) as embed_image,
        ):
            result = await search_by_image(
                file=None,
                image_id=42,
                image_url=None,
                history_key=None,
                page=2,
                limit=2,
                current_user=SimpleNamespace(id=1),
                db=db,
            )

        self.assertEqual(result, expected)
        embed_image.assert_not_awaited()
        qdrant_service.get_vector.assert_called_once_with(
            "point-42",
            collection_name="images_collection",
        )
        remaining_hits = build_response.await_args.args[1]
        self.assertEqual([hit.image_id for hit in remaining_hits], [99])


if __name__ == "__main__":
    unittest.main()

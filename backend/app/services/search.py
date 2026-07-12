"""Nghiệp vụ ghép kết quả tìm kiếm từ Qdrant và PostgreSQL."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.image import Image
from app.models.ocr_text import OCRText
from app.schemas.search import SearchResponse, SearchResultItem, SearchResultMetadata
from app.services.qdrant_service import VectorSearchHit


async def build_search_response_from_hits(
    db: AsyncSession,
    hits: list[VectorSearchHit],
    *,
    page: int,
    limit: int,
    total: int | None = None,
) -> SearchResponse:
    image_ids = [hit.image_id for hit in hits]
    if not image_ids:
        return SearchResponse(items=[], page=page, limit=limit, total=total or 0)

    rows = await db.execute(
        select(Image, OCRText)
        .outerjoin(OCRText, OCRText.image_id == Image.id)
        .where(Image.id.in_(image_ids))
    )
    image_by_id = {image.id: (image, ocr_text) for image, ocr_text in rows.all()}

    items: list[SearchResultItem] = []
    for hit in hits:
        row = image_by_id.get(hit.image_id)
        if row is None:
            continue

        image, ocr_text = row
        image_url = build_image_url(image.storage_path)
        source_type = (
            image.source_type.value if hasattr(image.source_type, "value") else str(image.source_type)
        )

        items.append(
            SearchResultItem(
                id=image.id,
                thumbnail_url=image_url,
                image_url=image_url,
                similarity_score=round(hit.score * 100, 2),
                metadata=SearchResultMetadata(
                    width=image.width,
                    height=image.height,
                    source=source_type,
                    ocr_text=ocr_text.raw_text if ocr_text else None,
                ),
            )
        )

    return SearchResponse(items=items, page=page, limit=limit, total=total or len(items))


def build_image_url(storage_path: str) -> str:
    if storage_path.startswith(("http://", "https://")):
        return storage_path
    return storage_path

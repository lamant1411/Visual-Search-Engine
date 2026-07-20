"""Nghiệp vụ ghép kết quả tìm kiếm từ Qdrant và PostgreSQL."""

from sqlalchemy import Float, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
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

    seen_urls = set()
    all_items: list[SearchResultItem] = []
    for hit in hits:
        row = image_by_id.get(hit.image_id)
        if row is None:
            continue

        image, ocr_text = row
        image_url = build_image_url(image.storage_path)
        if image_url in seen_urls:
            continue
        seen_urls.add(image_url)

        source_type = (
            image.source_type.value if hasattr(image.source_type, "value") else str(image.source_type)
        )

        all_items.append(
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

    offset = (page - 1) * limit
    paged_items = all_items[offset : offset + limit]

    return SearchResponse(items=paged_items, page=page, limit=limit, total=total or len(all_items))


def build_image_url(storage_path: str) -> str:
    if storage_path.startswith(("http://", "https://")):
        return storage_path

    normalized_path = storage_path.replace("\\", "/").strip()
    base_url = settings.image_base_url.rstrip("/")

    if normalized_path.startswith("/static/"):
        return f"{base_url}{normalized_path}"
    if normalized_path.startswith("static/"):
        return f"{base_url}/{normalized_path}"
    if normalized_path.startswith("images/"):
        return f"{base_url}/static/{normalized_path}"

    filename = normalized_path.rsplit("/", maxsplit=1)[-1]
    return f"{base_url}/static/images/{filename}"


async def search_images_by_ocr_text(
    db: AsyncSession,
    query: str,
    *,
    page: int,
    limit: int,
) -> SearchResponse:
    """Tìm ảnh theo nội dung text OCR bằng PostgreSQL full-text search.

    Chiến lược 2 tầng:
    1. Full-text search qua to_tsvector(raw_text) @@ plainto_tsquery(query)
       — chính xác, hỗ trợ stemming, không cần migrate DB.
    2. ILIKE fallback — bắt các trường hợp tsquery không parse được.

    Score trả về là ts_rank (0.0–1.0) nhân 100 để hiển thị dạng %.
    """
    if not query or not query.strip():
        return SearchResponse(items=[], page=page, limit=limit, total=0)

    clean_query = query.strip()
    offset = (page - 1) * limit

    # FTS Optimization
    ts_query = func.plainto_tsquery("simple", clean_query)
    fts_condition = OCRText.tsv.op("@@")(ts_query)
    rank = func.ts_rank(OCRText.tsv, ts_query).cast(Float).label("rank")
    ilike_condition = OCRText.raw_text.ilike(f"%{clean_query}%")

    # DB-level deduplication via subquery
    subq = (
        select(
            func.min(Image.id).label("image_id"),
            func.max(rank).label("max_rank"),
        )
        .select_from(Image)
        .join(OCRText, OCRText.image_id == Image.id)
        .where(or_(fts_condition, ilike_condition))
        .where(OCRText.raw_text.isnot(None))
        .where(OCRText.raw_text != "")
        .group_by(Image.storage_path)
    ).subquery("deduped_images")

    # Count Optimization
    count_stmt = select(func.count()).select_from(subq)
    total_result = await db.execute(count_stmt)
    total = total_result.scalar_one() or 0

    # Lấy trang hiện tại
    stmt = (
        select(Image, OCRText, subq.c.max_rank.label("rank"))
        .join(subq, subq.c.image_id == Image.id)
        .join(OCRText, OCRText.image_id == Image.id)
        .order_by(subq.c.max_rank.desc())
        .offset(offset)
        .limit(limit)
    )
    rows = await db.execute(stmt)

    items: list[SearchResultItem] = []
    for image, ocr_text, raw_rank in rows.all():
        image_url = build_image_url(image.storage_path)

        source_type = (
            image.source_type.value if hasattr(image.source_type, "value") else str(image.source_type)
        )
        # ts_rank trả về 0.0–1.0, nhân 100 để hiển thị dạng phần trăm.
        # Nếu chỉ match qua ILIKE (rank=0), gán score tối thiểu 1.0 để phân biệt với no-match.
        display_score = round(float(raw_rank or 0.0) * 100, 2) or 1.0

        items.append(
            SearchResultItem(
                id=image.id,
                thumbnail_url=image_url,
                image_url=image_url,
                similarity_score=display_score,
                metadata=SearchResultMetadata(
                    width=image.width,
                    height=image.height,
                    source=source_type,
                    ocr_text=ocr_text.raw_text if ocr_text else None,
                ),
            )
        )

    return SearchResponse(items=items, page=page, limit=limit, total=total)

"""Nghiệp vụ ghép kết quả tìm kiếm từ Qdrant và PostgreSQL."""

import re
import unicodedata

from sqlalchemy import Float, and_, case, func, literal, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.image import Image
from app.models.ocr_text import OCRText
from app.schemas.common import ImageStatus
from app.schemas.search import SearchResponse, SearchResultItem, SearchResultMetadata
from app.services.qdrant_service import VectorSearchHit


async def build_search_response_from_hits(
    db: AsyncSession,
    hits: list[VectorSearchHit],
    *,
    page: int,
    limit: int,
    total: int | None = None,
    owner_user_id: int | None = None,
) -> SearchResponse:
    image_ids = [hit.image_id for hit in hits]
    if not image_ids:
        return SearchResponse(items=[], page=page, limit=limit, total=total or 0)

    rows = await db.execute(
        select(Image, OCRText)
        .outerjoin(OCRText, OCRText.image_id == Image.id)
        .where(Image.id.in_(image_ids))
        .where(Image.status == ImageStatus.indexed)
        .where(Image.owner_user_id == owner_user_id)
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
    owner_user_id: int | None = None,
) -> SearchResponse:
    """Search raw OCR text exactly first, then use normalized fuzzy fallback."""
    if not query or not query.strip():
        return SearchResponse(items=[], page=page, limit=limit, total=0)

    clean_query = query.strip()

    # Stage 1: preserve current FTS/ILIKE behavior and ranking.
    ts_query = func.plainto_tsquery("simple", clean_query)
    fts_condition = OCRText.tsv.op("@@")(ts_query)
    rank = func.ts_rank(OCRText.tsv, ts_query).cast(Float).label("rank")
    ilike_condition = OCRText.raw_text.ilike(f"%{clean_query}%")

    exact_subq = (
        select(
            func.min(Image.id).label("image_id"),
            func.max(rank).label("max_rank"),
        )
        .select_from(Image)
        .join(OCRText, OCRText.image_id == Image.id)
        .where(Image.status == ImageStatus.indexed)
        .where(Image.owner_user_id == owner_user_id)
        .where(or_(fts_condition, ilike_condition))
        .where(OCRText.raw_text.isnot(None))
        .where(OCRText.raw_text != "")
        .group_by(Image.storage_path)
    ).subquery("exact_ocr_images")

    exact_response = await _build_ocr_search_response(
        db,
        exact_subq,
        page=page,
        limit=limit,
    )
    if exact_response.total > 0:
        return exact_response

    # Stage 2: raw_text remains unchanged. Only the generated search derivative
    # is accent/punctuation normalized. Fuzzy expansion is disabled below four
    # alphanumeric characters to avoid noisy matches for very short queries.
    normalized_query = _normalize_ocr_query(clean_query)
    compact_length = len(normalized_query.replace(" ", ""))
    if compact_length < 2:
        return exact_response

    normalized_exact = OCRText.normalized_text.ilike(f"%{normalized_query}%")
    fuzzy_score = literal(0.0, Float)
    fuzzy_condition = None
    if compact_length >= 4:
        threshold = _ocr_fuzzy_threshold(compact_length)
        await db.execute(
            select(
                func.set_config(
                    "pg_trgm.strict_word_similarity_threshold",
                    f"{threshold:.2f}",
                    True,
                )
            )
        )
        trigram_candidate = literal(normalized_query).op("<<%")(
            OCRText.normalized_text
        )
        if compact_length <= 5 and " " not in normalized_query:
            # Trigrams alone are noisy for four-letter words. Use the index to
            # shortlist candidates, then require at most one changed character
            # against a complete OCR token (nhim -> nbim).
            edit_distance = func.ocr_min_token_edit_distance(
                literal(normalized_query),
                OCRText.normalized_text,
                1,
            )
            fuzzy_condition = and_(trigram_candidate, edit_distance <= 1)
            fuzzy_score = case(
                (edit_distance == 0, 1.0),
                (edit_distance == 1, 0.75),
                else_=0.0,
            ).cast(Float)
        else:
            fuzzy_score = func.strict_word_similarity(
                literal(normalized_query),
                OCRText.normalized_text,
            ).cast(Float)
            fuzzy_condition = trigram_candidate

    normalized_rank = case(
        (normalized_exact, 1.0),
        else_=fuzzy_score,
    ).cast(Float)
    fallback_condition = (
        or_(normalized_exact, fuzzy_condition)
        if fuzzy_condition is not None
        else normalized_exact
    )
    fuzzy_subq = (
        select(
            func.min(Image.id).label("image_id"),
            func.max(normalized_rank).label("max_rank"),
        )
        .select_from(Image)
        .join(OCRText, OCRText.image_id == Image.id)
        .where(Image.status == ImageStatus.indexed)
        .where(Image.owner_user_id == owner_user_id)
        .where(fallback_condition)
        .where(OCRText.normalized_text.isnot(None))
        .where(OCRText.normalized_text != "")
        .group_by(Image.storage_path)
    ).subquery("fuzzy_ocr_images")

    return await _build_ocr_search_response(
        db,
        fuzzy_subq,
        page=page,
        limit=limit,
    )


async def _build_ocr_search_response(
    db: AsyncSession,
    search_subquery,
    *,
    page: int,
    limit: int,
) -> SearchResponse:
    offset = (page - 1) * limit

    count_stmt = select(func.count()).select_from(search_subquery)
    total_result = await db.execute(count_stmt)
    total = total_result.scalar_one() or 0
    if total == 0:
        return SearchResponse(items=[], page=page, limit=limit, total=0)

    stmt = (
        select(Image, OCRText, search_subquery.c.max_rank.label("rank"))
        .join(search_subquery, search_subquery.c.image_id == Image.id)
        .join(OCRText, OCRText.image_id == Image.id)
        .order_by(search_subquery.c.max_rank.desc(), Image.id.desc())
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
        # All exact/fuzzy ranks stay in the 0..1 range for the existing UI.
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


def _normalize_ocr_query(value: str) -> str:
    """Match normalize_ocr_text for required English/Vietnamese queries."""
    decomposed = unicodedata.normalize("NFKD", value.replace("Đ", "D").replace("đ", "d"))
    ascii_text = "".join(char for char in decomposed if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]+", " ", ascii_text.lower()).strip()


def _ocr_fuzzy_threshold(compact_length: int) -> float:
    if compact_length <= 5:
        return 0.20
    if compact_length <= 8:
        return 0.50
    return 0.60

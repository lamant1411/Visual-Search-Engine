from dataclasses import dataclass
import hashlib
import io
import mimetypes
from pathlib import Path
from threading import Lock
from time import perf_counter
from typing import Any, Optional
import uuid

import psycopg2
from PIL import Image
from qdrant_client import QdrantClient
from qdrant_client.http import models

from batch_indexing import (
    COLLECTION_NAME,
    EMBEDDING_DIM,
    MODEL_NAME,
    POSTGRES_CONFIG,
    QDRANT_URL,
    VALID_IMAGE_EXTENSIONS,
)


@dataclass(frozen=True)
class IndexQueueItem:
    item_id: int
    batch_id: str
    image_id: int
    image_path: str
    storage_path: str
    original_filename: Optional[str] = None


_qdrant_client: Optional[QdrantClient] = None
_qdrant_client_lock = Lock()


def prepare_items_for_queue(batch_id: str, items: list[dict[str, Any]]) -> list[IndexQueueItem]:
    """Validate BE-created rows and commit queued status before touching memory queue."""
    requested = {item["item_id"]: item for item in items}
    if len(requested) != len(items):
        raise ValueError("Duplicate item_id in request.")

    conn = _open_pg_connection()
    queued_items: list[IndexQueueItem] = []
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT item.id, item.batch_id, item.image_id, item.status, image.storage_path
                FROM indexing_items AS item
                JOIN images AS image ON image.id = item.image_id
                WHERE item.id = ANY(%s)
                FOR UPDATE OF item, image;
                """,
                (list(requested),),
            )
            rows = cursor.fetchall()
            rows_by_id = {row[0]: row for row in rows}
            missing_ids = sorted(set(requested) - set(rows_by_id))
            if missing_ids:
                raise ValueError(f"Indexing items not found: {missing_ids}")

            for item_id, row in rows_by_id.items():
                _, db_batch_id, db_image_id, status, db_storage_path = row
                payload = requested[item_id]
                if db_batch_id != batch_id or payload["image_id"] != db_image_id:
                    raise ValueError(f"Indexing item does not match batch/image: {item_id}")
                if payload["storage_path"] != db_storage_path:
                    raise ValueError(f"storage_path does not match image record: {item_id}")
                if status in {"running", "indexed", "cancelled"}:
                    continue

                cursor.execute(
                    """
                    UPDATE indexing_items
                    SET status = 'queued',
                        retry_count = CASE WHEN status = 'failed' THEN 0 ELSE retry_count END,
                        error_message = NULL,
                        updated_at = NOW()
                    WHERE id = %s;
                    """,
                    (item_id,),
                )
                cursor.execute(
                    "UPDATE images SET status = 'pending', updated_at = NOW() WHERE id = %s;",
                    (db_image_id,),
                )
                if status == "failed":
                    cursor.execute(
                        """
                        UPDATE indexing_batches
                        SET failed_images = GREATEST(failed_images - 1, 0),
                            status = 'running',
                            updated_at = NOW()
                        WHERE batch_id = %s;
                        """,
                        (batch_id,),
                    )
                queued_items.append(_queue_item_from_payload(batch_id, payload))
        conn.commit()
        return queued_items
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def recover_pending_items() -> list[IndexQueueItem]:
    """Requeue durable queued/running work after the AI service restarts."""
    conn = _open_pg_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                UPDATE indexing_items
                SET status = 'queued',
                    error_message = COALESCE(error_message, 'Recovered after AI service restart.'),
                    updated_at = NOW()
                WHERE status = 'running';
                """
            )
            cursor.execute(
                """
                SELECT item.id, item.batch_id, item.image_id,
                       image.storage_path, image.original_filename
                FROM indexing_items AS item
                JOIN images AS image ON image.id = item.image_id
                WHERE item.status = 'queued'
                ORDER BY item.created_at, item.id;
                """
            )
            rows = cursor.fetchall()
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    return [
        IndexQueueItem(
            item_id=row[0],
            batch_id=row[1],
            image_id=row[2],
            image_path=_storage_path_to_local_path(row[3]),
            storage_path=row[3],
            original_filename=row[4],
        )
        for row in rows
    ]


def claim_indexing_item(queue_item: IndexQueueItem) -> Optional[dict[str, Any]]:
    """Atomically claim an item so duplicate queue entries cannot run twice."""
    conn = _open_pg_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                UPDATE indexing_items
                SET status = 'running', error_message = NULL, updated_at = NOW()
                WHERE id = %s AND batch_id = %s AND image_id = %s AND status = 'queued'
                RETURNING retry_count, max_retries;
                """,
                (queue_item.item_id, queue_item.batch_id, queue_item.image_id),
            )
            row = cursor.fetchone()
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    if row is None:
        return None
    return {
        "item_id": queue_item.item_id,
        "batch_id": queue_item.batch_id,
        "image_id": queue_item.image_id,
        "image_path": queue_item.image_path,
        "storage_path": queue_item.storage_path,
        "original_filename": queue_item.original_filename,
        "retry_count": row[0],
        "max_retries": row[1],
    }


def index_single_image_item(item: dict[str, Any], clip_model, ocr_model) -> None:
    """Read metadata, run CLIP/OCR, then persist exactly one uploaded image."""
    item_label = f"item_id={item['item_id']} image_id={item['image_id']}"
    total_started_at = perf_counter()
    print(f"[Item pipeline] {item_label} stage=read started", flush=True)
    image_path = Path(item["image_path"])
    if not image_path.is_file():
        raise FileNotFoundError(f"Image file not found: {image_path}")
    if image_path.suffix.lower() not in VALID_IMAGE_EXTENSIONS:
        raise ValueError(f"Unsupported image extension: {image_path.suffix}")

    image_bytes = image_path.read_bytes()
    checksum = hashlib.sha256(image_bytes).hexdigest()
    with Image.open(io.BytesIO(image_bytes)) as source_image:
        image_format = (source_image.format or "").upper()
        width, height = source_image.size
        pil_image = source_image.convert("RGB")

    mime_type = (
        Image.MIME.get(image_format)
        or mimetypes.guess_type(image_path.name)[0]
        or "application/octet-stream"
    )
    clip_started_at = perf_counter()
    print(f"[Item pipeline] {item_label} stage=clip started", flush=True)
    vector = clip_model.embed_image(pil_image)
    if vector is None or len(vector) != EMBEDDING_DIM:
        actual_dim = 0 if vector is None else len(vector)
        raise ValueError(
            f"Invalid CLIP embedding dimension: expected {EMBEDDING_DIM}, got {actual_dim}."
        )

    clip_elapsed = perf_counter() - clip_started_at
    ocr_started_at = perf_counter()
    print(
        f"[Item pipeline] {item_label} stage=ocr started clip={clip_elapsed:.2f}s",
        flush=True,
    )
    ocr_lines = ocr_model.extract_text(pil_image)
    ocr_text = " ".join(ocr_lines) if ocr_lines else ""
    ocr_elapsed = perf_counter() - ocr_started_at
    point_id = str(
        uuid.uuid5(uuid.NAMESPACE_URL, f"{COLLECTION_NAME}:image:{item['image_id']}")
    )
    qdrant = _get_qdrant_client()

    try:
        persist_started_at = perf_counter()
        print(
            f"[Item pipeline] {item_label} stage=persist started ocr={ocr_elapsed:.2f}s",
            flush=True,
        )
        qdrant.upsert(
            collection_name=COLLECTION_NAME,
            points=[
                models.PointStruct(
                    id=point_id,
                    vector=vector,
                    payload={
                        "storage_path": item["storage_path"],
                        "image_id": item["image_id"],
                        "image_id_int": item["image_id"],
                    },
                )
            ],
            wait=True,
        )
        _persist_index_success(
            item=item,
            point_id=point_id,
            mime_type=mime_type,
            file_size=len(image_bytes),
            width=width,
            height=height,
            checksum=checksum,
            ocr_text=ocr_text,
        )
        persist_elapsed = perf_counter() - persist_started_at
        total_elapsed = perf_counter() - total_started_at
        print(
            f"[Item pipeline] {item_label} stage=completed total={total_elapsed:.2f}s "
            f"clip={clip_elapsed:.2f}s ocr={ocr_elapsed:.2f}s persist={persist_elapsed:.2f}s",
            flush=True,
        )
    except Exception:
        # Deterministic ID allows safe cleanup even when Qdrant response is ambiguous.
        _cleanup_qdrant_point(qdrant, point_id)
        raise


def handle_index_failure(item_id: int, error: Exception) -> Optional[int]:
    """Return new retry count, or None after marking item/image permanently failed."""
    error_message = str(error)[:4000]
    conn = _open_pg_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT image_id, retry_count, max_retries, batch_id, status
                FROM indexing_items
                WHERE id = %s
                FOR UPDATE;
                """,
                (item_id,),
            )
            row = cursor.fetchone()
            if row is None:
                conn.rollback()
                return None

            image_id, retry_count, max_retries, batch_id, item_status = row
            if item_status != "running":
                conn.rollback()
                return None

            if retry_count < max_retries:
                next_retry = retry_count + 1
                cursor.execute(
                    """
                    UPDATE indexing_items
                    SET status = 'queued', retry_count = %s,
                        error_message = %s, updated_at = NOW()
                    WHERE id = %s;
                    """,
                    (next_retry, error_message, item_id),
                )
                cursor.execute(
                    "UPDATE images SET status = 'pending', updated_at = NOW() WHERE id = %s;",
                    (image_id,),
                )
                conn.commit()
                return next_retry

            cursor.execute(
                """
                UPDATE indexing_items
                SET status = 'failed', error_message = %s, updated_at = NOW()
                WHERE id = %s AND status = 'running';
                """,
                (error_message, item_id),
            )
            if cursor.rowcount != 1:
                raise RuntimeError(f"Indexing item is no longer running: {item_id}")
            cursor.execute(
                "UPDATE images SET status = 'failed', updated_at = NOW() WHERE id = %s;",
                (image_id,),
            )
            _update_batch_progress(cursor, batch_id, failed_increment=1)
        conn.commit()
        return None
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def recover_running_item(item_id: int, error_message: str) -> bool:
    """Requeue a running item if recording its previous failure hit a DB outage."""
    conn = _open_pg_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                UPDATE indexing_items
                SET status = 'queued', error_message = %s, updated_at = NOW()
                WHERE id = %s AND status = 'running'
                RETURNING image_id;
                """,
                (error_message[:4000], item_id),
            )
            row = cursor.fetchone()
            if row is not None:
                cursor.execute(
                    "UPDATE images SET status = 'pending', updated_at = NOW() WHERE id = %s;",
                    (row[0],),
                )
        conn.commit()
        return row is not None
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _persist_index_success(
    *,
    item: dict[str, Any],
    point_id: str,
    mime_type: str,
    file_size: int,
    width: int,
    height: int,
    checksum: str,
    ocr_text: str,
) -> None:
    conn = _open_pg_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                UPDATE images
                SET mime_type = %s, file_size = %s, width = %s, height = %s,
                    checksum = %s, status = 'indexed', updated_at = NOW()
                WHERE id = %s;
                """,
                (mime_type, file_size, width, height, checksum, item["image_id"]),
            )
            if cursor.rowcount != 1:
                raise ValueError(f"Image record not found: {item['image_id']}")

            cursor.execute(
                """
                INSERT INTO image_embeddings (
                    image_id, qdrant_point_id, collection_name, model_name,
                    embedding_dim, vector_status
                )
                VALUES (%s, %s, %s, %s, %s, 'synced')
                ON CONFLICT (image_id) DO UPDATE
                SET qdrant_point_id = EXCLUDED.qdrant_point_id,
                    collection_name = EXCLUDED.collection_name,
                    model_name = EXCLUDED.model_name,
                    embedding_dim = EXCLUDED.embedding_dim,
                    vector_status = 'synced';
                """,
                (item["image_id"], point_id, COLLECTION_NAME, MODEL_NAME, EMBEDDING_DIM),
            )
            cursor.execute(
                """
                INSERT INTO ocr_texts (image_id, raw_text, language, tsv)
                VALUES (%s, %s, 'en,vi', to_tsvector('simple', COALESCE(%s, '')))
                ON CONFLICT (image_id) DO UPDATE
                SET raw_text = EXCLUDED.raw_text,
                    language = EXCLUDED.language,
                    tsv = EXCLUDED.tsv,
                    updated_at = NOW();
                """,
                (item["image_id"], ocr_text, ocr_text),
            )
            cursor.execute(
                """
                UPDATE indexing_items
                SET status = 'indexed', error_message = NULL, updated_at = NOW()
                WHERE id = %s AND status = 'running';
                """,
                (item["item_id"],),
            )
            if cursor.rowcount != 1:
                raise RuntimeError(f"Indexing item is no longer running: {item['item_id']}")
            _update_batch_progress(cursor, item["batch_id"], processed_increment=1)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _update_batch_progress(
    cursor,
    batch_id: str,
    *,
    processed_increment: int = 0,
    failed_increment: int = 0,
) -> None:
    """Atomically update durable batch progress after one item reaches a terminal state."""
    cursor.execute(
        """
        UPDATE indexing_batches
        SET processed_images = LEAST(total_images, processed_images + %s),
            failed_images = LEAST(total_images, failed_images + %s),
            status = CASE
                WHEN status = 'cancelled' THEN 'cancelled'
                WHEN NOT is_uploading
                     AND processed_images + %s + failed_images + %s >= total_images
                THEN 'completed'
                ELSE 'running'
            END,
            updated_at = NOW()
        WHERE batch_id = %s;
        """,
        (
            processed_increment,
            failed_increment,
            processed_increment,
            failed_increment,
            batch_id,
        ),
    )
    if cursor.rowcount != 1:
        raise RuntimeError(f"Indexing batch not found: {batch_id}")


def _queue_item_from_payload(batch_id: str, payload: dict[str, Any]) -> IndexQueueItem:
    return IndexQueueItem(
        item_id=payload["item_id"],
        batch_id=batch_id,
        image_id=payload["image_id"],
        image_path=payload["image_path"],
        storage_path=payload["storage_path"],
        original_filename=payload.get("original_filename"),
    )


def _storage_path_to_local_path(storage_path: str) -> str:
    normalized = storage_path.replace("\\", "/")
    if normalized.startswith("/static/"):
        return f"/app{normalized}"
    if normalized.startswith("static/"):
        return f"/app/{normalized}"
    return storage_path


def _open_pg_connection():
    return psycopg2.connect(**POSTGRES_CONFIG)


def _get_qdrant_client() -> QdrantClient:
    global _qdrant_client
    if _qdrant_client is not None:
        return _qdrant_client
    with _qdrant_client_lock:
        if _qdrant_client is None:
            client = QdrantClient(url=QDRANT_URL)
            if not client.collection_exists(collection_name=COLLECTION_NAME):
                client.create_collection(
                    collection_name=COLLECTION_NAME,
                    vectors_config=models.VectorParams(
                        size=EMBEDDING_DIM,
                        distance=models.Distance.COSINE,
                    ),
                )
            _qdrant_client = client
    return _qdrant_client


def _cleanup_qdrant_point(qdrant: QdrantClient, point_id: str) -> None:
    try:
        qdrant.delete(
            collection_name=COLLECTION_NAME,
            points_selector=models.PointIdsList(points=[point_id]),
            wait=True,
        )
    except Exception as cleanup_error:
        # PostgreSQL image status is not indexed, so BE search must filter this point.
        print(f"Could not clean up Qdrant point {point_id}: {cleanup_error}")

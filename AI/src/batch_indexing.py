import argparse
import concurrent.futures
import hashlib
import io
import mimetypes
import os
import uuid
from time import perf_counter
from typing import Callable, Optional

import pandas as pd
import psycopg2
import psycopg2.extras
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from PIL import Image
from qdrant_client import QdrantClient
from qdrant_client.http import models

from clip_module import CLIPEmbedder
from ocr_module import OCRExtractor

# ==========================================
# CẤU HÌNH KẾT NỐI
# ==========================================
POSTGRES_HOST = os.getenv("POSTGRES_HOST", "localhost")
POSTGRES_PORT = os.getenv("POSTGRES_PORT", "5432")
POSTGRES_DB = os.getenv("POSTGRES_DB", "visual_search")
POSTGRES_USER = os.getenv("POSTGRES_USER", "postgres")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "postgres")
QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")

POSTGRES_CONFIG = {
    "dbname": POSTGRES_DB,
    "user": POSTGRES_USER,
    "password": POSTGRES_PASSWORD,
    "host": POSTGRES_HOST,
    "port": POSTGRES_PORT,
}

COLLECTION_NAME = os.getenv("QDRANT_COLLECTION_NAME", "images_collection")
MODEL_NAME = os.getenv("CLIP_MODEL_NAME", "clip-vit-base-patch32")
EMBEDDING_DIM = int(os.getenv("IMAGE_EMBEDDING_DIM", "512"))
LOCAL_STORAGE_PREFIX = os.getenv("LOCAL_STORAGE_PREFIX", "/static/images").rstrip("/")
VALID_IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp")

BATCH_SIZE = int(os.getenv("INDEXING_DATABASE_BATCH_SIZE", "64"))
MAX_WORKERS = int(os.getenv("INDEXING_DOWNLOAD_WORKERS", "4"))
CHUNK_SIZE = int(os.getenv("INDEXING_CHUNK_SIZE", "32"))


def format_duration(seconds: float) -> str:
    if seconds < 1:
        return f"{seconds * 1000:.0f}ms"

    minutes, remaining_seconds = divmod(seconds, 60)
    if minutes < 1:
        return f"{remaining_seconds:.1f}s"

    return f"{int(minutes)}m {remaining_seconds:.1f}s"


def print_timing_summary(metrics: dict, success_count: int) -> None:
    total_seconds = perf_counter() - metrics["total_started_at"]
    processing_seconds = metrics.get("processing_seconds", 0.0)

    print("\n--- THOI GIAN BATCH INDEXING ---")
    print(f"Tai model: {format_duration(metrics['model_load_seconds'])}")
    print(f"Ket noi va doc DB: {format_duration(metrics['database_setup_seconds'])}")
    print(f"Lap danh sach anh: {format_duration(metrics['task_discovery_seconds'])}")
    print(
        "Doc/tai anh (cong don cac worker): "
        f"{format_duration(metrics['download_seconds'])}"
    )
    print(f"CLIP: {format_duration(metrics['clip_seconds'])}")
    print(f"OCR: {format_duration(metrics['ocr_seconds'])}")
    print(f"Luu PostgreSQL + Qdrant: {format_duration(metrics['database_write_seconds'])}")
    print(f"Xu ly pipeline (wall time): {format_duration(processing_seconds)}")
    print(f"Tong thoi gian: {format_duration(total_seconds)}")

    if success_count > 0 and processing_seconds > 0:
        average_seconds = processing_seconds / success_count
        target_status = "DAT" if average_seconds < 5 else "CHUA DAT"
        print(f"Trung binh moi anh: {average_seconds:.2f}s")
        print(f"Muc tieu < 5s/anh: {target_status}")
        print(f"Throughput pipeline: {success_count / processing_seconds:.2f} anh/giay")
        print(f"Throughput end-to-end: {success_count / total_seconds:.2f} anh/giay")


def connect_databases():
    print("Dang ket noi PostgreSQL va Qdrant...")
    conn = psycopg2.connect(**POSTGRES_CONFIG)
    cursor = conn.cursor()

    qdrant = QdrantClient(url=QDRANT_URL)
    if not qdrant.collection_exists(collection_name=COLLECTION_NAME):
        qdrant.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=models.VectorParams(size=EMBEDDING_DIM, distance=models.Distance.COSINE),
        )
    return conn, cursor, qdrant


def get_all_existing_paths(pg_cursor) -> set:
    """Load toàn bộ storage_path đã có trong DB lên RAM (Set) để check trùng lặp siêu tốc"""
    pg_cursor.execute("SELECT storage_path FROM images;")
    return set(row[0] for row in pg_cursor.fetchall())


def get_all_existing_checksums(pg_cursor) -> set[str]:
    """Lay checksum da index de bo qua file trung du bi doi ten hoac doi duong dan."""
    pg_cursor.execute("SELECT checksum FROM images WHERE checksum IS NOT NULL;")
    return {row[0] for row in pg_cursor.fetchall()}


def get_images_missing_metadata(pg_cursor) -> dict[str, int]:
    """Lay anh da index nhung thieu metadata de bo sung ma khong chay lai AI."""
    pg_cursor.execute(
        """
        SELECT id, storage_path
        FROM images
        WHERE mime_type IS NULL
           OR file_size IS NULL
           OR width IS NULL
           OR height IS NULL;
        """
    )
    return {storage_path: image_id for image_id, storage_path in pg_cursor.fetchall()}


def flush_batch_to_databases(pg_conn, pg_cursor, qdrant_client, batch_data: list):
    """Đẩy một lô dữ liệu (batch) vào DB và Qdrant cùng một lúc"""
    if not batch_data:
        return 0

    images_tuples = [
        (
            d['storage_path'],
            d['original_filename'],
            d['source_type'],
            d['mime_type'],
            d['file_size'],
            d['width'],
            d['height'],
            d['checksum'],
            'indexed',
        )
        for d in batch_data
    ]
    query_images = """
        INSERT INTO images (
            storage_path,
            original_filename,
            source_type,
            mime_type,
            file_size,
            width,
            height,
            checksum,
            status
        )
        VALUES %s RETURNING id;
    """
    inserted_ids = psycopg2.extras.execute_values(pg_cursor, query_images, images_tuples, fetch=True)

    embeddings_tuples = []
    ocr_tuples = []
    qdrant_points = []

    for i, row_data in enumerate(batch_data):
        img_id = inserted_ids[i][0]
        qdrant_id = row_data['qdrant_point_id']
        
        embeddings_tuples.append((img_id, qdrant_id, COLLECTION_NAME, MODEL_NAME, EMBEDDING_DIM, 'synced'))
        ocr_tuples.append((img_id, row_data['ocr_text']))
        
        qdrant_points.append(models.PointStruct(
            id=qdrant_id,
            vector=row_data['vector'],
            payload={"storage_path": row_data['storage_path'], "image_id": img_id, "image_id_int": img_id}
        ))

    query_embeddings = """
        INSERT INTO image_embeddings (image_id, qdrant_point_id, collection_name, model_name, embedding_dim, vector_status)
        VALUES %s;
    """
    psycopg2.extras.execute_values(pg_cursor, query_embeddings, embeddings_tuples)

    query_ocr = """
        INSERT INTO ocr_texts (image_id, raw_text)
        VALUES %s;
    """
    psycopg2.extras.execute_values(pg_cursor, query_ocr, ocr_tuples)

    qdrant_client.upsert(collection_name=COLLECTION_NAME, points=qdrant_points)
    pg_conn.commit()
    return len(batch_data)


def build_local_storage_path(image_folder: str, image_path: str, storage_prefix: str) -> str:
    relative_path = os.path.relpath(image_path, image_folder).replace("\\", "/")
    return f"{storage_prefix.rstrip('/')}/{relative_path}"


def report_progress(progress_callback, processed_images: int, failed_images: int) -> None:
    """Bao tien do indexing cho AI service, khong lam dung pipeline neu callback loi."""
    if progress_callback is None:
        return
    try:
        progress_callback(processed_images=processed_images, failed_images=failed_images)
    except Exception as exc:
        print(f"Loi khi cap nhat tien do indexing: {exc}")


def backfill_image_metadata(
    pg_conn,
    pg_cursor,
    tasks: list[dict],
    known_checksums: set[str],
) -> tuple[int, float, float]:
    """Doc metadata file da index va update PostgreSQL, khong chay CLIP/OCR."""
    if not tasks:
        return 0, 0.0, 0.0

    rows = []
    download_seconds = 0.0
    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = [executor.submit(download_worker, task) for task in tasks]
        for future in concurrent.futures.as_completed(futures):
            result = future.result()
            download_seconds += result.get("download_seconds", 0.0)
            if result["error"]:
                print(
                    "Khong the bo sung metadata cho "
                    f"{result['storage_path']}: {result['error']}"
                )
                continue

            rows.append(
                (
                    result["existing_image_id"],
                    result["mime_type"],
                    result["file_size"],
                    result["width"],
                    result["height"],
                    result["checksum"],
                )
            )
            known_checksums.add(result["checksum"])

    if not rows:
        return 0, download_seconds, 0.0

    query = """
        UPDATE images AS image
        SET mime_type = data.mime_type,
            file_size = data.file_size,
            width = data.width,
            height = data.height,
            checksum = COALESCE(image.checksum, data.checksum),
            updated_at = NOW()
        FROM (VALUES %s) AS data(
            id,
            mime_type,
            file_size,
            width,
            height,
            checksum
        )
        WHERE image.id = data.id;
    """
    database_write_started_at = perf_counter()
    psycopg2.extras.execute_values(pg_cursor, query, rows)
    pg_conn.commit()
    database_write_seconds = perf_counter() - database_write_started_at
    return len(rows), download_seconds, database_write_seconds



# LUỒNG 1: PRODUCER 
def download_worker(task: dict):
    """Hàm chạy độc lập trên từng luồng chuyên lấy file về RAM (Có Retry)"""
    started_at = perf_counter()
    try:
        if task["is_local"]:
            with open(task["local_file_path"], "rb") as image_file:
                image_bytes = image_file.read()
        else:
            url = task["url"]
            optimize_url = f"{url}?w=600" if "?" not in url else url
            
            # --- CƠ CHẾ DỰ PHÒNG LỖI MẠNG ---
            session = requests.Session()
            retry = Retry(total=3, backoff_factor=1, status_forcelist=[500, 502, 503, 504])
            adapter = HTTPAdapter(max_retries=retry)
            session.mount('http://', adapter)
            session.mount('https://', adapter)
            
            res = session.get(optimize_url, stream=True, timeout=10)
            res.raise_for_status()
            image_bytes = res.content

        with Image.open(io.BytesIO(image_bytes)) as source_image:
            image_format = (source_image.format or "").upper()
            width, height = source_image.size
            pil_image = source_image.convert("RGB")

        mime_type = (
            Image.MIME.get(image_format)
            or mimetypes.guess_type(task["filename"])[0]
            or "application/octet-stream"
        )
        checksum = hashlib.sha256(image_bytes).hexdigest()
        task["pil_image"] = pil_image
        task["mime_type"] = mime_type
        task["file_size"] = len(image_bytes)
        task["width"] = width
        task["height"] = height
        task["checksum"] = checksum
        task["error"] = None
    except Exception as e:
        task["error"] = str(e)

    task["download_seconds"] = perf_counter() - started_at
    return task



# LUỒNG 2: CONSUMER
def run_indexing_pipeline(
    mode: str,
    target_path: str,
    max_images: int = 2000,
    run_all: bool = False,
    storage_prefix: str = LOCAL_STORAGE_PREFIX,
    source_type: str = "upload",
    clip_model: Optional[CLIPEmbedder] = None,
    ocr_model: Optional[OCRExtractor] = None,
    progress_callback: Optional[Callable[..., None]] = None,
):
    metrics = {
        "total_started_at": perf_counter(),
        "model_load_seconds": 0.0,
        "database_setup_seconds": 0.0,
        "task_discovery_seconds": 0.0,
        "download_seconds": 0.0,
        "clip_seconds": 0.0,
        "ocr_seconds": 0.0,
        "database_write_seconds": 0.0,
        "processing_seconds": 0.0,
    }

    stage_started_at = perf_counter()
    pg_conn, pg_cursor, qdrant_client = connect_databases()
    existing_paths = get_all_existing_paths(pg_cursor)
    known_checksums = get_all_existing_checksums(pg_cursor)
    images_missing_metadata = get_images_missing_metadata(pg_cursor)
    metrics["database_setup_seconds"] = perf_counter() - stage_started_at

    tasks = []
    metadata_backfill_tasks = []
    skipped_count = 0

    # BƯỚC 1: Lên danh sách nhiệm vụ (Task generation)
    stage_started_at = perf_counter()
    print(f"Dang doc du lieu tu {target_path}...")
    if mode == "urls":
        try:
            df = pd.read_csv(target_path, sep="\t", low_memory=False)
            urls = df["photo_image_url"].dropna()
            if not run_all:
                actual_max = min(max_images, len(urls))
                urls = urls.sample(n=actual_max, random_state=42)
                
            for idx, url in enumerate(urls.tolist(), 1):
                if url in existing_paths:
                    skipped_count += 1
                    existing_image_id = images_missing_metadata.get(url)
                    if existing_image_id is not None:
                        filename = f"unsplash_{url.split('/')[-1].split('?')[0]}"
                        metadata_backfill_tasks.append({
                            "url": url,
                            "storage_path": url,
                            "filename": filename,
                            "existing_image_id": existing_image_id,
                            "is_local": False,
                        })
                    continue
                filename = f"unsplash_{url.split('/')[-1].split('?')[0]}"
                tasks.append({"idx": idx, "url": url, "storage_path": url, "filename": filename, "source_type": "dataset", "is_local": False})
        except Exception as e:
            print(f"Loi khi doc file TSV: {e}")
            return
    else: # mode == "local"
        image_paths = []
        for root, _, files in os.walk(target_path):
            for f in files:
                if f.lower().endswith(VALID_IMAGE_EXTENSIONS):
                    image_paths.append(os.path.join(root, f))
        
        image_paths.sort()
        if not run_all:
            image_paths = image_paths[:max_images]
            
        for idx, file_path in enumerate(image_paths, 1):
            storage_path = build_local_storage_path(target_path, file_path, storage_prefix)
            if storage_path in existing_paths:
                skipped_count += 1
                existing_image_id = images_missing_metadata.get(storage_path)
                if existing_image_id is not None:
                    metadata_backfill_tasks.append({
                        "local_file_path": file_path,
                        "storage_path": storage_path,
                        "filename": os.path.basename(file_path),
                        "existing_image_id": existing_image_id,
                        "is_local": True,
                    })
                continue
            filename = os.path.basename(file_path)
            tasks.append({"idx": idx, "local_file_path": file_path, "storage_path": storage_path, "filename": filename, "source_type": source_type, "is_local": True})

    metrics["task_discovery_seconds"] = perf_counter() - stage_started_at

    metadata_backfilled_count = 0
    if metadata_backfill_tasks:
        (
            metadata_backfilled_count,
            backfill_download_seconds,
            backfill_database_write_seconds,
        ) = backfill_image_metadata(
            pg_conn,
            pg_cursor,
            metadata_backfill_tasks,
            known_checksums,
        )
        metrics["database_write_seconds"] += backfill_database_write_seconds
        metrics["download_seconds"] += backfill_download_seconds
        print(f"Da bo sung metadata cho {metadata_backfilled_count} anh da index.")

    total_tasks = len(tasks)
    total_expected = total_tasks + skipped_count
    
    if total_tasks == 0:
        report_progress(progress_callback, total_expected, 0)
        print(f"Tat ca {total_expected} anh da duoc index hoac khong tim thay anh moi.")
        print(f"Da bo sung metadata: {metadata_backfilled_count} anh.")
        print_timing_summary(metrics, 0)
        pg_cursor.close()
        pg_conn.close()
        return

    report_progress(progress_callback, skipped_count, 0)

    print("Dang chuan bi cac mo hinh AI (CLIP & EasyOCR)...")
    stage_started_at = perf_counter()
    clip = clip_model or CLIPEmbedder()
    ocr = ocr_model or OCRExtractor()
    metrics["model_load_seconds"] = perf_counter() - stage_started_at

    print(f"\nTim thay {total_tasks} anh moi. Khoi dong da luong ({MAX_WORKERS} workers) kem gom lo ({BATCH_SIZE} items/batch)...\n")

    success_count = 0
    error_count = 0
    checksum_skipped_count = 0
    batch_data = []

    # Gioi han anh da decode dang nam trong RAM trong luc OCR xu ly tuan tu.
    chunks = [tasks[i:i + CHUNK_SIZE] for i in range(0, len(tasks), CHUNK_SIZE)]

    processing_started_at = perf_counter()
    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        for chunk_idx, chunk in enumerate(chunks, 1):
            print(f"--- Đang xu ly Chunk {chunk_idx}/{len(chunks)} ({len(chunk)} anh) ---")
            
            # Phát lệnh tải ảnh (Producer)
            future_to_task = {executor.submit(download_worker, t): t for t in chunk}
            
            # Băng chuyền: Hứng kết quả tải xong và đưa vào mô hình AI (Consumer)
            for future in concurrent.futures.as_completed(future_to_task):
                result = future.result()
                idx = result["idx"]
                metrics["download_seconds"] += result.get("download_seconds", 0.0)
                
                if result["error"]:
                    print(f"[{idx}/{total_expected}] LOI TAI {result['storage_path']}: {result['error']}")
                    error_count += 1
                    report_progress(progress_callback, skipped_count + success_count + error_count, error_count)
                    continue

                checksum = result["checksum"]
                if checksum in known_checksums:
                    checksum_skipped_count += 1
                    skipped_count += 1
                    if "pil_image" in result:
                        del result["pil_image"]
                    report_progress(
                        progress_callback,
                        skipped_count + success_count + error_count,
                        error_count,
                    )
                    print(f"[{idx}/{total_expected}] BO QUA ANH TRUNG CHECKSUM: {result['filename']}")
                    continue

                # Chan ca file trung nhau trong cung mot batch truoc khi batch duoc commit.
                known_checksums.add(checksum)
                    
                try:
                    # Chạy mô hình AI
                    stage_started_at = perf_counter()
                    vector = clip.embed_image(result["pil_image"])
                    metrics["clip_seconds"] += perf_counter() - stage_started_at
                    if vector is None:
                        raise ValueError("Khong the trich xuat vector CLIP.")

                    stage_started_at = perf_counter()
                    ocr_texts = ocr.extract_text(result["pil_image"])
                    metrics["ocr_seconds"] += perf_counter() - stage_started_at
                    ocr_text_combined = " ".join(ocr_texts) if ocr_texts else ""
                    
                    batch_data.append({
                        'storage_path': result["storage_path"],
                        'original_filename': result["filename"],
                        'source_type': result["source_type"],
                        'mime_type': result["mime_type"],
                        'file_size': result["file_size"],
                        'width': result["width"],
                        'height': result["height"],
                        'checksum': checksum,
                        'vector': vector,
                        'ocr_text': ocr_text_combined,
                        'qdrant_point_id': str(uuid.uuid4())
                    })
                    
                    # GIẢI PHÓNG RAM LẬP TỨC CHO ẢNH ĐÃ XỬ LÝ XONG
                    if "pil_image" in result: del result["pil_image"]
                    
                    # Gom đủ lô thì xả kho xuống Database
                    if len(batch_data) >= BATCH_SIZE:
                        stage_started_at = perf_counter()
                        try:
                            success_count += flush_batch_to_databases(pg_conn, pg_cursor, qdrant_client, batch_data)
                        finally:
                            metrics["database_write_seconds"] += perf_counter() - stage_started_at
                        report_progress(progress_callback, skipped_count + success_count + error_count, error_count)
                        print(f"[Tiến trình] Da index thanh cong {success_count}/{total_tasks} anh moi...")
                        batch_data.clear()
                        
                except Exception as e:
                    known_checksums.discard(checksum)
                    print(f"[{idx}/{total_expected}] LOI AI TAI {result['storage_path']}: {e}")
                    error_count += 1
                    report_progress(progress_callback, skipped_count + success_count + error_count, error_count)

    # BƯỚC 3: Quét sạch lô hàng còn sót lại (Lẻ ảnh cuối cùng)
    if batch_data:
        try:
            stage_started_at = perf_counter()
            try:
                success_count += flush_batch_to_databases(pg_conn, pg_cursor, qdrant_client, batch_data)
            finally:
                metrics["database_write_seconds"] += perf_counter() - stage_started_at
            report_progress(progress_callback, skipped_count + success_count + error_count, error_count)
            print(f"[Tiến trình] Da index thanh cong {success_count}/{total_tasks} anh moi...")
        except Exception as e:
            pg_conn.rollback()
            error_count += len(batch_data)
            report_progress(progress_callback, skipped_count + success_count + error_count, error_count)
            print(f"Loi khi luu lo cuoi cung vao Database: {e}")

    metrics["processing_seconds"] = perf_counter() - processing_started_at
    print("\n--- TONG KET BATCH INDEXING PIPELINE ---")
    print(f"Hoan thanh xu ly moi: {success_count} anh.")
    print(f"Bo qua (da ton tai): {skipped_count} anh.")
    print(f"Trong do trung checksum: {checksum_skipped_count} anh.")
    print(f"Da bo sung metadata: {metadata_backfilled_count} anh.")
    print(f"Loi: {error_count} anh.")
    print_timing_summary(metrics, success_count)

    pg_cursor.close()
    pg_conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Chay batch indexing cho dataset URL hoac local")

    current_script_dir = os.path.dirname(os.path.abspath(__file__))
    default_tsv_path = os.path.abspath(
        os.path.join(current_script_dir, "..", "data", "unsplash-lite", "photos.tsv000")
    )
    default_local_folder = os.path.abspath(
        os.path.join(current_script_dir, "..", "..", "backend", "static", "images")
    )

    parser.add_argument("--mode", choices=("urls", "local"), default="urls")
    parser.add_argument("--tsv", type=str, default=default_tsv_path)
    parser.add_argument("--image-folder", type=str, default=default_local_folder)
    parser.add_argument("--storage-prefix", type=str, default=LOCAL_STORAGE_PREFIX)
    parser.add_argument("--source-type", choices=("dataset", "upload"), default="dataset")
    parser.add_argument("--max", type=int, default=2000)
    parser.add_argument("--run-all", action="store_true")

    args = parser.parse_args()

    print("=" * 60)
    print(f"[*] Mode: {args.mode}")
    print(f"[*] File TSV: {args.tsv}")
    print(f"[*] Thu muc anh local: {args.image_folder}")
    print(f"[*] Nguon anh local: {args.source_type}")
    print(f"[*] So luong xu ly toi da: {'TAT CA' if args.run_all else args.max}")
    print("=" * 60)

    target = args.image_folder if args.mode == "local" else args.tsv
    
    # Kích hoạt luồng duy nhất
    run_indexing_pipeline(
        mode=args.mode, 
        target_path=target, 
        max_images=args.max, 
        run_all=args.run_all, 
        storage_prefix=args.storage_prefix,
        source_type=args.source_type,
    )

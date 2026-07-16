import argparse
import concurrent.futures
import io
import os
import uuid
from typing import Optional

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

BATCH_SIZE = 64       # Số ảnh gom vào 1 lô lưu Database
MAX_WORKERS = 10      # Số luồng tải ảnh song song


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


def flush_batch_to_databases(pg_conn, pg_cursor, qdrant_client, batch_data: list):
    """Đẩy một lô dữ liệu (batch) vào DB và Qdrant cùng một lúc"""
    if not batch_data:
        return 0

    images_tuples = [(d['storage_path'], d['original_filename'], d['source_type'], 'indexed') for d in batch_data]
    query_images = """
        INSERT INTO images (storage_path, original_filename, source_type, status)
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



# LUỒNG 1: PRODUCER 
def download_worker(task: dict):
    """Hàm chạy độc lập trên từng luồng chuyên lấy file về RAM (Có Retry)"""
    try:
        if task["is_local"]:
            with open(task["local_file_path"], 'rb') as f:
                image_bytes = f.read()
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
            
        task["image_bytes"] = image_bytes
        task["pil_image"] = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        task["error"] = None
    except Exception as e:
        task["error"] = str(e)
        
    return task



# LUỒNG 2: CONSUMER
def run_indexing_pipeline(mode: str, target_path: str, max_images: int = 2000, run_all: bool = False, storage_prefix: str = LOCAL_STORAGE_PREFIX):
    print("Dang khoi tao cac mo hinh AI (CLIP & EasyOCR)...")
    clip = CLIPEmbedder()
    ocr = OCRExtractor()

    pg_conn, pg_cursor, qdrant_client = connect_databases()
    existing_paths = get_all_existing_paths(pg_cursor)

    tasks = []
    skipped_count = 0

    # BƯỚC 1: Lên danh sách nhiệm vụ (Task generation)
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
                continue
            filename = os.path.basename(file_path)
            tasks.append({"idx": idx, "local_file_path": file_path, "storage_path": storage_path, "filename": filename, "source_type": "local", "is_local": True})

    total_tasks = len(tasks)
    total_expected = total_tasks + skipped_count
    
    if total_tasks == 0:
        print(f"Tat ca {total_expected} anh da duoc index hoac khong tim thay anh moi.")
        return

    print(f"\nTim thay {total_tasks} anh moi. Khoi dong da luong ({MAX_WORKERS} workers) kem gom lo ({BATCH_SIZE} items/batch)...\n")

    success_count = 0
    error_count = 0
    batch_data = []

    # --- CƠ CHẾ DỰ PHÒNG CHỐNG TRÀN RAM (CHUNKING) ---
    CHUNK_SIZE = 500 # Mỗi lần chỉ giao 500 ảnh cho đa luồng xử lý
    chunks = [tasks[i:i + CHUNK_SIZE] for i in range(0, len(tasks), CHUNK_SIZE)]

    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        for chunk_idx, chunk in enumerate(chunks, 1):
            print(f"--- Đang xu ly Chunk {chunk_idx}/{len(chunks)} ({len(chunk)} anh) ---")
            
            # Phát lệnh tải ảnh (Producer)
            future_to_task = {executor.submit(download_worker, t): t for t in chunk}
            
            # Băng chuyền: Hứng kết quả tải xong và đưa vào mô hình AI (Consumer)
            for future in concurrent.futures.as_completed(future_to_task):
                result = future.result()
                idx = result["idx"]
                
                if result["error"]:
                    print(f"[{idx}/{total_expected}] LOI TAI {result['storage_path']}: {result['error']}")
                    error_count += 1
                    continue
                    
                try:
                    # Chạy mô hình AI
                    vector = clip.embed_image(result["pil_image"])
                    if vector is None:
                        raise ValueError("Khong the trich xuat vector CLIP.")
                        
                    ocr_texts = ocr.extract_text(result["image_bytes"])
                    ocr_text_combined = " ".join(ocr_texts) if ocr_texts else ""
                    
                    batch_data.append({
                        'storage_path': result["storage_path"],
                        'original_filename': result["filename"],
                        'source_type': result["source_type"],
                        'vector': vector,
                        'ocr_text': ocr_text_combined,
                        'qdrant_point_id': str(uuid.uuid4())
                    })
                    
                    # GIẢI PHÓNG RAM LẬP TỨC CHO ẢNH ĐÃ XỬ LÝ XONG
                    if "image_bytes" in result: del result["image_bytes"]
                    if "pil_image" in result: del result["pil_image"]
                    
                    # Gom đủ lô thì xả kho xuống Database
                    if len(batch_data) >= BATCH_SIZE:
                        success_count += flush_batch_to_databases(pg_conn, pg_cursor, qdrant_client, batch_data)
                        print(f"[Tiến trình] Da index thanh cong {success_count}/{total_tasks} anh moi...")
                        batch_data.clear()
                        
                except Exception as e:
                    print(f"[{idx}/{total_expected}] LOI AI TAI {result['storage_path']}: {e}")
                    error_count += 1

    # BƯỚC 3: Quét sạch lô hàng còn sót lại (Lẻ ảnh cuối cùng)
    if batch_data:
        try:
            success_count += flush_batch_to_databases(pg_conn, pg_cursor, qdrant_client, batch_data)
            print(f"[Tiến trình] Da index thanh cong {success_count}/{total_tasks} anh moi...")
        except Exception as e:
            pg_conn.rollback()
            error_count += len(batch_data)
            print(f"Loi khi luu lo cuoi cung vao Database: {e}")

    print("\n--- TONG KET BATCH INDEXING PIPELINE ---")
    print(f"Hoan thanh xu ly moi: {success_count} anh.")
    print(f"Bo qua (da ton tai): {skipped_count} anh.")
    print(f"Loi: {error_count} anh.")

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
    parser.add_argument("--max", type=int, default=2000)
    parser.add_argument("--run-all", action="store_true")

    args = parser.parse_args()

    print("=" * 60)
    print(f"[*] Mode: {args.mode}")
    print(f"[*] File TSV: {args.tsv}")
    print(f"[*] Thu muc anh local: {args.image_folder}")
    print(f"[*] So luong xu ly toi da: {'TAT CA' if args.run_all else args.max}")
    print("=" * 60)

    target = args.image_folder if args.mode == "local" else args.tsv
    
    # Kích hoạt luồng duy nhất
    run_indexing_pipeline(
        mode=args.mode, 
        target_path=target, 
        max_images=args.max, 
        run_all=args.run_all, 
        storage_prefix=args.storage_prefix
    )
import os
import uuid
import psycopg2
import requests
import io
import argparse
import pandas as pd
from PIL import Image
from qdrant_client import QdrantClient
from qdrant_client.http import models
from clip_module import CLIPEmbedder
from ocr_module import OCRExtractor


POSTGRES_HOST = os.getenv("POSTGRES_HOST", "localhost")
QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")

POSTGRES_CONFIG = {
    "dbname": "visual_search",
    "user": "postgres",
    "password": "postgres",
    "host": POSTGRES_HOST,
    "port": "5432"
}

COLLECTION_NAME = "images_collection"

def connect_databases():
    print("Đang kết nối Database...")
    conn = psycopg2.connect(**POSTGRES_CONFIG)
    cursor = conn.cursor()
    
    qdrant = QdrantClient(url=QDRANT_URL)
    if not qdrant.collection_exists(collection_name=COLLECTION_NAME):
        qdrant.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=models.VectorParams(size=512, distance=models.Distance.COSINE),
        )
    return conn, cursor, qdrant

def run_batch_indexing_from_urls(tsv_path: str, max_images: int = 2000):
    print("Đang khởi tạo các mô hình AI (CLIP & EasyOCR)...")
    clip = CLIPEmbedder()
    ocr = OCRExtractor()
    
    pg_conn, pg_cursor, qdrant_client = connect_databases()
    
    print(f"Đang đọc file dữ liệu {tsv_path}...")
    try:
        # Đọc file TSV của Unsplash
        df = pd.read_csv(tsv_path, sep='\t', low_memory=False)
        # Cột chứa URL ảnh
        image_urls = df['photo_image_url'].dropna().sample(n=max_images, random_state=42).tolist()
    except Exception as e:
        print(f"Lỗi khi đọc file TSV: {e}")
        return
    
    total_images = len(image_urls)
    print(f"\nTìm thấy {total_images} URL ảnh. Bắt đầu tải và xử lý...\n")
    
    success_count = 0
    error_count = 0

    for idx, url in enumerate(image_urls, 1):
        qdrant_point_id = str(uuid.uuid4())
        
        try:
            # --- BƯỚC 1: TẢI ẢNH VÀO RAM ---
            optimize_url = f"{url}?w=600" if "?" not in url else url
            response = requests.get(optimize_url, stream=True, timeout=10)
            response.raise_for_status()
            
            image_bytes = response.content
            pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            
            # --- BƯỚC 2: XỬ LÝ AI ---
            vector = clip.embed_image(pil_image)
            ocr_texts_list = ocr.extract_text(image_bytes)
            ocr_text_combined = " ".join(ocr_texts_list) if ocr_texts_list else ""
            
            if vector is None:
                raise ValueError("Không thể trích xuất vector.")

            filename = f"unsplash_{url.split('/')[-1].split('?')[0]}"

            # --- BƯỚC 3: INSERT VÀO BẢNG `images` ---
            pg_cursor.execute("""
                INSERT INTO images (storage_path, original_filename, source_type, status) 
                VALUES (%s, %s, %s, %s) 
                RETURNING id;
            """, (url, filename, 'dataset', 'indexed'))
            
            image_id_int = pg_cursor.fetchone()[0]

            # --- BƯỚC 4: INSERT VÀO BẢNG `image_embeddings` ---
            pg_cursor.execute("""
                INSERT INTO image_embeddings (image_id, qdrant_point_id, collection_name, model_name, embedding_dim, vector_status)
                VALUES (%s, %s, %s, %s, %s, %s);
            """, (image_id_int, qdrant_point_id, COLLECTION_NAME, 'clip-vit-base-patch32', 512, 'synced'))

            # --- BƯỚC 5: INSERT VÀO BẢNG `ocr_texts` ---
            pg_cursor.execute("""
                INSERT INTO ocr_texts (image_id, raw_text)
                VALUES (%s, %s);
            """, (image_id_int, ocr_text_combined))

            # --- BƯỚC 6: INSERT VÀO QDRANT ---
            qdrant_client.upsert(
                collection_name=COLLECTION_NAME,
                points=[
                    models.PointStruct(
                        id=qdrant_point_id,
                        vector=vector,
                        payload={"storage_path": url, "image_id_int": image_id_int}
                    )
                ]
            )
            
            pg_conn.commit()
            success_count += 1
            if idx % 10 == 0 or idx == total_images:
                print(f"[{idx}/{total_images}] Thành công: Đã index URL {filename}")
            
        except Exception as e:
            error_count += 1
            pg_conn.rollback()
            print(f"[{idx}/{total_images}] LỖI tại URL {url}: {e}")

    print("\n--- TỔNG KẾT BATCH INDEXING ---")
    print(f"Hoàn thành: {success_count}/{total_images} ảnh.")
    print(f"Lỗi: {error_count} ảnh.")
    
    pg_cursor.close()
    pg_conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Chạy hệ thống Batch Indexing cho AI Service từ URL Cloud")
    
    current_script_dir = os.path.dirname(os.path.abspath(__file__))
    
    default_tsv_path = os.path.abspath(os.path.join(current_script_dir, "..", "data", "unsplash-lite", "photos.tsv000"))
    
    # Định nghĩa cờ cấu hình khi gõ lệnh
    parser.add_argument(
        "--tsv", 
        type=str, 
        default=default_tsv_path,
        help="Đường dẫn đến file dữ liệu tsv của Unsplash Lite"
    )
    parser.add_argument(
        "--max", 
        type=int, 
        default=2000,
        help="Số lượng ảnh tối đa muốn trích xuất và lưu trữ"
    )
    
    args = parser.parse_args()
    
    print("=" * 60)
    print(f"[*] File dữ liệu được chỉ định: {args.tsv}")
    print(f"[*] Số lượng ảnh xử lý tối đa: {args.max}")
    print("=" * 60)
    
    if os.path.exists(args.tsv):
        run_batch_indexing_from_urls(args.tsv, max_images=args.max)
    else:
        print(f"[!] LỖI HỆ THỐNG: Không tìm thấy file dữ liệu tại đường dẫn mục tiêu:")
        print(f"    --> {args.tsv}")
        print("\nGợi ý giải quyết:")
        print("1. Kiểm tra lại vị trí của thư mục 'data' so với thư mục chứa script hiện tại.")
        print("2. Tự truyền đường dẫn tuyệt đối bằng cách sử dụng tham số --tsv khi chạy lệnh.")
        print("   Ví dụ: python batch_indexing.py --tsv D:/TTT7/Visual-Search-Engine/AI/data/unsplash-lite/photos.tsv000")
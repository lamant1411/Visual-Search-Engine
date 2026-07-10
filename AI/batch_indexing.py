import os
import uuid
import psycopg2
from qdrant_client import QdrantClient
from qdrant_client.http import models

# Import các module AI đã hoàn thiện từ W2 và W3
from clip_module import CLIPEmbedder
from ocr_module import OCRExtractor

# ==========================================
# CẤU HÌNH KẾT NỐI DATABASE
# ==========================================
POSTGRES_CONFIG = {
    "dbname": "visual_search",
    "user": "postgres",
    "password": "postgres",
    "host": "localhost",
    "port": "5432"
}
QDRANT_URL = "http://localhost:6333"
COLLECTION_NAME = "images_collection"

def connect_databases():
    """Chỉ kết nối DB. Việc tạo bảng (CREATE TABLE) giờ là nhiệm vụ của Alembic bên BE."""
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

def run_batch_indexing(image_folder: str):
    print("Đang khởi tạo các mô hình AI (CLIP & EasyOCR)...")
    clip = CLIPEmbedder()
    ocr = OCRExtractor()
    
    pg_conn, pg_cursor, qdrant_client = connect_databases()
    
    valid_extensions = ('.jpg', '.jpeg', '.png', '.webp')
    image_files = [f for f in os.listdir(image_folder) if f.lower().endswith(valid_extensions)]
    
    total_images = len(image_files)
    print(f"\nTìm thấy {total_images} ảnh. Bắt đầu xử lý...\n")
    
    success_count = 0
    error_count = 0

    for idx, filename in enumerate(image_files, 1):
        file_path = os.path.join(image_folder, filename)
        
        # 1. Tạo UUID riêng cho Qdrant (Do BE không dùng UUID làm khóa chính nữa)
        qdrant_point_id = str(uuid.uuid4())
        
        try:
            # --- BƯỚC 1: XỬ LÝ AI ---
            vector = clip.embed_image(file_path)
            ocr_texts_list = ocr.extract_text(file_path)
            ocr_text_combined = " ".join(ocr_texts_list) if ocr_texts_list else ""
            
            if vector is None:
                raise ValueError("Không thể trích xuất vector.")

            # --- BƯỚC 2: INSERT VÀO BẢNG `images` (Lấy lại ID số nguyên) ---
            # Trạng thái 'indexed', nguồn 'dataset' (Khớp với Enum native_enum=False của BE)
            pg_cursor.execute("""
                INSERT INTO images (storage_path, original_filename, source_type, status) 
                VALUES (%s, %s, %s, %s) 
                RETURNING id;
            """, (file_path, filename, 'dataset', 'indexed'))
            
            # Lấy ID số nguyên tự động tăng do Postgres cấp
            image_id_int = pg_cursor.fetchone()[0]

            # --- BƯỚC 3: INSERT VÀO BẢNG `image_embeddings` ---
            pg_cursor.execute("""
                INSERT INTO image_embeddings (image_id, qdrant_point_id, collection_name, model_name, embedding_dim, vector_status)
                VALUES (%s, %s, %s, %s, %s, %s);
            """, (image_id_int, qdrant_point_id, COLLECTION_NAME, 'clip-vit-base-patch32', 512, 'synced'))

            # --- BƯỚC 4: INSERT VÀO BẢNG `ocr_texts` ---
            pg_cursor.execute("""
                INSERT INTO ocr_texts (image_id, raw_text)
                VALUES (%s, %s);
            """, (image_id_int, ocr_text_combined))

            # --- BƯỚC 5: INSERT VÀO QDRANT ---
            qdrant_client.upsert(
                collection_name=COLLECTION_NAME,
                points=[
                    models.PointStruct(
                        id=qdrant_point_id, # Dùng UUID để link với bảng image_embeddings
                        vector=vector,
                        payload={"storage_path": file_path, "image_id_int": image_id_int}
                    )
                ]
            )
            
            # Chốt giao dịch cho bức ảnh này
            pg_conn.commit()
            
            success_count += 1
            if idx % 10 == 0 or idx == total_images:
                print(f"[{idx}/{total_images}] Thành công: Đã index {filename}")
            
        except Exception as e:
            error_count += 1
            pg_conn.rollback() # Hoàn tác nếu lỗi 1 khâu bất kỳ
            print(f"[{idx}/{total_images}] LỖI tại {filename}: {e}")

    print("\n--- TỔNG KẾT BATCH INDEXING ---")
    print(f"Hoàn thành: {success_count}/{total_images} ảnh.")
    print(f"Lỗi: {error_count} ảnh.")
    
    pg_cursor.close()
    pg_conn.close()

if __name__ == "__main__":
    DATASET_FOLDER = "./data/dataset_2000_images" 
    if os.path.exists(DATASET_FOLDER):
        run_batch_indexing(DATASET_FOLDER)
    else:
        print(f"Lỗi: Không tìm thấy thư mục {DATASET_FOLDER}.")
import argparse
import io
import os
import uuid
from typing import Optional

import pandas as pd
import psycopg2
import requests
from PIL import Image
from qdrant_client import QdrantClient
from qdrant_client.http import models

from clip_module import CLIPEmbedder
from ocr_module import OCRExtractor


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


def insert_indexed_image(
    pg_cursor,
    qdrant_client: QdrantClient,
    *,
    storage_path: str,
    original_filename: str,
    vector: list[float],
    ocr_text: str,
) -> int:
    qdrant_point_id = str(uuid.uuid4())

    pg_cursor.execute(
        """
        INSERT INTO images (storage_path, original_filename, source_type, status)
        VALUES (%s, %s, %s, %s)
        RETURNING id;
        """,
        (storage_path, original_filename, "dataset", "indexed"),
    )
    image_id = pg_cursor.fetchone()[0]

    pg_cursor.execute(
        """
        INSERT INTO image_embeddings (image_id, qdrant_point_id, collection_name, model_name, embedding_dim, vector_status)
        VALUES (%s, %s, %s, %s, %s, %s);
        """,
        (image_id, qdrant_point_id, COLLECTION_NAME, MODEL_NAME, EMBEDDING_DIM, "synced"),
    )

    pg_cursor.execute(
        """
        INSERT INTO ocr_texts (image_id, raw_text)
        VALUES (%s, %s);
        """,
        (image_id, ocr_text),
    )

    qdrant_client.upsert(
        collection_name=COLLECTION_NAME,
        points=[
            models.PointStruct(
                id=qdrant_point_id,
                vector=vector,
                payload={"storage_path": storage_path, "image_id": image_id, "image_id_int": image_id},
            )
        ],
    )

    return image_id


def run_batch_indexing_from_urls(tsv_path: str, max_images: int = 2000):
    print("Dang khoi tao cac mo hinh AI (CLIP & EasyOCR)...")
    clip = CLIPEmbedder()
    ocr = OCRExtractor()

    pg_conn, pg_cursor, qdrant_client = connect_databases()

    print(f"Dang doc file du lieu {tsv_path}...")
    try:
        df = pd.read_csv(tsv_path, sep="\t", low_memory=False)
        image_urls = df["photo_image_url"].dropna().sample(n=max_images, random_state=42).tolist()
    except Exception as e:
        print(f"Loi khi doc file TSV: {e}")
        return

    total_images = len(image_urls)
    print(f"\nTim thay {total_images} URL anh. Bat dau tai va xu ly...\n")

    success_count = 0
    error_count = 0

    for idx, url in enumerate(image_urls, 1):
        try:
            optimize_url = f"{url}?w=600" if "?" not in url else url
            response = requests.get(optimize_url, stream=True, timeout=10)
            response.raise_for_status()

            image_bytes = response.content
            pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

            vector = clip.embed_image(pil_image)
            ocr_texts_list = ocr.extract_text(image_bytes)
            ocr_text_combined = " ".join(ocr_texts_list) if ocr_texts_list else ""

            if vector is None:
                raise ValueError("Khong the trich xuat vector.")

            filename = f"unsplash_{url.split('/')[-1].split('?')[0]}"
            insert_indexed_image(
                pg_cursor,
                qdrant_client,
                storage_path=url,
                original_filename=filename,
                vector=vector,
                ocr_text=ocr_text_combined,
            )

            pg_conn.commit()
            success_count += 1
            if idx % 10 == 0 or idx == total_images:
                print(f"[{idx}/{total_images}] Thanh cong: Da index URL {filename}")

        except Exception as e:
            error_count += 1
            pg_conn.rollback()
            print(f"[{idx}/{total_images}] LOI tai URL {url}: {e}")

    print("\n--- TONG KET BATCH INDEXING URL ---")
    print(f"Hoan thanh: {success_count}/{total_images} anh.")
    print(f"Loi: {error_count} anh.")

    pg_cursor.close()
    pg_conn.close()


def collect_local_images(image_folder: str, max_images: Optional[int] = None) -> list[str]:
    image_paths: list[str] = []

    for root, _, files in os.walk(image_folder):
        for filename in files:
            if filename.lower().endswith(VALID_IMAGE_EXTENSIONS):
                image_paths.append(os.path.join(root, filename))

    image_paths.sort()
    if max_images is not None and max_images > 0:
        return image_paths[:max_images]
    return image_paths


def build_local_storage_path(image_folder: str, image_path: str, storage_prefix: str) -> str:
    relative_path = os.path.relpath(image_path, image_folder).replace("\\", "/")
    return f"{storage_prefix.rstrip('/')}/{relative_path}"


def run_batch_indexing_from_local_folder(
    image_folder: str,
    max_images: Optional[int] = None,
    storage_prefix: str = LOCAL_STORAGE_PREFIX,
):
    print("Dang khoi tao cac mo hinh AI (CLIP & EasyOCR)...")
    clip = CLIPEmbedder()
    ocr = OCRExtractor()

    pg_conn, pg_cursor, qdrant_client = connect_databases()

    image_files = collect_local_images(image_folder, max_images=max_images)
    total_images = len(image_files)
    print(f"\nTim thay {total_images} anh local. Bat dau xu ly...\n")

    success_count = 0
    error_count = 0

    for idx, file_path in enumerate(image_files, 1):
        filename = os.path.basename(file_path)
        storage_path = build_local_storage_path(image_folder, file_path, storage_prefix)

        try:
            # AI doc file local de embed/OCR, DB luu path ma BE serve duoc cho FE.
            vector = clip.embed_image(file_path)
            ocr_texts_list = ocr.extract_text(file_path)
            ocr_text_combined = " ".join(ocr_texts_list) if ocr_texts_list else ""

            if vector is None:
                raise ValueError("Khong the trich xuat vector.")

            insert_indexed_image(
                pg_cursor,
                qdrant_client,
                storage_path=storage_path,
                original_filename=filename,
                vector=vector,
                ocr_text=ocr_text_combined,
            )

            pg_conn.commit()
            success_count += 1
            if idx % 10 == 0 or idx == total_images:
                print(f"[{idx}/{total_images}] Thanh cong: Da index local {storage_path}")

        except Exception as e:
            error_count += 1
            pg_conn.rollback()
            print(f"[{idx}/{total_images}] LOI tai file {file_path}: {e}")

    print("\n--- TONG KET BATCH INDEXING LOCAL ---")
    print(f"Hoan thanh: {success_count}/{total_images} anh.")
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

    parser.add_argument(
        "--mode",
        choices=("urls", "local"),
        default="urls",
        help="Chon urls de index Unsplash TSV, chon local de index folder anh local",
    )
    parser.add_argument(
        "--tsv",
        type=str,
        default=default_tsv_path,
        help="Duong dan den file TSV cua Unsplash Lite",
    )
    parser.add_argument(
        "--image-folder",
        type=str,
        default=default_local_folder,
        help="Thu muc chua anh local, nen trung voi backend/static/images",
    )
    parser.add_argument(
        "--storage-prefix",
        type=str,
        default=LOCAL_STORAGE_PREFIX,
        help="Prefix luu vao images.storage_path cho anh local",
    )
    parser.add_argument(
        "--max",
        type=int,
        default=2000,
        help="So luong anh toi da muon index",
    )

    args = parser.parse_args()

    print("=" * 60)
    print(f"[*] Mode: {args.mode}")
    print(f"[*] File TSV: {args.tsv}")
    print(f"[*] Thu muc anh local: {args.image_folder}")
    print(f"[*] So luong anh xu ly toi da: {args.max}")
    print("=" * 60)

    if args.mode == "local":
        if os.path.isdir(args.image_folder):
            run_batch_indexing_from_local_folder(
                args.image_folder,
                max_images=args.max,
                storage_prefix=args.storage_prefix,
            )
        else:
            print(f"[!] LOI HE THONG: Khong tim thay thu muc anh local: {args.image_folder}")
    elif os.path.exists(args.tsv):
        run_batch_indexing_from_urls(args.tsv, max_images=args.max)
    else:
        print("[!] LOI HE THONG: Khong tim thay file TSV.")
        print(f"    --> {args.tsv}")

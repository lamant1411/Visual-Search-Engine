import os
import csv
import random
import requests
from PIL import Image
from io import BytesIO

def download_and_prepare_unsplash(tsv_file_path, dest_dir, target_count=2000, max_size=(800, 800)):
    """
    Đọc link ảnh từ file TSV của Unsplash, tải ngẫu nhiên và resize về thư mục đích.
    """
    if not os.path.exists(dest_dir):
        os.makedirs(dest_dir)
        print(f"Đã tạo thư mục: {dest_dir}")

    print(f"Đang đọc file {tsv_file_path}...")
    
    # 1. Đọc file TSV để lấy danh sách URL
    urls = []
    try:
        with open(tsv_file_path, 'r', encoding='utf-8') as f:
            reader = csv.reader(f, delimiter='\t')
            headers = next(reader) # Bỏ qua dòng tiêu đề
            
            
            try:
                url_idx = headers.index('photo_image_url')
            except ValueError:
                url_idx = 2 

            for row in reader:
                if len(row) > url_idx and row[url_idx]:
                    urls.append(row[url_idx])
    except Exception as e:
        print(f"Lỗi khi đọc file TSV: {e}")
        return

    print(f"Tìm thấy {len(urls)} link ảnh trong file.")
    
    # 2. Lấy mẫu ngẫu nhiên
    if len(urls) < target_count:
        selected_urls = urls
    else:
        selected_urls = random.sample(urls, target_count)

    print(f"\nBắt đầu tải và xử lý {len(selected_urls)} ảnh từ Internet...")
    success_count = 0

    for idx, img_url in enumerate(selected_urls, 1):
        download_url = f"{img_url}&w=800" if "?" in img_url else f"{img_url}?w=800"
            
        dest_path = os.path.join(dest_dir, f"unsplash_{idx:04d}.jpg")

        try:
            # 3. Tải ảnh về
            response = requests.get(download_url, timeout=10)
            response.raise_for_status()
            
            # 4. Mở, resize và lưu ảnh
            with Image.open(BytesIO(response.content)) as img:
                img = img.convert("RGB")
                img.thumbnail(max_size, Image.Resampling.LANCZOS)
                img.save(dest_path, format="JPEG", quality=85)

            success_count += 1
            if idx % 50 == 0:
                print(f"Đã tải và xử lý [{idx}/{len(selected_urls)}] ảnh...")

        except Exception as e:
            print(f"Lỗi tải ảnh {idx}: Bỏ qua...")

    print(f"\n--- HOÀN THÀNH ---")
    print(f"Đã tải thành công: {success_count} ảnh.")
    print(f"Dữ liệu sẵn sàng tại: {dest_dir}")

if __name__ == "__main__":
    BASE_DIR = os.path.abspath(os.path.dirname(__file__))
    PROJECT_ROOT = os.path.dirname(BASE_DIR)

    TSV_FILE = os.path.join(BASE_DIR, "data", "unsplash-lite", "photos.tsv000")
    DESTINATION_FOLDER = os.path.abspath(os.path.join(os.path.dirname(PROJECT_ROOT), "data", "dataset_2000_images"))

    download_and_prepare_unsplash(
        tsv_file_path=TSV_FILE,
        dest_dir=DESTINATION_FOLDER,
        target_count=2000,
        max_size=(800, 800)
    )
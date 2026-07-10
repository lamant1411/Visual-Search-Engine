import easyocr
import os

class OCRExtractor:
    def __init__(self, langs=['en', 'vi'], use_gpu=True):
        """
        Khởi tạo mô hình EasyOCR.
        """
        print(f"Đang tải mô hình EasyOCR cho các ngôn ngữ: {langs}...")
        self.reader = easyocr.Reader(langs, gpu=use_gpu)
        print("Tải mô hình OCR thành công!\n")

    def extract_text(self, image_path: str) -> list:
        """
        Đọc ảnh và trích xuất các dòng chữ xuất hiện trong ảnh.
        Đầu ra: Danh sách các chuỗi văn bản thuần túy (list[str]).
        """
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"Không tìm thấy ảnh tại: {image_path}")
        
        valid_extensions = ('.jpg', '.jpeg', '.png', '.webp')
        if not image_path.lower().endswith(valid_extensions):
            raise ValueError(f"Định dạng không hợp lệ. Vui lòng dùng: {valid_extensions}")

        try:
            # Tham số detail=0 để hàm chỉ trả về danh sách văn bản thuần túy,
            # loại bỏ các thông tin tọa độ bounding box và độ tự tin (confidence score).
            results = self.reader.readtext(image_path, detail=0)
            return results
        
        except Exception as e:
            print(f"Lỗi khi trích xuất OCR: {e}")
            return []
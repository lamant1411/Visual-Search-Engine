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

    def extract_text(self, image_input) -> list:
        """
        Đọc ảnh và trích xuất các dòng chữ xuất hiện trong ảnh.
        Đầu vào: Đường dẫn ảnh (str) hoặc Mảng bytes (bytes).
        Đầu ra: Danh sách các chuỗi văn bản thuần túy (list[str]).
        """
        try:
            if isinstance(image_input, str):
                if not os.path.exists(image_input):
                    raise FileNotFoundError("Không tìm thấy ảnh tại đường dẫn đã cung cấp.")
                
                valid_extensions = ('.jpg', '.jpeg', '.png', '.webp')
                if not image_input.lower().endswith(valid_extensions):
                    raise ValueError(f"Định dạng không hợp lệ. Vui lòng dùng: {valid_extensions}")

            results = self.reader.readtext(image_input, detail=0)
            return results
        
        except Exception as e:
            print(f"Lỗi khi trích xuất OCR: {e}")
            return []
import torch
from PIL import Image
from transformers import CLIPProcessor, CLIPModel
import os
import io
from deep_translator import GoogleTranslator

class CLIPEmbedder:
    def __init__(self, model_id="openai/clip-vit-base-patch32"):
        print(f"Đang tải mô hình {model_id}...")
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model = CLIPModel.from_pretrained(model_id).to(self.device)
        self.processor = CLIPProcessor.from_pretrained(model_id, use_fast=True)
        
        # Khởi tạo bộ dịch
        self.translator = GoogleTranslator(source='auto', target='en')
        print(f"Tải mô hình thành công trên {self.device.upper()}!\n")

    def embed_image(self, image_input) -> list:
        """
        Đọc ảnh từ đường dẫn, mảng bytes, hoặc đối tượng PIL Image và chuyển đổi thành vector 512 chiều.
        """
        try:
            # 1. Xử lý nếu đầu vào là đường dẫn file
            if isinstance(image_input, str):
                if not os.path.exists(image_input):
                    raise FileNotFoundError(f"Không tìm thấy ảnh tại: {image_input}")

                valid_extensions = ('.jpg', '.jpeg', '.png', '.webp')
                if not image_input.lower().endswith(valid_extensions):
                    raise ValueError(f"Định dạng không hợp lệ. Vui lòng dùng: {valid_extensions}")
                
                image = Image.open(image_input).convert("RGB")

            # 2. Xử lý nếu đầu vào là mảng bytes 
            elif isinstance(image_input, bytes):
                image = Image.open(io.BytesIO(image_input)).convert("RGB")

            # 3. Xử lý nếu đầu vào đã là một bức ảnh được mở sẵn
            elif isinstance(image_input, Image.Image):
                image = image_input.convert("RGB")
                
            else:
                raise TypeError("Đầu vào phải là đường dẫn (str), mảng bytes, hoặc đối tượng PIL.Image")

            # Đưa ảnh vào mô hình để trích xuất đặc trưng
            inputs = self.processor(images=image, return_tensors="pt").to(self.device)
            
            with torch.no_grad():
                image_features = self.model.get_image_features(**inputs)
                
            return image_features.cpu().numpy().flatten().tolist()
        
        except Exception as e:
            print(f"Lỗi khi xử lý ảnh trong mô hình CLIP: {e}")
            return None

    def embed_text(self, query: str) -> list:
        """
        Dịch truy vấn và chuyển thành vector 512 chiều.
        """
        if not query or not query.strip():
            raise ValueError("Query tìm kiếm không được để trống.")

        try:
            # 1. Tiền xử lý: Dịch truy vấn sang tiếng Anh một cách tự động
            translated_query = self.translator.translate(query)
            print(f"[AI Service] Query gốc: '{query}' -> Đã dịch: '{translated_query}'")
            
            # 2. Đưa câu tiếng Anh vào mô hình CLIP gốc
            inputs = self.processor(text=[translated_query], return_tensors="pt", padding=True).to(self.device)
            
            with torch.no_grad():
                text_features = self.model.get_text_features(**inputs)
                
            return text_features.cpu().numpy().flatten().tolist()
        
        except Exception as e:
            print(f"Lỗi khi xử lý text trong mô hình CLIP: {e}")
            return None
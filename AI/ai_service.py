import io
import sys
from pathlib import Path

import uvicorn
from fastapi import FastAPI, UploadFile, File, Form
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))
from clip_module import CLIPEmbedder

app = FastAPI(title="Visual Search - AI Service")

print("Đang tải mô hình CLIP cho API Service...")
clip_model = CLIPEmbedder()
print("Mô hình đã sẵn sàng!")

@app.post("/api/embed/text")
async def embed_text(text: str = Form(...)):
    """API biến văn bản tìm kiếm thành Vector 512 chiều (CLIP text encoder)."""
    vector = clip_model.embed_text(text)
    if vector is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail="Không thể tạo embedding cho text.")
    return {"vector": vector}

@app.post("/api/embed/image")
async def embed_image(file: UploadFile = File(...)):
    """API biến ảnh upload thành Vector 512 chiều (CLIP image encoder)."""
    image_data = await file.read()
    image = Image.open(io.BytesIO(image_data)).convert("RGB")
    vector = clip_model.embed_image(image)
    if vector is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail="Không thể tạo embedding cho ảnh.")
    return {"vector": vector}

if __name__ == "__main__":
    uvicorn.run("ai_service:app", host="0.0.0.0", port=8001, reload=True)

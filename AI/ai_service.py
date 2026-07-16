import io
import os
import sys
from pathlib import Path

import uvicorn
from fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks
from pydantic import BaseModel
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))
from src.clip_module import CLIPEmbedder
from src.batch_indexing import run_batch_indexing_from_urls, run_batch_indexing_from_local_folder

app = FastAPI(title="Visual Search - AI Service")

print("Đang tải mô hình CLIP cho API Service...")
clip_model = CLIPEmbedder()
print("Mô hình đã sẵn sàng!")

@app.post("/api/embed/text")
async def embed_text(text: str = Form(...)):
    """API biến văn bản tìm kiếm thành Vector"""
    try:
        vector = clip_model.embed_text(text)
        return {"status": "success", "vector": vector}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.post("/api/embed/image")
async def embed_image(file: UploadFile = File(...)):
    """API biến ảnh upload thành Vector"""
    try:
        image_data = await file.read()
        image = Image.open(io.BytesIO(image_data)).convert("RGB")
        vector = clip_model.embed_image(image)
        return {"status": "success", "vector": vector}
    except Exception as e:
        return {"status": "error", "message": str(e)}



class IndexingRequest(BaseModel):
    mode: str = "urls" 
    target_path: str = None 
    max_images: int = 2000

@app.post("/api/index/trigger")
async def trigger_indexing(request: IndexingRequest, background_tasks: BackgroundTasks):
    """API kích hoạt quá trình nạp dữ liệu"""
    current_dir = os.path.dirname(os.path.abspath(__file__))
    
    # 1. Chế độ cào ảnh từ URL
    if request.mode == "urls":
        tsv_path = request.target_path or os.path.join(current_dir, "data", "unsplash-lite", "photos.tsv000")
        if not os.path.exists(tsv_path):
            return {"status": "error", "message": f"Không tìm thấy file TSV tại: {tsv_path}"}
            
        background_tasks.add_task(run_batch_indexing_from_urls, tsv_path, request.max_images)
        return {
            "status": "success", 
            "message": f"Đã kích hoạt cào URL ngầm (Tối đa {request.max_images} ảnh).",
            "path": tsv_path
        }
        
    # 2. Chế độ quét ảnh trong máy tính
    elif request.mode == "local":
        folder_path = request.target_path or os.path.abspath(os.path.join(current_dir, "..", "backend", "static", "images"))
        if not os.path.isdir(folder_path):
            return {"status": "error", "message": f"Không tìm thấy thư mục ảnh tại: {folder_path}"}
            
        background_tasks.add_task(run_batch_indexing_from_local_folder, folder_path, request.max_images)
        return {
            "status": "success", 
            "message": f"Đã kích hoạt quét ảnh Local ngầm (Tối đa {request.max_images} ảnh).",
            "path": folder_path
        }
        
    return {"status": "error", "message": "Mode không hợp lệ. Vui lòng truyền 'urls' hoặc 'local'."}

if __name__ == "__main__":
    uvicorn.run("ai_service:app", host="0.0.0.0", port=8001, reload=True)
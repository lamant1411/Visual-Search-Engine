import io
import sys
import uuid
from pathlib import Path
from threading import Lock
from typing import Optional

import uvicorn
from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

from src.clip_module import CLIPEmbedder
from src.batch_indexing import LOCAL_STORAGE_PREFIX, VALID_IMAGE_EXTENSIONS, run_indexing_pipeline
from src.ocr_module import OCRExtractor

app = FastAPI(title="Visual Search - AI Service")

print("Dang tai cac mo hinh AI cho API Service...")
clip_model = CLIPEmbedder()
ocr_model = OCRExtractor()
print("Cac mo hinh da san sang!")

INDEXING_JOBS: dict[str, dict] = {}
INDEXING_LOCK = Lock()


class LocalIndexRequest(BaseModel):
    batch_id: Optional[str] = None
    image_folder: str = "/app/static/images"
    storage_prefix: str = LOCAL_STORAGE_PREFIX
    source_type: str = Field(default="upload", pattern="^(dataset|upload)$")
    max_images: int = Field(default=2000, ge=1)
    run_all: bool = False


class IndexStartResponse(BaseModel):
    batch_id: str
    status: str
    total_images: int


class IndexStatusResponse(BaseModel):
    batch_id: str
    status: str
    total_images: int = 0
    processed_images: int = 0
    failed_images: int = 0
    error_message: Optional[str] = None


@app.post("/api/embed/text")
async def embed_text(text: str = Form(...)):
    """Bien text tim kiem thanh vector CLIP."""
    try:
        vector = clip_model.embed_text(text)
        return {"status": "success", "vector": vector}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/api/embed/image")
async def embed_image(file: UploadFile = File(...)):
    """Bien anh upload thanh vector CLIP."""
    try:
        image_data = await file.read()
        image = Image.open(io.BytesIO(image_data)).convert("RGB")
        vector = clip_model.embed_image(image)
        return {"status": "success", "vector": vector}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/api/index/local", response_model=IndexStartResponse)
async def start_local_indexing(request: LocalIndexRequest, background_tasks: BackgroundTasks):
    """Kich hoat batch indexing cho folder anh local do BE vua upload."""
    image_folder = Path(request.image_folder)
    if not image_folder.is_dir():
        raise HTTPException(status_code=400, detail=f"Image folder not found: {request.image_folder}")

    batch_id = request.batch_id or f"idx_{uuid.uuid4().hex[:12]}"
    if batch_id in INDEXING_JOBS and INDEXING_JOBS[batch_id]["status"] in {"queued", "running"}:
        raise HTTPException(status_code=409, detail=f"Indexing batch is already running: {batch_id}")

    total_images = _count_indexable_images(image_folder, request.max_images, request.run_all)
    INDEXING_JOBS[batch_id] = {
        "batch_id": batch_id,
        "status": "queued",
        "total_images": total_images,
        "processed_images": 0,
        "failed_images": 0,
        "error_message": None,
    }

    background_tasks.add_task(_run_local_indexing_job, batch_id, request)
    return IndexStartResponse(batch_id=batch_id, status="queued", total_images=total_images)


@app.get("/api/index/status/{batch_id}", response_model=IndexStatusResponse)
async def get_index_status(batch_id: str):
    """Tra ve trang thai batch indexing dang luu trong AI service."""
    job = INDEXING_JOBS.get(batch_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Indexing batch not found: {batch_id}")
    return IndexStatusResponse(**job)


def _run_local_indexing_job(batch_id: str, request: LocalIndexRequest) -> None:
    job = INDEXING_JOBS[batch_id]
    try:
        with INDEXING_LOCK:
            job["status"] = "running"

            def update_progress(processed_images: int, failed_images: int) -> None:
                job["processed_images"] = min(processed_images, job["total_images"])
                job["failed_images"] = failed_images

            run_indexing_pipeline(
                mode="local",
                target_path=request.image_folder,
                max_images=request.max_images,
                run_all=request.run_all,
                storage_prefix=request.storage_prefix,
                source_type=request.source_type,
                clip_model=clip_model,
                ocr_model=ocr_model,
                progress_callback=update_progress,
            )
        job["status"] = "completed"
        job["processed_images"] = job["total_images"]
    except Exception as exc:
        job["status"] = "failed"
        job["failed_images"] = max(job["total_images"] - job["processed_images"], 1)
        job["error_message"] = str(exc)


def _count_indexable_images(image_folder: Path, max_images: int, run_all: bool) -> int:
    image_paths = [
        path
        for path in image_folder.rglob("*")
        if path.is_file() and path.suffix.lower() in VALID_IMAGE_EXTENSIONS
    ]
    if run_all:
        return len(image_paths)
    return min(len(image_paths), max_images)


if __name__ == "__main__":
    uvicorn.run("ai_service:app", host="0.0.0.0", port=8001, reload=True)

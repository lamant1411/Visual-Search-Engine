from contextlib import asynccontextmanager
import io
import queue
import sys
import uuid
from pathlib import Path
from threading import Event, Lock, Thread, Timer
from typing import Optional

import uvicorn
from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

from cpu_runtime import CPU_SETTINGS
from src.clip_module import CLIPEmbedder
from src.batch_indexing import LOCAL_STORAGE_PREFIX, VALID_IMAGE_EXTENSIONS, run_indexing_pipeline
from src.item_indexing import (
    IndexQueueItem,
    claim_indexing_item,
    handle_index_failure,
    index_single_image_item,
    prepare_items_for_queue,
    recover_pending_items,
    recover_running_item,
)
from src.ocr_module import OCRExtractor

print("Dang tai cac mo hinh AI cho API Service...")
clip_model = CLIPEmbedder()
ocr_model = OCRExtractor()
print("Cac mo hinh da san sang!")

MAX_INDEX_WORKERS = CPU_SETTINGS.item_workers
INDEX_ITEM_QUEUE: queue.Queue[Optional[IndexQueueItem]] = queue.Queue()
INDEX_WORKER_STOP = Event()
INDEX_WORKER_THREADS: list[Thread] = []

INDEXING_JOBS: dict[str, dict] = {}
INDEXING_LOCK = Lock()


@asynccontextmanager
async def lifespan(_: FastAPI):
    _start_index_workers()
    try:
        recovered_items = recover_pending_items()
        for item in recovered_items:
            INDEX_ITEM_QUEUE.put(item)
        if recovered_items:
            print(f"Da phuc hoi {len(recovered_items)} indexing items tu PostgreSQL.")
    except Exception as exc:
        print(f"Khong the phuc hoi indexing_items khi startup: {exc}")
    try:
        yield
    finally:
        _stop_index_workers()


app = FastAPI(title="Visual Search - AI Service", lifespan=lifespan)


@app.get("/health")
def healthcheck() -> dict[str, str]:
    """Readiness probe; this route exists only after both AI models are loaded."""
    return {"status": "ready"}


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


class IndexItemRequest(BaseModel):
    item_id: int = Field(ge=1)
    image_id: int = Field(ge=1)
    image_path: str = Field(min_length=1, max_length=2048)
    storage_path: str = Field(min_length=1, max_length=2048)
    original_filename: Optional[str] = None


class IndexItemsRequest(BaseModel):
    batch_id: str = Field(min_length=1, max_length=100)
    items: list[IndexItemRequest] = Field(min_length=1, max_length=1000)


class IndexItemsResponse(BaseModel):
    batch_id: str
    queued_items: int


@app.post("/api/embed/text")
async def embed_text(text: str = Form(...)):
    """Bien text tim kiem thanh vector CLIP."""
    try:
        vector = clip_model.embed_text(text)
        if vector is None:
            raise ValueError("Khong the tao embedding cho text.")
        return {"vector": vector}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/api/embed/image")
async def embed_image(file: UploadFile = File(...)):
    """Bien anh upload thanh vector CLIP."""
    try:
        image_data = await file.read()
        image = Image.open(io.BytesIO(image_data)).convert("RGB")
        vector = clip_model.embed_image(image)
        if vector is None:
            raise ValueError("Khong the tao embedding cho anh.")
        return {"vector": vector}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/api/index/items", response_model=IndexItemsResponse, status_code=202)
def enqueue_index_items(request: IndexItemsRequest):
    """Nhan danh sach anh BE vua upload va dua vao item-level queue."""
    try:
        queued_items = prepare_items_for_queue(
            request.batch_id,
            [item.model_dump() for item in request.items],
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not enqueue indexing items: {exc}") from exc

    for item in queued_items:
        INDEX_ITEM_QUEUE.put(item)
    return IndexItemsResponse(batch_id=request.batch_id, queued_items=len(queued_items))


def _start_index_workers() -> None:
    if INDEX_WORKER_THREADS:
        return
    INDEX_WORKER_STOP.clear()
    for worker_number in range(1, MAX_INDEX_WORKERS + 1):
        worker = Thread(
            target=_index_worker_loop,
            args=(worker_number,),
            name=f"index-item-worker-{worker_number}",
            daemon=True,
        )
        worker.start()
        INDEX_WORKER_THREADS.append(worker)
    worker_note = ""
    if CPU_SETTINGS.requested_item_workers != MAX_INDEX_WORKERS:
        worker_note = f" (requested={CPU_SETTINGS.requested_item_workers}, capped by CPU budget)"
    print(
        "CPU indexing runtime: "
        f"available={CPU_SETTINGS.available_cpus}, budget={CPU_SETTINGS.cpu_budget}, "
        f"workers={MAX_INDEX_WORKERS}{worker_note}, "
        f"torch_threads_per_inference={CPU_SETTINGS.torch_threads}, "
        f"torch_interop_threads={CPU_SETTINGS.torch_interop_threads}."
    )
    print(f"Da khoi dong {MAX_INDEX_WORKERS} item indexing workers.")


def _stop_index_workers() -> None:
    INDEX_WORKER_STOP.set()
    for _ in INDEX_WORKER_THREADS:
        INDEX_ITEM_QUEUE.put(None)
    for worker in INDEX_WORKER_THREADS:
        worker.join(timeout=5)
    INDEX_WORKER_THREADS.clear()


def _index_worker_loop(worker_number: int) -> None:
    while not INDEX_WORKER_STOP.is_set():
        try:
            queue_item = INDEX_ITEM_QUEUE.get(timeout=1)
        except queue.Empty:
            continue

        try:
            if queue_item is None:
                return
            try:
                item = claim_indexing_item(queue_item)
            except Exception as exc:
                print(f"[Item worker {worker_number}] Khong the claim item_id={queue_item.item_id}: {exc}")
                _schedule_retry(queue_item, 1)
                continue
            if item is None:
                continue

            try:
                index_single_image_item(item, clip_model, ocr_model)
                print(
                    f"[Item worker {worker_number}] Indexed image_id={item['image_id']} "
                    f"(item_id={item['item_id']})."
                )
            except Exception as exc:
                print(f"[Item worker {worker_number}] Loi item_id={queue_item.item_id}: {exc}")
                try:
                    retry_count = handle_index_failure(queue_item.item_id, exc)
                    if retry_count is not None:
                        _schedule_retry(queue_item, retry_count)
                except Exception as status_exc:
                    print(
                        f"[Item worker {worker_number}] Khong the ghi failure "
                        f"item_id={queue_item.item_id}: {status_exc}"
                    )
                    _schedule_running_recovery(queue_item, str(exc))
        finally:
            INDEX_ITEM_QUEUE.task_done()


def _schedule_retry(item: IndexQueueItem, retry_count: int) -> None:
    delay_seconds = min(2 ** max(retry_count - 1, 0), 30)

    def requeue() -> None:
        if not INDEX_WORKER_STOP.is_set():
            INDEX_ITEM_QUEUE.put(item)

    timer = Timer(delay_seconds, requeue)
    timer.daemon = True
    timer.start()


def _schedule_running_recovery(item: IndexQueueItem, error_message: str) -> None:
    def recover() -> None:
        if INDEX_WORKER_STOP.is_set():
            return
        try:
            should_requeue = recover_running_item(item.item_id, error_message)
        except Exception as exc:
            print(f"Khong the recovery running item_id={item.item_id}: {exc}")
            _schedule_running_recovery(item, error_message)
            return
        if should_requeue and not INDEX_WORKER_STOP.is_set():
            INDEX_ITEM_QUEUE.put(item)

    timer = Timer(5, recover)
    timer.daemon = True
    timer.start()


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

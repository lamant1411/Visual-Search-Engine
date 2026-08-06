"""Mirror already-indexed Unsplash Lite images to local static storage.

This command is intentionally download-only. It reads the indexed Unsplash URLs
from PostgreSQL, downloads the same resized representation used by the original
batch indexer, validates every file, and writes resumable audit reports. It does
not update PostgreSQL/Qdrant and does not run CLIP or OCR.

Recommended Docker usage from the repository root::

    docker compose exec ai_service python src/mirror_unsplash_to_local.py

Re-running the command is safe: valid local files are verified and skipped.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import csv
import hashlib
import json
import mimetypes
import os
import re
import threading
from collections import Counter
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from time import perf_counter
from typing import Iterable, Optional
from urllib.parse import urlsplit, urlunsplit

import psycopg2
import requests
from PIL import Image, UnidentifiedImageError
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


POSTGRES_CONFIG = {
    "dbname": os.getenv("POSTGRES_DB", "visual_search"),
    "user": os.getenv("POSTGRES_USER", "postgres"),
    "password": os.getenv("POSTGRES_PASSWORD", "postgres"),
    "host": os.getenv("POSTGRES_HOST", "localhost"),
    "port": os.getenv("POSTGRES_PORT", "5432"),
}

AI_ROOT = Path(__file__).resolve().parent.parent
PROJECT_ROOT = AI_ROOT.parent
DEFAULT_TSV = AI_ROOT / "data" / "unsplash-lite" / "photos.tsv000"
DEFAULT_DESTINATION = (
    Path("/app/static/images/unsplash-lite")
    if Path("/app/static/images").is_dir()
    else PROJECT_ROOT / "backend" / "static" / "images" / "unsplash-lite"
)
DEFAULT_REPORT_DIR = AI_ROOT / "output" / "unsplash-mirror"
DEFAULT_STORAGE_PREFIX = "/static/images/unsplash-lite"
UNSPLASH_URL_PREFIX = "https://images.unsplash.com/"
RETRYABLE_STATUS_CODES = (429, 500, 502, 503, 504)
MIME_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
CSV_FIELDS = (
    "image_id",
    "photo_id",
    "source_url",
    "download_url",
    "local_path",
    "local_storage_path",
    "status",
    "attempted_download",
    "expected_checksum",
    "actual_checksum",
    "checksum_match",
    "dimension_match",
    "mime_match",
    "bytes",
    "width",
    "height",
    "mime_type",
    "photo_url",
    "photographer_username",
    "error",
)

_thread_local = threading.local()


@dataclass(frozen=True)
class IndexedImage:
    image_id: int
    source_url: str
    original_filename: Optional[str]
    mime_type: Optional[str]
    expected_size: Optional[int]
    expected_width: Optional[int]
    expected_height: Optional[int]
    expected_checksum: Optional[str]


@dataclass(frozen=True)
class UnsplashMetadata:
    photo_id: str
    photo_url: str
    photographer_username: str


@dataclass(frozen=True)
class DownloadTask:
    image: IndexedImage
    photo: UnsplashMetadata
    download_url: str
    local_path: Path
    local_storage_path: str


@dataclass
class DownloadResult:
    image_id: int
    photo_id: str
    source_url: str
    download_url: str
    local_path: str
    local_storage_path: str
    status: str
    attempted_download: bool
    expected_checksum: str
    actual_checksum: str
    checksum_match: Optional[bool]
    dimension_match: Optional[bool]
    mime_match: Optional[bool]
    bytes: int
    width: Optional[int]
    height: Optional[int]
    mime_type: str
    photo_url: str
    photographer_username: str
    error: str


def canonical_image_url(url: str) -> str:
    """Normalize an Unsplash image URL for TSV-to-database matching."""
    raw_url = (url or "").strip()
    if not raw_url:
        return ""
    parts = urlsplit(raw_url)
    path = parts.path.rstrip("/") or "/"
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), path, "", ""))


def build_download_url(source_url: str, width: int) -> str:
    """Match the URL transformation used by batch_indexing.download_worker."""
    return f"{source_url}?w={width}" if "?" not in source_url else source_url


def safe_filename_component(value: str, fallback: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_-]+", "_", (value or "").strip()).strip("_")
    return cleaned or fallback


def extension_for_mime(mime_type: Optional[str], source_url: str) -> str:
    normalized_mime = (mime_type or "").split(";", maxsplit=1)[0].lower()
    if normalized_mime in MIME_EXTENSIONS:
        return MIME_EXTENSIONS[normalized_mime]

    suffix = Path(urlsplit(source_url).path).suffix.lower()
    if suffix in {".jpg", ".jpeg", ".png", ".webp"}:
        return ".jpg" if suffix == ".jpeg" else suffix
    return ".jpg"


def load_unsplash_metadata(tsv_path: Path) -> dict[str, UnsplashMetadata]:
    if not tsv_path.is_file():
        raise FileNotFoundError(f"Khong tim thay Unsplash TSV: {tsv_path}")

    by_image_url: dict[str, UnsplashMetadata] = {}
    with tsv_path.open("r", encoding="utf-8", newline="") as stream:
        reader = csv.DictReader(stream, delimiter="\t")
        required = {"photo_id", "photo_image_url"}
        missing = required - set(reader.fieldnames or ())
        if missing:
            raise ValueError(f"TSV thieu cot bat buoc: {', '.join(sorted(missing))}")

        for row in reader:
            image_url = canonical_image_url(row.get("photo_image_url", ""))
            photo_id = (row.get("photo_id") or "").strip()
            if not image_url or not photo_id:
                continue
            by_image_url.setdefault(
                image_url,
                UnsplashMetadata(
                    photo_id=photo_id,
                    photo_url=(row.get("photo_url") or "").strip(),
                    photographer_username=(row.get("photographer_username") or "").strip(),
                ),
            )
    return by_image_url


def load_indexed_images(limit: Optional[int] = None) -> list[IndexedImage]:
    query = """
        SELECT id, storage_path, original_filename, mime_type, file_size,
               width, height, checksum
        FROM images
        WHERE storage_path LIKE %s
          AND status = 'indexed'
          AND deleted_at IS NULL
        ORDER BY id
    """
    params: list[object] = [f"{UNSPLASH_URL_PREFIX}%"]
    if limit is not None:
        query += " LIMIT %s"
        params.append(limit)

    connection = psycopg2.connect(**POSTGRES_CONFIG)
    try:
        with connection.cursor() as cursor:
            cursor.execute(query, params)
            return [
                IndexedImage(
                    image_id=row[0],
                    source_url=row[1],
                    original_filename=row[2],
                    mime_type=row[3],
                    expected_size=row[4],
                    expected_width=row[5],
                    expected_height=row[6],
                    expected_checksum=row[7],
                )
                for row in cursor.fetchall()
            ]
    finally:
        connection.close()


def plan_tasks(
    images: Iterable[IndexedImage],
    metadata_by_url: dict[str, UnsplashMetadata],
    destination: Path,
    storage_prefix: str,
    width: int,
) -> tuple[list[DownloadTask], int]:
    tasks: list[DownloadTask] = []
    used_paths: dict[Path, int] = {}
    unmatched_count = 0

    for image in images:
        metadata = metadata_by_url.get(canonical_image_url(image.source_url))
        if metadata is None:
            unmatched_count += 1
            raw_name = Path(urlsplit(image.source_url).path).stem
            metadata = UnsplashMetadata(
                photo_id=safe_filename_component(raw_name, f"image_{image.image_id}"),
                photo_url="",
                photographer_username="",
            )

        safe_photo_id = safe_filename_component(metadata.photo_id, f"image_{image.image_id}")
        extension = extension_for_mime(image.mime_type, image.source_url)
        shard = safe_photo_id[:2].lower().ljust(2, "_")
        local_path = destination / shard / f"{safe_photo_id}{extension}"
        conflicting_image_id = used_paths.get(local_path)
        if conflicting_image_id is not None and conflicting_image_id != image.image_id:
            local_path = destination / shard / f"{safe_photo_id}_{image.image_id}{extension}"
        used_paths[local_path] = image.image_id

        relative_path = local_path.relative_to(destination).as_posix()
        tasks.append(
            DownloadTask(
                image=image,
                photo=metadata,
                download_url=build_download_url(image.source_url, width),
                local_path=local_path,
                local_storage_path=f"{storage_prefix.rstrip('/')}/{relative_path}",
            )
        )

    return tasks, unmatched_count


def sha256_file(path: Path, chunk_size: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(chunk_size), b""):
            digest.update(chunk)
    return digest.hexdigest()


def inspect_image(path: Path) -> tuple[int, int, str]:
    try:
        with Image.open(path) as image:
            image.verify()
        with Image.open(path) as image:
            width, height = image.size
            detected_mime = Image.MIME.get((image.format or "").upper())
    except (OSError, ValueError, UnidentifiedImageError) as exc:
        raise ValueError(f"File khong phai anh hop le: {exc}") from exc

    mime_type = detected_mime or mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return width, height, mime_type


def get_http_session(retries: int, backoff: float, workers: int) -> requests.Session:
    session = getattr(_thread_local, "session", None)
    session_key = getattr(_thread_local, "session_key", None)
    requested_key = (retries, backoff, workers)
    if session is not None and session_key == requested_key:
        return session

    retry = Retry(
        total=retries,
        connect=retries,
        read=retries,
        status=retries,
        backoff_factor=backoff,
        status_forcelist=RETRYABLE_STATUS_CODES,
        allowed_methods=frozenset({"GET"}),
        respect_retry_after_header=True,
        raise_on_status=False,
    )
    adapter = HTTPAdapter(
        max_retries=retry,
        pool_connections=workers,
        pool_maxsize=workers,
    )
    session = requests.Session()
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    _thread_local.session = session
    _thread_local.session_key = requested_key
    return session


def result_from_file(
    task: DownloadTask,
    *,
    status: str,
    attempted_download: bool,
    actual_checksum: str = "",
    width: Optional[int] = None,
    height: Optional[int] = None,
    mime_type: str = "",
    error: str = "",
) -> DownloadResult:
    expected_checksum = task.image.expected_checksum or ""
    checksum_match = None
    if expected_checksum and actual_checksum:
        checksum_match = expected_checksum.lower() == actual_checksum.lower()

    dimension_match = None
    if task.image.expected_width is not None and task.image.expected_height is not None:
        dimension_match = (
            width == task.image.expected_width and height == task.image.expected_height
        )

    expected_mime = (task.image.mime_type or "").split(";", maxsplit=1)[0].lower()
    actual_mime = (mime_type or "").split(";", maxsplit=1)[0].lower()
    mime_match = None
    if expected_mime and actual_mime:
        mime_match = expected_mime == actual_mime

    return DownloadResult(
        image_id=task.image.image_id,
        photo_id=task.photo.photo_id,
        source_url=task.image.source_url,
        download_url=task.download_url,
        local_path=str(task.local_path),
        local_storage_path=task.local_storage_path,
        status=status,
        attempted_download=attempted_download,
        expected_checksum=expected_checksum,
        actual_checksum=actual_checksum,
        checksum_match=checksum_match,
        dimension_match=dimension_match,
        mime_match=mime_match,
        bytes=task.local_path.stat().st_size if task.local_path.is_file() else 0,
        width=width,
        height=height,
        mime_type=mime_type,
        photo_url=task.photo.photo_url,
        photographer_username=task.photo.photographer_username,
        error=error,
    )


def validate_existing_file(task: DownloadTask) -> DownloadResult:
    width, height, mime_type = inspect_image(task.local_path)
    actual_checksum = sha256_file(task.local_path)
    expected_checksum = (task.image.expected_checksum or "").lower()
    checksum_match = not expected_checksum or actual_checksum.lower() == expected_checksum
    dimension_match = (
        task.image.expected_width is not None
        and task.image.expected_height is not None
        and width == task.image.expected_width
        and height == task.image.expected_height
    )
    expected_mime = (task.image.mime_type or "").split(";", maxsplit=1)[0].lower()
    mime_match = not expected_mime or mime_type.lower() == expected_mime
    if checksum_match:
        status = "verified_existing"
        error = ""
    elif dimension_match and mime_match:
        # Imgix can re-encode the same immutable Unsplash source differently
        # over time. Exact bytes then change while the image identity, decoded
        # geometry and format remain the same.
        status = "verified_existing_reencoded"
        error = ""
    else:
        status = "content_mismatch"
        error = "Checksum, kich thuoc hoac dinh dang khong khop lan indexing."
    return result_from_file(
        task,
        status=status,
        attempted_download=False,
        actual_checksum=actual_checksum,
        width=width,
        height=height,
        mime_type=mime_type,
        error=error,
    )


def download_one(
    task: DownloadTask,
    *,
    retries: int,
    backoff: float,
    workers: int,
    connect_timeout: float,
    read_timeout: float,
    max_bytes: int,
    redownload_mismatch: bool,
) -> DownloadResult:
    if task.local_path.is_file():
        try:
            existing = validate_existing_file(task)
            if existing.status in {"verified_existing", "verified_existing_reencoded"}:
                return existing
            if not redownload_mismatch:
                return existing
        except Exception:
            # A valid replacement is downloaded to .part before the old file is
            # atomically replaced, so an interrupted run does not lose it.
            pass

    task.local_path.parent.mkdir(parents=True, exist_ok=True)
    part_path = task.local_path.with_suffix(task.local_path.suffix + ".part")
    session = get_http_session(retries, backoff, workers)

    try:
        with session.get(
            task.download_url,
            stream=True,
            timeout=(connect_timeout, read_timeout),
        ) as response:
            response.raise_for_status()
            content_type = response.headers.get("Content-Type", "").split(";", maxsplit=1)[0].lower()
            if content_type and not content_type.startswith("image/"):
                raise ValueError(f"Content-Type khong phai anh: {content_type}")

            declared_size = response.headers.get("Content-Length")
            if declared_size and int(declared_size) > max_bytes:
                raise ValueError(f"File vuot gioi han {max_bytes} bytes")

            digest = hashlib.sha256()
            written = 0
            with part_path.open("wb") as output:
                for chunk in response.iter_content(chunk_size=128 * 1024):
                    if not chunk:
                        continue
                    written += len(chunk)
                    if written > max_bytes:
                        raise ValueError(f"File vuot gioi han {max_bytes} bytes")
                    digest.update(chunk)
                    output.write(chunk)
                output.flush()
                os.fsync(output.fileno())

        if written == 0:
            raise ValueError("Server tra ve file rong")

        width, height, detected_mime = inspect_image(part_path)
        actual_checksum = digest.hexdigest()
        os.replace(part_path, task.local_path)

        expected_checksum = (task.image.expected_checksum or "").lower()
        checksum_match = not expected_checksum or actual_checksum.lower() == expected_checksum
        dimension_match = (
            task.image.expected_width is not None
            and task.image.expected_height is not None
            and width == task.image.expected_width
            and height == task.image.expected_height
        )
        expected_mime = (task.image.mime_type or "").split(";", maxsplit=1)[0].lower()
        mime_match = not expected_mime or detected_mime.lower() == expected_mime
        if checksum_match:
            status = "downloaded"
            error = ""
        elif dimension_match and mime_match:
            status = "downloaded_reencoded"
            error = ""
        else:
            status = "content_mismatch"
            error = "Checksum, kich thuoc hoac dinh dang khong khop lan indexing."
        return result_from_file(
            task,
            status=status,
            attempted_download=True,
            actual_checksum=actual_checksum,
            width=width,
            height=height,
            mime_type=detected_mime,
            error=error,
        )
    except Exception as exc:
        try:
            part_path.unlink(missing_ok=True)
        except OSError:
            pass
        return result_from_file(
            task,
            status="failed",
            attempted_download=True,
            error=str(exc),
        )


def chunks(items: list[DownloadTask], size: int) -> Iterable[list[DownloadTask]]:
    for start in range(0, len(items), size):
        yield items[start : start + size]


def write_json_line(stream, result: DownloadResult) -> None:
    stream.write(json.dumps(asdict(result), ensure_ascii=False) + "\n")
    stream.flush()


def write_csv_atomic(path: Path, results: list[DownloadResult]) -> None:
    temporary_path = path.with_suffix(path.suffix + ".tmp")
    with temporary_path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=CSV_FIELDS)
        writer.writeheader()
        for result in sorted(results, key=lambda item: item.image_id):
            writer.writerow(asdict(result))
    os.replace(temporary_path, path)


def format_duration(seconds: float) -> str:
    minutes, remainder = divmod(max(0, int(seconds)), 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        return f"{hours}h {minutes:02d}m {remainder:02d}s"
    if minutes:
        return f"{minutes}m {remainder:02d}s"
    return f"{remainder}s"


def run(args: argparse.Namespace) -> int:
    started_at = perf_counter()
    destination = Path(args.destination).resolve()
    report_dir = Path(args.report_dir).resolve()
    tsv_path = Path(args.tsv).resolve()

    print("Dang doc danh sach anh Unsplash da index tu PostgreSQL...")
    indexed_images = load_indexed_images(args.limit)
    if not indexed_images:
        print("Khong tim thay anh Unsplash URL nao o trang thai indexed.")
        return 0

    print(f"Dang doc metadata Unsplash Lite: {tsv_path}")
    metadata_by_url = load_unsplash_metadata(tsv_path)
    tasks, unmatched_count = plan_tasks(
        indexed_images,
        metadata_by_url,
        destination,
        args.storage_prefix,
        args.width,
    )

    expected_bytes = sum(image.expected_size or 0 for image in indexed_images)
    print("=" * 68)
    print(f"Anh can mirror       : {len(tasks):,}")
    print(f"Khong ghep duoc TSV  : {unmatched_count:,} (se dung ten URL/image_id)")
    print(f"Dung luong uoc tinh  : {expected_bytes / (1024 ** 3):.2f} GiB")
    print(f"Thu muc dich         : {destination}")
    print(f"Thu muc bao cao      : {report_dir}")
    print(f"Download workers     : {args.workers}")
    print("Che do               : CHI TAI + KIEM TRA, KHONG SUA DATABASE/QDRANT")
    print("=" * 68)

    if args.dry_run:
        for task in tasks[: min(5, len(tasks))]:
            print(f"DRY-RUN image_id={task.image.image_id}: {task.download_url} -> {task.local_path}")
        print("Dry-run hoan tat, chua tai file nao.")
        return 0

    destination.mkdir(parents=True, exist_ok=True)
    report_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    event_path = report_dir / f"mirror-events-{timestamp}.jsonl"
    results: list[DownloadResult] = []
    completed = 0

    with event_path.open("a", encoding="utf-8") as event_stream:
        with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as executor:
            for task_chunk in chunks(tasks, args.queue_chunk_size):
                future_to_task = {
                    executor.submit(
                        download_one,
                        task,
                        retries=args.retries,
                        backoff=args.retry_backoff,
                        workers=args.workers,
                        connect_timeout=args.connect_timeout,
                        read_timeout=args.read_timeout,
                        max_bytes=args.max_file_mb * 1024 * 1024,
                        redownload_mismatch=args.redownload_mismatch,
                    ): task
                    for task in task_chunk
                }
                for future in concurrent.futures.as_completed(future_to_task):
                    task = future_to_task[future]
                    try:
                        result = future.result()
                    except Exception as exc:  # Defensive: worker should return failures.
                        result = result_from_file(
                            task,
                            status="failed",
                            attempted_download=True,
                            error=f"Worker loi bat ngo: {exc}",
                        )
                    results.append(result)
                    write_json_line(event_stream, result)
                    completed += 1

                    if completed == 1 or completed % args.progress_every == 0 or completed == len(tasks):
                        elapsed = perf_counter() - started_at
                        rate = completed / elapsed if elapsed else 0.0
                        eta = (len(tasks) - completed) / rate if rate else 0.0
                        counts = Counter(item.status for item in results)
                        print(
                            f"[{completed:,}/{len(tasks):,}] "
                            f"tai_moi={counts['downloaded']:,}, "
                            f"da_co={counts['verified_existing'] + counts['verified_existing_reencoded']:,}, "
                            f"tai_lai_ma_hoa={counts['downloaded_reencoded']:,}, "
                            f"mismatch={counts['content_mismatch']:,}, "
                            f"loi={counts['failed']:,}, "
                            f"toc_do={rate:.1f} anh/s, ETA={format_duration(eta)}"
                        )

    report_path = report_dir / f"mirror-manifest-{timestamp}.csv"
    latest_path = report_dir / "mirror-manifest-latest.csv"
    write_csv_atomic(report_path, results)
    write_csv_atomic(latest_path, results)

    counts = Counter(result.status for result in results)
    elapsed = perf_counter() - started_at
    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "download_only": True,
        "database_updated": False,
        "qdrant_updated": False,
        "source_count": len(tasks),
        "unmatched_tsv_count": unmatched_count,
        "status_counts": dict(counts),
        "successful_count": (
            counts["downloaded"]
            + counts["verified_existing"]
            + counts["downloaded_reencoded"]
            + counts["verified_existing_reencoded"]
        ),
        "reencoded_count": (
            counts["downloaded_reencoded"] + counts["verified_existing_reencoded"]
        ),
        "content_mismatch_count": counts["content_mismatch"],
        "failed_count": counts["failed"],
        "elapsed_seconds": round(elapsed, 3),
        "destination": str(destination),
        "manifest": str(report_path),
        "events": str(event_path),
    }
    summary_path = report_dir / "mirror-summary-latest.json"
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    print("\n--- KET QUA MIRROR UNSPLASH ---")
    print(f"Tai moi thanh cong   : {counts['downloaded']:,}")
    print(f"Da co, da xac minh   : {counts['verified_existing']:,}")
    print(
        "Hop le, CDN ma hoa lai: "
        f"{counts['downloaded_reencoded'] + counts['verified_existing_reencoded']:,}"
    )
    print(f"Noi dung khong khop  : {counts['content_mismatch']:,}")
    print(f"Tai/kiem tra that bai: {counts['failed']:,}")
    print(f"Tong thoi gian       : {format_duration(elapsed)}")
    print(f"Manifest             : {report_path}")
    print(f"Bao cao gan nhat     : {summary_path}")
    print("PostgreSQL va Qdrant KHONG bi thay doi.")

    return 2 if counts["failed"] or counts["content_mismatch"] else 0


def positive_int(value: str) -> int:
    parsed = int(value)
    if parsed <= 0:
        raise argparse.ArgumentTypeError("Gia tri phai lon hon 0")
    return parsed


def non_negative_int(value: str) -> int:
    parsed = int(value)
    if parsed < 0:
        raise argparse.ArgumentTypeError("Gia tri phai lon hon hoac bang 0")
    return parsed


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Tai ve local dung cac anh Unsplash URL da index. "
            "Lenh khong update PostgreSQL/Qdrant va khong chay lai AI."
        )
    )
    parser.add_argument("--tsv", default=str(DEFAULT_TSV), help="Duong dan photos.tsv000")
    parser.add_argument(
        "--destination",
        default=str(DEFAULT_DESTINATION),
        help="Thu muc local nhan anh (mac dinh la static/images/unsplash-lite)",
    )
    parser.add_argument("--report-dir", default=str(DEFAULT_REPORT_DIR))
    parser.add_argument("--storage-prefix", default=DEFAULT_STORAGE_PREFIX)
    parser.add_argument("--width", type=positive_int, default=600)
    parser.add_argument("--workers", type=positive_int, default=8)
    parser.add_argument("--queue-chunk-size", type=positive_int, default=256)
    parser.add_argument("--retries", type=non_negative_int, default=5)
    parser.add_argument("--retry-backoff", type=float, default=1.0)
    parser.add_argument("--connect-timeout", type=float, default=10.0)
    parser.add_argument("--read-timeout", type=float, default=45.0)
    parser.add_argument("--max-file-mb", type=positive_int, default=25)
    parser.add_argument("--progress-every", type=positive_int, default=100)
    parser.add_argument("--limit", type=positive_int, default=None, help="Chi tai N anh dau de test")
    parser.add_argument("--dry-run", action="store_true", help="Chi in ke hoach, khong tai anh")
    parser.add_argument(
        "--redownload-mismatch",
        action="store_true",
        help="Tai lai file local hop le nhung checksum khong khop",
    )
    return parser.parse_args()


if __name__ == "__main__":
    raise SystemExit(run(parse_args()))

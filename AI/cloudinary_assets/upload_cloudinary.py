"""Upload hang loat anh len Cloudinary va xuat manifest de luu vao DB."""

from __future__ import annotations

import argparse
import csv
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path

SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


@dataclass(frozen=True)
class UploadResult:
    relative_path: str
    source_path: str
    secure_url: str = ""
    public_id: str = ""
    cloud_name: str = ""
    image_format: str = ""
    width: int | None = None
    height: int | None = None
    bytes_size: int | None = None
    error: str = ""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Upload anh trong mot thu muc len Cloudinary va tao file manifest CSV."
    )
    parser.add_argument("input_dir", type=Path, help="Thu muc chua anh can upload")
    parser.add_argument(
        "--cloud-folder",
        default="visual-search/images",
        help="Folder tren Cloudinary, mac dinh: visual-search/images",
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        default=Path("cloudinary_upload_manifest.csv"),
        help="Duong dan file CSV ket qua, mac dinh: cloudinary_upload_manifest.csv",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=4,
        help="So anh upload dong thoi, mac dinh: 4",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Ghi de asset da ton tai neu public_id trung nhau",
    )
    parser.add_argument(
        "--skip-uploaded",
        action="store_true",
        help="Bo qua cac anh da co trong manifest cu",
    )
    return parser.parse_args()


def validate_args(args: argparse.Namespace) -> Path:
    input_dir = args.input_dir.resolve()
    if not input_dir.is_dir():
        raise ValueError(f"Khong tim thay thu muc anh: {input_dir}")
    if args.workers < 1:
        raise ValueError("workers phai lon hon 0.")
    return input_dir


def configure_cloudinary():
    try:
        import cloudinary
        import cloudinary.uploader
    except ImportError as exc:
        raise RuntimeError(
            "Chua cai thu vien cloudinary. Chay: pip install cloudinary"
        ) from exc

    cloud_name = os.getenv("CLOUDINARY_CLOUD_NAME")
    api_key = os.getenv("CLOUDINARY_API_KEY")
    api_secret = os.getenv("CLOUDINARY_API_SECRET")

    if not (cloud_name and api_key and api_secret):
        raise RuntimeError(
            "Thieu CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY hoac CLOUDINARY_API_SECRET."
        )

    cloudinary.config(
        cloud_name=cloud_name,
        api_key=api_key,
        api_secret=api_secret,
        secure=True,
    )
    return cloudinary.uploader, cloud_name


def collect_images(input_dir: Path) -> list[Path]:
    return sorted(
        path
        for path in input_dir.rglob("*")
        if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS
    )


def load_uploaded_paths(manifest: Path) -> set[str]:
    if not manifest.exists():
        return set()

    with manifest.open("r", newline="", encoding="utf-8") as file:
        reader = csv.DictReader(file)
        return {
            row["relative_path"]
            for row in reader
            if row.get("relative_path") and not row.get("error")
        }


def build_public_id(input_dir: Path, image_path: Path, cloud_folder: str) -> str:
    relative_without_suffix = image_path.relative_to(input_dir).with_suffix("")
    relative_public_id = relative_without_suffix.as_posix()
    cloud_folder = cloud_folder.strip("/")
    if not cloud_folder:
        return relative_public_id
    return f"{cloud_folder}/{relative_public_id}"


def upload_image(
    uploader,
    *,
    input_dir: Path,
    image_path: Path,
    cloud_folder: str,
    cloud_name: str,
    overwrite: bool,
) -> UploadResult:
    relative_path = image_path.relative_to(input_dir).as_posix()
    public_id = build_public_id(input_dir, image_path, cloud_folder)

    try:
        # Dat public_id theo duong dan tuong doi de chay lai script khong tao ban sao lung tung.
        response = uploader.upload(
            str(image_path),
            resource_type="image",
            public_id=public_id,
            overwrite=overwrite,
            unique_filename=False,
        )
    except Exception as exc:  # Cloudinary SDK nem nhieu loai exception theo HTTP/API.
        return UploadResult(
            relative_path=relative_path,
            source_path=str(image_path),
            public_id=public_id,
            cloud_name=cloud_name,
            error=str(exc),
        )

    return UploadResult(
        relative_path=relative_path,
        source_path=str(image_path),
        secure_url=response.get("secure_url", ""),
        public_id=response.get("public_id", public_id),
        cloud_name=cloud_name,
        image_format=response.get("format", ""),
        width=response.get("width"),
        height=response.get("height"),
        bytes_size=response.get("bytes"),
    )


def write_manifest(manifest: Path, results: list[UploadResult]) -> None:
    manifest.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "relative_path",
        "source_path",
        "storage_provider",
        "storage_bucket",
        "storage_path",
        "public_id",
        "format",
        "width",
        "height",
        "bytes",
        "error",
    ]

    with manifest.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        for result in results:
            writer.writerow(
                {
                    "relative_path": result.relative_path,
                    "source_path": result.source_path,
                    "storage_provider": "cloudinary",
                    "storage_bucket": result.cloud_name,
                    "storage_path": result.secure_url,
                    "public_id": result.public_id,
                    "format": result.image_format,
                    "width": result.width or "",
                    "height": result.height or "",
                    "bytes": result.bytes_size or "",
                    "error": result.error,
                }
            )


def main() -> int:
    # Bao dam thong bao hien thi on dinh tren Windows terminal.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")

    args = parse_args()
    try:
        input_dir = validate_args(args)
        uploader, cloud_name = configure_cloudinary()
    except (RuntimeError, ValueError) as exc:
        print(f"Loi: {exc}", file=sys.stderr)
        return 2

    images = collect_images(input_dir)
    if args.skip_uploaded:
        uploaded_paths = load_uploaded_paths(args.manifest)
        images = [
            image
            for image in images
            if image.relative_to(input_dir).as_posix() not in uploaded_paths
        ]

    if not images:
        print("Khong co anh nao can upload.")
        return 0

    print(f"Tim thay {len(images)} anh. Bat dau upload len Cloudinary...")
    results: list[UploadResult] = []
    failed = 0

    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {
            executor.submit(
                upload_image,
                uploader,
                input_dir=input_dir,
                image_path=image,
                cloud_folder=args.cloud_folder,
                cloud_name=cloud_name,
                overwrite=args.overwrite,
            ): image
            for image in images
        }

        for completed, future in enumerate(as_completed(futures), start=1):
            result = future.result()
            results.append(result)
            if result.error:
                failed += 1
                print(f"Upload loi {result.relative_path}: {result.error}")
            if completed % 100 == 0 or completed == len(images):
                print(f"Da upload {completed}/{len(images)} anh")

    results.sort(key=lambda item: item.relative_path)
    write_manifest(args.manifest, results)

    print(f"Thanh cong: {len(results) - failed}, loi: {failed}")
    print(f"Manifest: {args.manifest.resolve()}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())

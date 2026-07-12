"""Nén hàng loạt ảnh trong một thư mục để giảm dung lượng trước khi upload cloud."""

from __future__ import annotations

import argparse
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}


@dataclass(frozen=True)
class CompressionResult:
    source_size: int
    output_size: int
    error: str | None = None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Nén toàn bộ ảnh và giữ nguyên cấu trúc thư mục con."
    )
    parser.add_argument("input_dir", type=Path, help="Thư mục chứa ảnh gốc")
    parser.add_argument("output_dir", type=Path, help="Thư mục lưu ảnh đã nén")
    parser.add_argument(
        "--format",
        choices=("webp", "jpeg"),
        default="webp",
        help="Định dạng đầu ra, mặc định: webp",
    )
    parser.add_argument(
        "--quality",
        type=int,
        default=80,
        help="Chất lượng ảnh từ 1 đến 100, mặc định: 80",
    )
    parser.add_argument(
        "--max-size",
        type=int,
        default=1600,
        help="Chiều rộng hoặc cao tối đa, mặc định: 1600 px",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=min(8, os.cpu_count() or 1),
        help="Số ảnh xử lý đồng thời, mặc định tối đa 8",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Ghi đè ảnh đã tồn tại trong thư mục đầu ra",
    )
    return parser.parse_args()


def validate_args(args: argparse.Namespace) -> tuple[Path, Path]:
    input_dir = args.input_dir.resolve()
    output_dir = args.output_dir.resolve()

    if not input_dir.is_dir():
        raise ValueError(f"Không tìm thấy thư mục nguồn: {input_dir}")
    if input_dir == output_dir:
        raise ValueError("Thư mục nguồn và thư mục đầu ra phải khác nhau.")
    if not 1 <= args.quality <= 100:
        raise ValueError("quality phải nằm trong khoảng 1 đến 100.")
    if args.max_size < 1:
        raise ValueError("max-size phải lớn hơn 0.")
    if args.workers < 1:
        raise ValueError("workers phải lớn hơn 0.")

    return input_dir, output_dir


def collect_images(input_dir: Path, output_dir: Path) -> list[Path]:
    files: list[Path] = []
    output_is_inside_input = output_dir.is_relative_to(input_dir)

    for path in input_dir.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in SUPPORTED_EXTENSIONS:
            continue
        if output_is_inside_input and path.is_relative_to(output_dir):
            continue
        files.append(path)

    return files


def compress_image(
    source: Path,
    *,
    input_dir: Path,
    output_dir: Path,
    output_format: str,
    quality: int,
    max_size: int,
    overwrite: bool,
) -> CompressionResult:
    source_size = source.stat().st_size
    extension = ".webp" if output_format == "webp" else ".jpg"
    destination = (output_dir / source.relative_to(input_dir)).with_suffix(extension)

    if destination.exists() and not overwrite:
        return CompressionResult(source_size, destination.stat().st_size)

    try:
        destination.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(source) as opened_image:
            # Chuẩn hóa chiều ảnh từ EXIF trước khi resize.
            image = ImageOps.exif_transpose(opened_image)
            image.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)

            if output_format == "jpeg":
                image = convert_for_jpeg(image)
                image.save(
                    destination,
                    format="JPEG",
                    quality=quality,
                    optimize=True,
                    progressive=True,
                )
            else:
                image.save(
                    destination,
                    format="WEBP",
                    quality=quality,
                    method=6,
                )
    except (OSError, ValueError, UnidentifiedImageError) as exc:
        destination.unlink(missing_ok=True)
        return CompressionResult(source_size, 0, str(exc))

    return CompressionResult(source_size, destination.stat().st_size)


def convert_for_jpeg(image: Image.Image) -> Image.Image:
    if image.mode in {"RGBA", "LA"} or "transparency" in image.info:
        rgba_image = image.convert("RGBA")
        background = Image.new("RGB", rgba_image.size, "white")
        background.paste(rgba_image, mask=rgba_image.getchannel("A"))
        return background
    return image.convert("RGB")


def format_size(size: int) -> str:
    value = float(size)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if value < 1024 or unit == "TB":
            return f"{value:.2f} {unit}"
        value /= 1024
    return f"{value:.2f} TB"


def main() -> int:
    # Bảo đảm thông báo tiếng Việt hiển thị đúng trên Windows.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")

    args = parse_args()
    try:
        input_dir, output_dir = validate_args(args)
    except ValueError as exc:
        print(f"Lỗi: {exc}")
        return 2

    images = collect_images(input_dir, output_dir)
    if not images:
        print("Không tìm thấy ảnh được hỗ trợ trong thư mục nguồn.")
        return 0

    print(f"Tìm thấy {len(images)} ảnh. Bắt đầu nén...")
    total_source_size = 0
    total_output_size = 0
    failed = 0

    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {
            executor.submit(
                compress_image,
                image,
                input_dir=input_dir,
                output_dir=output_dir,
                output_format=args.format,
                quality=args.quality,
                max_size=args.max_size,
                overwrite=args.overwrite,
            ): image
            for image in images
        }

        for completed, future in enumerate(as_completed(futures), start=1):
            result = future.result()
            total_source_size += result.source_size
            total_output_size += result.output_size
            if result.error:
                failed += 1
                print(f"Không thể xử lý {futures[future]}: {result.error}")
            if completed % 100 == 0 or completed == len(images):
                print(f"Đã xử lý {completed}/{len(images)} ảnh")

    reduction = 0.0
    if total_source_size:
        reduction = (1 - total_output_size / total_source_size) * 100

    print(f"Dung lượng gốc: {format_size(total_source_size)}")
    print(f"Dung lượng sau nén: {format_size(total_output_size)}")
    print(f"Giảm: {reduction:.2f}%")
    print(f"Thành công: {len(images) - failed}, lỗi: {failed}")
    print(f"Thư mục đầu ra: {output_dir}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())

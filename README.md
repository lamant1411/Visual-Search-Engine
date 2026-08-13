# Visual Search Engine
Visual Search Engine là hệ thống tìm kiếm hình ảnh full-stack, cho phép người
dùng tải lên, đánh chỉ mục, tìm kiếm, sắp xếp, đánh dấu và quản lý bộ sưu tập ảnh
cá nhân. Hệ thống kết hợp Backend FastAPI, Frontend React, cơ sở dữ liệu quan hệ
PostgreSQL, tìm kiếm vector Qdrant và dịch vụ AI để tạo embedding CLIP, trích
xuất văn bản OCR.

## Tính năng chính

- Xác thực người dùng: đăng ký, đăng nhập, refresh token, đăng xuất và phân quyền
  theo vai trò.
- Tìm ảnh tương tự từ một ảnh tham chiếu được tải lên.
- Tìm kiếm văn bản hợp nhất bằng Semantic Search và OCR Search.
- Thư viện ảnh cá nhân: tải lên, xóa mềm, khôi phục, xóa vĩnh viễn và lọc ảnh đã xóa.
- Quản lý album: tạo, cập nhật, xóa mềm, khôi phục, xóa vĩnh viễn, thêm/bớt và xem ảnh.
- Quản lý ảnh đã đánh dấu.
- Lịch sử tìm kiếm bằng ảnh và văn bản.
- Đánh chỉ mục ảnh theo batch, theo dõi tiến trình, thử lại ảnh lỗi và trạng thái từng ảnh.
- API trang quản trị cho thống kê hệ thống, người dùng, ảnh và quy trình indexing.
- Tài liệu Swagger/OpenAPI để kiểm thử API Backend.

## Kiến trúc

```text
Frontend (React + Vite)
        |
        | REST API
        v
Backend (FastAPI)
        |
        | PostgreSQL: người dùng, ảnh, album, bookmark, lịch sử, batch indexing
        | Qdrant: vector CLIP phục vụ tìm kiếm tương đồng
        | Static files: lưu ảnh đã tải lên
        v
Dịch vụ AI (FastAPI)
        |
        | Tạo embedding CLIP
        | Trích xuất OCR
        | Worker đánh chỉ mục từng ảnh
```

## Công nghệ sử dụng

- **Frontend:** TypeScript, React, Vite
- **Backend:** Python, FastAPI, SQLAlchemy, Alembic
- **Cơ sở dữ liệu:** PostgreSQL
- **Cơ sở dữ liệu vector:** Qdrant
- **AI:** CLIP embedding, OCR, worker đánh chỉ mục từng ảnh
- **Xác thực:** JWT, refresh token, bcrypt-sha256, phân quyền theo vai trò
- **Hạ tầng:** Docker, Docker Compose
- **Tài liệu:** Swagger/OpenAPI

## Cấu trúc repository

```text
.
|-- AI/                # Dịch vụ AI, module CLIP/OCR và pipeline indexing
|-- backend/           # Backend FastAPI, model, schema và migration database
|-- db/                # Ghi chú database và tài liệu dự án
|-- evaluation/        # Công cụ và kết quả đánh giá
|-- visual-search-fe/  # Frontend React
|-- docker-compose.yml # Cấu hình chạy full-stack trên local
`-- README.md
```

## Chạy bằng Docker Compose

Trước tiên, tạo các file biến môi trường cần thiết:

- `backend/.env`
- `visual-search-fe/.env`

Sau đó khởi động toàn bộ hệ thống từ thư mục gốc:

```bash
docker compose up --build
```

Ở những lần chạy sau, nếu không cần build lại Docker image:

```bash
docker compose up
```

Chạy migration database khi cần:

```bash
docker compose exec backend alembic upgrade head
```

Dừng các container:

```bash
docker compose down
```

Không dùng `docker compose down -v` trừ khi chủ động muốn xóa volume PostgreSQL
và Qdrant.

## Địa chỉ dịch vụ

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8000`
- Swagger UI: `http://localhost:8000/docs`
- Kiểm tra Backend: `http://localhost:8000/health`
- Kiểm tra API: `http://localhost:8000/api/v1/health`
- Dịch vụ AI: `http://localhost:8001`
- Qdrant: `http://localhost:6333`
- pgAdmin: `http://localhost:5050`

## Các nhóm API Backend

Tất cả API có version được đặt dưới prefix:

```text
/api/v1
```

Các nhóm API chính:

- `GET /api/v1/health`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `POST /api/v1/search/image`
- `GET /api/v1/search/text`
- `GET /api/v1/search/ocr`
- `GET /api/v1/history`
- `GET /api/v1/images`
- `GET /api/v1/images/deleted`
- `POST /api/v1/images/bulk-delete`
- `POST /api/v1/images/bulk-restore`
- `POST /api/v1/images/bulk-permanent-delete`
- `GET /api/v1/albums`
- `POST /api/v1/albums`
- `GET /api/v1/bookmarks`
- `POST /api/v1/bookmarks`
- `GET /api/v1/index/batches`
- `POST /api/v1/index/batches`
- `POST /api/v1/index/batches/{batch_id}/images`
- `POST /api/v1/index/batches/{batch_id}/complete-upload`
- `GET /api/v1/index/status/{batch_id}`
- `GET /api/v1/admin/dashboard`
- `GET /api/v1/admin/users`

Dùng Swagger UI để xem đầy đủ endpoint, request schema, response schema và
định dạng lỗi.

## Luồng đánh chỉ mục

1. Người dùng hoặc Admin tạo một batch indexing.
2. Ảnh được tải lên Backend và lưu trong vùng lưu trữ static.
3. Backend tạo bản ghi ảnh và indexing item trong PostgreSQL.
4. Backend gửi các item đã tải lên sang dịch vụ AI.
5. Dịch vụ AI tạo embedding CLIP và ghi vector vào Qdrant.
6. OCR chạy riêng để lỗi OCR không chặn Semantic Search.
7. Trạng thái từng item được cập nhật vào PostgreSQL để theo dõi, thử lại và xử lý lỗi.

## Quyền sở hữu và xóa ảnh

- Ảnh do người dùng tải lên thuộc sở hữu của người đó.
- Người dùng quản lý thư viện ảnh cá nhân của mình.
- Ảnh xóa mềm bị ẩn khỏi thư viện, tìm kiếm, bookmark và album thông thường.
- Ảnh đã xóa có thể được khôi phục hoặc xóa vĩnh viễn.
- Ảnh dataset không có chủ sở hữu được xem là ảnh công khai đã index.

## Tinh chỉnh AI

Chi tiết tinh chỉnh CPU và worker được ghi tại:

```text
AI_INDEXING_TUNING.md
```

AI service dùng chung một model CLIP và một model OCR. Mức sử dụng CPU được
điều khiển bởi `AI_CPU_THREADS`, `MAX_INDEX_WORKERS`,
`AI_INFERENCE_THREADS`, `CLIP_IMAGE_BATCH_SIZE`,
`OCR_MAX_CONCURRENT_INFERENCE` và `OCR_MAX_INPUT_DIMENSION`.

Với máy cấu hình thấp, nên bắt đầu bằng `AI_CPU_THREADS=4`,
`AI_INFERENCE_THREADS=4`, `MAX_INDEX_WORKERS=1` và
`OCR_RECOGNITION_BATCH_SIZE=1`.

## Chạy Frontend không dùng Docker

```bash
cd visual-search-fe
cp .env.example .env
npm install
npm run dev
```

Đặt `VITE_ENABLE_MOCK=false` để gọi Backend thật. Chỉ dùng `true` khi phát
triển giao diện Search mà không chạy API.

## Kiểm tra chất lượng

```bash
cd visual-search-fe
npm run lint
npm run build
```

Xem [TESTING.md](TESTING.md) để thực hiện checklist kiểm thử end-to-end thủ công.

# Ghi chú thiết kế Database

Tài liệu này ghi lại phân tích yêu cầu dữ liệu cho dự án **Visual Search Engine** và đề xuất schema database tương ứng.

Mục tiêu của schema là phục vụ các chức năng cốt lõi:

- Đăng ký và đăng nhập
- Phân quyền `user` / `admin`
- Tìm kiếm bằng hình ảnh
- Tìm kiếm bằng text semantic
- Tìm kiếm OCR
- Theo dõi tiến trình indexing cho Admin

Kiến trúc lưu trữ dữ liệu đề xuất:

- `PostgreSQL` lưu dữ liệu quan hệ, metadata, auth, OCR text và trạng thái xử lý
- `Qdrant` lưu vector embedding để phục vụ search by image và semantic search

---

## 1. Phân tích yêu cầu dự án

### 1.1. Xác thực

Hệ thống cần hỗ trợ:

- Đăng ký tài khoản
- Đăng nhập
- Lưu mật khẩu đã hash bằng `bcrypt`
- Phân biệt vai trò người dùng bằng `role`
- Access token hết hạn sau 24 giờ

### 1.2. Tìm kiếm bằng ảnh

Người dùng upload một ảnh để tìm các ảnh tương tự về nội dung hoặc hình dạng.

Yêu cầu liên quan tới dữ liệu:

- Lưu thông tin ảnh gốc
- Lưu trạng thái xử lý ảnh
- Lưu định danh để đồng bộ ảnh với điểm vector trong Qdrant

### 1.3. Tìm kiếm bằng văn bản

Hệ thống hỗ trợ 2 kiểu tìm kiếm bằng text:

- Semantic search: nhập mô tả ngôn ngữ tự nhiên
- OCR search: nhập text xuất hiện trong ảnh

Yêu cầu liên quan tới dữ liệu:

- Lưu embedding ảnh vào Qdrant để semantic search dùng cùng không gian vector với text
- Lưu text OCR đã trích xuất
- Có index phù hợp để tìm text nhanh trên PostgreSQL

### 1.4. Hiển thị kết quả

Frontend cần hiển thị kết quả dạng lưới, phân trang hoặc infinite scroll, và mở chi tiết ảnh bằng modal.

Yêu cầu liên quan tới dữ liệu:

- Lưu metadata cơ bản của ảnh như kích thước, định dạng, tên file, đường dẫn lưu trữ
- Có thể lưu thêm dữ liệu phục vụ preview hoặc hiển thị chi tiết

### 1.5. Trang tổng quan Admin

Admin cần theo dõi:

- Trạng thái indexing
- Tiến trình batch index
- Danh sách user

Yêu cầu liên quan tới dữ liệu:

- Lưu trạng thái từng batch indexing
- Lưu tiến trình xử lý
- Lưu thông tin user và role

---

## 2. Thiết kế database schema

Chia schema thành 2 nhóm:

- **Bảng bắt buộc**: cần có để đáp ứng yêu cầu cốt lõi của dự án
- **Bảng mở rộng**: không bắt buộc ở giai đoạn đầu, nhưng hữu ích nếu team có thời gian

---

## 3. Bảng bắt buộc

### 3.1. `users`

Lưu thông tin tài khoản và phân quyền.

Các cột đề xuất:

- `id` - khóa chính
- `email` - unique, dùng để đăng nhập
- `password_hash` - mật khẩu đã hash bằng bcrypt
- `role` - `user` hoặc `admin`
- `is_active` - trạng thái tài khoản
- `created_at`
- `updated_at`
- `last_login_at`

Mục đích:

- Đăng ký / đăng nhập
- Phân quyền admin/user
- Quản lý trạng thái tài khoản

---

### 3.2. `images`

Lưu thông tin gốc của ảnh được upload hoặc ảnh từ dataset.

Các cột đề xuất:

- `id` - khóa chính
- `owner_user_id` - nullable, user sở hữu ảnh nếu ảnh được upload từ người dùng
- `source_type` - ví dụ: `dataset`, `upload`
- `storage_path` - đường dẫn file hoặc object storage key
- `original_filename`
- `mime_type`
- `file_size`
- `width`
- `height`
- `checksum`
- `status` - ví dụ: `pending`, `indexed`, `failed`
- `created_at`
- `updated_at`

Mục đích:

- Lưu ảnh gốc
- Quản lý trạng thái xử lý ảnh
- Phục vụ hiển thị kết quả tìm kiếm

---

### 3.3. `image_embeddings`

Lưu thông tin đồng bộ giữa ảnh trong PostgreSQL và point vector trong Qdrant.

Các cột đề xuất:

- `image_id` - khóa chính, đồng thời là foreign key tới `images.id`
- `qdrant_point_id` - ID của point trong Qdrant
- `collection_name` - tên collection Qdrant đang dùng
- `model_name` - tên model dùng để sinh embedding
- `embedding_dim` - kích thước vector, dùng để đối chiếu dữ liệu
- `vector_status` - `pending`, `synced`, `failed`
- `created_at`

Mục đích:

- Tạo liên kết giữa ảnh gốc và dữ liệu vector trong Qdrant
- Hỗ trợ reindex hoặc đồng bộ lại embedding khi cần
- Giữ metadata đủ để audit và debug pipeline AI

---

### 3.4. `ocr_texts`

Lưu text được trích xuất từ ảnh để phục vụ OCR search.

Các cột đề xuất:

- `image_id` - khóa chính, foreign key tới `images.id`
- `raw_text` - text OCR gốc
- `language` - ví dụ: `en`, `vi`
- `confidence` - độ tin cậy nếu OCR engine hỗ trợ
- `tsv` - `tsvector` hoặc cột được index cho full-text search
- `created_at`
- `updated_at`

Mục đích:

- Tìm ảnh theo chữ xuất hiện trong ảnh
- Hỗ trợ full-text search trên PostgreSQL

---

### 3.5. `indexing_batches`

Theo dõi các đợt indexing dữ liệu để Admin dashboard có thể polling trạng thái.

Các cột đề xuất:

- `id` - khóa chính
- `batch_id` - mã định danh của batch
- `status` - `queued`, `running`, `completed`, `failed`
- `total_images`
- `processed_images`
- `failed_images`
- `error_message`
- `created_at`
- `updated_at`

Mục đích:

- Theo dõi tiến trình index
- Hiển thị trạng thái cho Admin
- Hỗ trợ debug khi batch bị lỗi

---

## 4. Bảng mở rộng

### 4.1. `refresh_tokens`

Lưu refresh token hoặc session token nếu team muốn hỗ trợ đăng nhập bền hơn.

Các cột đề xuất:

- `id`
- `user_id`
- `token_hash`
- `expires_at`
- `revoked_at`
- `created_at`

Mục đích:

- Quản lý phiên đăng nhập
- Hỗ trợ logout và revoke token

---

### 4.2. `search_history`

Lưu lịch sử tìm kiếm của người dùng.

Các cột đề xuất:

- `id`
- `user_id`
- `query_type` - `image`, `semantic`, `ocr`
- `query_value`
- `created_at`

Mục đích:

- Xem lại lịch sử tìm kiếm
- Hỗ trợ phân tích dữ liệu

---

### 4.3. `bookmarks`

Lưu ảnh người dùng đánh dấu yêu thích.

Các cột đề xuất:

- `id`
- `user_id`
- `image_id`
- `created_at`

Mục đích:

- Lưu ảnh yêu thích
- Xem lại sau

---

## 5. Quan hệ giữa các bảng

- `users` 1 - N `images`
  - Một user có thể upload nhiều ảnh
- `images` 1 - 1 `image_embeddings`
  - Mỗi ảnh có một record đồng bộ với một point vector trong Qdrant
- `images` 1 - 1 `ocr_texts`
  - Mỗi ảnh có một bản OCR text tương ứng
- `users` 1 - N `search_history`
  - Nếu có lưu lịch sử tìm kiếm
- `users` 1 - N `bookmarks`
  - Nếu có tính năng bookmark
- `images` 1 - N `bookmarks`
  - Một ảnh có thể được nhiều user bookmark
- `users` 1 - N `refresh_tokens`
  - Một user có thể có nhiều phiên đăng nhập
- `indexing_batches`
  - Hoạt động độc lập để theo dõi tiến trình xử lý

---

## 6. Index khuyến nghị

- `users(email)` unique index
- `users(role)` index
- `images(status, created_at)` index
- `images(owner_user_id, created_at)` index
- `image_embeddings.qdrant_point_id` unique index
- `image_embeddings.collection_name` index nếu hệ thống dùng nhiều collection
- `ocr_texts.tsv` GIN index cho full-text search
- `indexing_batches(status)` index để polling nhanh

---

## 7. Kết luận

Để phục vụ dự án đúng scope giai đoạn đầu, schema cần ưu tiên:

1. `users`
2. `images`
3. `image_embeddings`
4. `ocr_texts`
5. `indexing_batches`

Các bảng như `refresh_tokens`, `search_history`, `bookmarks` được xem là mở rộng và có thể bổ sung sau khi hệ thống cốt lõi đã chạy ổn định.

Thiết kế này để:

- Đăng nhập và phân quyền
- Lưu ảnh và embedding cho visual search
- Lưu OCR text cho text search
- Theo dõi indexing cho Admin dashboard

Trong đó:

- PostgreSQL chịu trách nhiệm cho toàn bộ dữ liệu quan hệ
- Qdrant chịu trách nhiệm lưu và truy vấn vector embedding

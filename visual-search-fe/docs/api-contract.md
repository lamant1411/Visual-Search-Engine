# Bản nháp API Contract

Tài liệu dùng để Frontend và Backend thống nhất trước khi tích hợp API thật.

## Xác thực

### POST /auth/register

Request:

```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "Demo User"
}
```

Response:

```json
{
  "access_token": "jwt-token",
  "token_type": "bearer",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "role": "user",
    "isActive": true,
    "createdAt": "2026-07-03T00:00:00Z",
    "updatedAt": null,
    "lastLoginAt": null
  }
}
```

### POST /auth/login

Request:

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

Response có cùng cấu trúc với API đăng ký.

## Tìm kiếm

### POST /search/image

Request:

- `multipart/form-data`
- `file`: ảnh JPG, PNG hoặc WebP, không bắt buộc
- `image_id`: ID ảnh đã tồn tại, không bắt buộc
- `imageUrl`: URL ảnh `/static` đã lưu, không bắt buộc
- `page`: không bắt buộc, mặc định `1`
- `limit`: không bắt buộc, mặc định `20`

Response:

```json
{
  "items": [
    {
      "id": 1,
      "thumbnailUrl": "https://cdn.example.com/thumbs/img-001.jpg",
      "imageUrl": "https://cdn.example.com/images/img-001.jpg",
      "similarityScore": 94.2,
      "metadata": {
        "width": 1200,
        "height": 800,
        "source": "Unsplash",
        "ocrText": "SUMMER SALE"
      }
    }
  ],
  "page": 1,
  "limit": 20,
  "total": 100
}
```

### GET /search/text

Query params:

- `q`: nội dung tìm kiếm
- `page`: không bắt buộc, mặc định `1`
- `limit`: không bắt buộc, mặc định `20`

Response có cùng cấu trúc với Image Search. Backend tự kết hợp Semantic và OCR.

## Đánh dấu ảnh

Tất cả endpoint Bookmark đều yêu cầu Bearer access token.

### GET /bookmarks

Query params:

- `page`: không bắt buộc, mặc định `1`
- `limit`: không bắt buộc, mặc định `20`, tối đa `100`

Response:

```json
{
  "items": [
    {
      "id": 7,
      "image_id": 42,
      "image_url": "http://localhost:8000/static/images/42.jpg",
      "title": "42.jpg",
      "saved_at": "2026-07-19T08:30:00Z"
    }
  ],
  "page": 1,
  "limit": 20,
  "total": 1
}
```

### GET /bookmarks/image-ids

Trả về ID các ảnh người dùng hiện tại đã lưu để thẻ kết quả hiển thị đúng trạng thái.

```json
{
  "image_ids": [12, 42, 81]
}
```

### POST /bookmarks

Lưu một ảnh đã index. Thao tác có tính idempotent: lưu lại bookmark đã tồn tại
sẽ trả về tài nguyên cũ thay vì tạo bản ghi trùng.

```json
{
  "image_id": 42
}
```

### GET /bookmarks/{bookmarkId}

Trả về một ảnh đã lưu cùng kích thước, nguồn và OCR text.

### DELETE /bookmarks/images/{imageId}

Xóa bookmark từ kết quả tìm kiếm bằng ID ảnh.

### DELETE /bookmarks/{bookmarkId}

Xóa bookmark bằng ID tài nguyên bookmark.

## Quản trị

### GET /admin/stats

Response:

```json
{
  "totalImages": 50000,
  "totalUsers": 120,
  "totalSearches": 3200
}
```

### GET /admin/indexing/status

Response:

```json
{
  "status": "running",
  "processed": 12000,
  "total": 50000,
  "failed": 8,
  "startedAt": "2026-07-02T09:00:00Z",
  "finishedAt": null
}
```

### POST /admin/index

Response:

```json
{
  "jobId": "index-job-001",
  "status": "queued"
}
```

## Định dạng lỗi

Các API nên trả cấu trúc sau đối với lỗi đã được xử lý:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Nội dung tìm kiếm là bắt buộc",
  "details": {
    "field": "q"
  }
}
```

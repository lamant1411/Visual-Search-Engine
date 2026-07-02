# API Contract Draft

This draft is for frontend/backend alignment before real integration.

## Auth

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
  "accessToken": "jwt-token",
  "user": {
    "id": "user-1",
    "email": "user@example.com",
    "name": "Demo User",
    "role": "user"
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

Response is the same shape as register.

## Search

### POST /search/image

Request:

- `multipart/form-data`
- `file`: JPG, PNG, or WebP image
- `page`: optional, default `1`
- `limit`: optional, default `20`

Response:

```json
{
  "items": [
    {
      "id": "img-001",
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

- `q`: search query
- `mode`: `semantic` or `ocr`
- `page`: optional, default `1`
- `limit`: optional, default `20`

Response is the same shape as image search.

## Admin

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

## Error Shape

All APIs should return this shape for handled errors:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Query is required",
  "details": {
    "field": "q"
  }
}
```

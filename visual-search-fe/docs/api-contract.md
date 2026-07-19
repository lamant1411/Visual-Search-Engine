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

Response is the same shape as register.

## Search

### POST /search/image

Request:

- `multipart/form-data`
- `file`: optional JPG, PNG, or WebP image
- `image_id`: optional existing image id
- `imageUrl`: optional remote image URL
- `page`: optional, default `1`
- `limit`: optional, default `20`

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

- `q`: search query
- `mode`: `semantic` or `ocr`
- `page`: optional, default `1`
- `limit`: optional, default `20`

Response is the same shape as image search.

## Bookmarks

All bookmark endpoints require a bearer access token. Bookmark mutations use the
image ID so the Search UI can save or remove a result without first loading a
bookmark resource ID.

### GET /bookmarks

Query params:

- `page`: optional, default `1`
- `limit`: optional, default `20`, maximum `100`

Response:

```json
{
  "items": [
    {
      "id": 7,
      "imageId": 42,
      "thumbnailUrl": "http://localhost:8000/static/images/42.jpg",
      "imageUrl": "http://localhost:8000/static/images/42.jpg",
      "savedAt": "2026-07-19T08:30:00Z",
      "metadata": {
        "width": 1920,
        "height": 1080,
        "source": "open-images",
        "ocrText": "SUMMER SALE"
      }
    }
  ],
  "page": 1,
  "limit": 20,
  "total": 1
}
```

### GET /bookmarks/image-ids

Returns the current user's saved image IDs so search result cards can display
their saved state.

```json
{
  "imageIds": [12, 42, 81]
}
```

### PUT /bookmarks/{imageId}

Saves an image. The operation is idempotent: saving an existing bookmark returns
the existing resource instead of creating a duplicate. Response is one bookmark
item from the list response above.

### GET /bookmarks/{imageId}

Returns one saved image with metadata. Returns `BOOKMARK_NOT_FOUND` when the
current user has not saved that image.

### DELETE /bookmarks/{imageId}

Removes the current user's bookmark and returns `204 No Content`. The operation
is idempotent, so deleting an already-removed bookmark also returns `204`.

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

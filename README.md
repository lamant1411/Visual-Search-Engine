# Visual Search Engine

Visual Search Engine is a full-stack image search system that lets users upload,
index, search, organize, bookmark, and manage private image collections. The
system combines a FastAPI backend, React frontend, PostgreSQL relational data,
Qdrant vector search, and an AI service for CLIP embedding and OCR extraction.

## Main features

- User authentication with registration, login, refresh token, logout, and
  role-based access control.
- Image-to-image search using uploaded reference images.
- Semantic text search and OCR text search.
- User-owned image library with upload, soft delete, restore, permanent delete,
  and deleted-image filtering.
- Album management with create, update, soft delete, restore, permanent delete,
  add images, remove images, and view album images.
- Bookmark management for saved images.
- Search history for image, semantic, and OCR searches.
- Batch image indexing with progress tracking, failed-item retry, and item-level
  status.
- Admin dashboard APIs for system stats, users, images, and indexing workflows.
- Swagger/OpenAPI documentation for backend API testing.

## Architecture

```text
Frontend (React + Vite)
        |
        | REST API
        v
Backend (FastAPI)
        |
        | PostgreSQL: users, images, albums, bookmarks, history, indexing jobs
        | Qdrant: CLIP vectors for similarity search
        | Static files: uploaded image storage
        v
AI Service (FastAPI)
        |
        | CLIP embedding
        | OCR extraction
        | Item-level indexing workers
```

## Tech stack

- **Frontend:** TypeScript, React, Vite
- **Backend:** Python, FastAPI, SQLAlchemy, Alembic
- **Database:** PostgreSQL
- **Vector database:** Qdrant
- **AI:** CLIP embedding, OCR, item-level indexing workers
- **Auth:** JWT, refresh token, bcrypt-sha256, role-based access control
- **Infrastructure:** Docker, Docker Compose
- **Documentation:** Swagger/OpenAPI

## Repository structure

```text
.
|-- AI/                # AI service, CLIP/OCR modules, indexing pipeline
|-- backend/           # FastAPI backend, database models, schemas, migrations
|-- db/                # Database notes and project documentation
|-- evaluation/        # Evaluation-related files
|-- visual-search-fe/  # React frontend
|-- docker-compose.yml # Local full-stack Docker setup
`-- README.md
```

## Run with Docker Compose

Create the required environment files first:

- `backend/.env`
- `visual-search-fe/.env`

Then start the full stack from the project root:

```bash
docker compose up --build
```

For later runs, if Docker images do not need to be rebuilt:

```bash
docker compose up
```

Run database migrations manually if needed:

```bash
docker compose exec backend alembic upgrade head
```

Stop containers:

```bash
docker compose down
```

Do not use `docker compose down -v` unless you intentionally want to remove
PostgreSQL and Qdrant volumes.

## Service URLs

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8000`
- Swagger UI: `http://localhost:8000/docs`
- Backend health: `http://localhost:8000/health`
- API health: `http://localhost:8000/api/v1/health`
- AI service: `http://localhost:8001`
- Qdrant: `http://localhost:6333`
- pgAdmin: `http://localhost:5050`

## Backend API groups

All versioned backend APIs are mounted under:

```text
/api/v1
```

Main API groups:

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

Use Swagger UI for the complete endpoint list, request schemas, response
schemas, and error responses.

## Indexing flow

1. A user or admin creates an indexing batch.
2. Images are uploaded to the backend and saved under the static image storage.
3. The backend creates image and indexing item records in PostgreSQL.
4. The backend sends uploaded items to the AI service.
5. The AI service runs CLIP embedding and writes vectors to Qdrant.
6. OCR extraction runs separately so OCR failure does not block semantic image
   search.
7. Item status is updated in PostgreSQL for progress tracking, retry, and error
   handling.

## Image ownership and deletion

- User-uploaded images are owned by the uploading user.
- Users can manage their own image library.
- Soft-deleted images are hidden from normal library, search, bookmark, and
  album workflows.
- Deleted images can be restored or permanently deleted.
- Dataset images without a user owner can be treated as public indexed images.

## AI tuning

CPU and worker tuning details for indexing are documented in:

```text
AI_INDEXING_TUNING.md
```


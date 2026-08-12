# Visual Search Engine

Visual Search Engine lets authenticated users find images by text, OCR content,
or visual similarity. Administrators can upload and index image batches, view
progress, browse indexed images, and manage users.

## Main features

- Text and image-to-image search with similarity-ranked results.
- Image detail view, zoom, crop-to-search, bookmarks, and search history.
- Responsive user interface for desktop and mobile.
- Admin dashboard, user management, image library, and live batch indexing.
- CLIP embeddings and OCR processing, with PostgreSQL metadata and Qdrant
  vector search.

## Architecture

| Service | Purpose | Default address |
| --- | --- | --- |
| `frontend` | React application | http://localhost:5173 |
| `backend` | FastAPI REST API and static images | http://localhost:8000 |
| `ai_service` | Embedding, OCR, and batch indexing | http://localhost:8001 |
| `postgres` | Users, images, history, bookmarks, and batches | localhost:5432 |
| `qdrant` | Image vectors for similarity search | http://localhost:6333 |
| `pgadmin` | Optional PostgreSQL browser | http://localhost:5050 |

## Run with Docker

### 1. Prepare Backend environment

```bash
cp backend/.env.example backend/.env
```

Update `JWT_SECRET_KEY` before sharing or deploying the project. The default
database and Qdrant URLs are already configured for Docker Compose.

### 2. Start the stack

```bash
docker compose up --build
```

Open the Frontend at http://localhost:5173 and API documentation at
http://localhost:8000/docs.

To run in the background:

```bash
docker compose up -d --build
```

To stop services while keeping local database and vector data:

```bash
docker compose down
```

## Run Frontend without Docker

```bash
cd visual-search-fe
cp .env.example .env
npm install
npm run dev
```

Set `VITE_ENABLE_MOCK=false` to call the Backend. Set it to `true` only when
developing the Search interface without a running API.

## Verification

```bash
cd visual-search-fe
npm run lint
npm run build
```

See [TESTING.md](TESTING.md) for the manual end-to-end checklist.

## CPU tuning for batch indexing

The AI service uses one shared CLIP model and one shared OCR model. CPU usage
is controlled by the following environment variables:

- `AI_CPU_THREADS`: logical CPU threads available to AI inference.
- `MAX_INDEX_WORKERS`: concurrent indexing workers, capped by the CPU budget.
- `AI_INFERENCE_THREADS`: PyTorch threads used for model inference.
- `CLIP_IMAGE_BATCH_SIZE`: images combined into one CLIP forward pass.
- `OCR_MAX_CONCURRENT_INFERENCE`: maximum simultaneous OCR calls.
- `OCR_MAX_INPUT_DIMENSION`: maximum image dimension sent to OCR.

The Docker development profile targets a 6-core/12-thread CPU. For a smaller
machine, use `AI_CPU_THREADS=4`, `AI_INFERENCE_THREADS=4`,
`MAX_INDEX_WORKERS=1`, and `OCR_RECOGNITION_BATCH_SIZE=1`.

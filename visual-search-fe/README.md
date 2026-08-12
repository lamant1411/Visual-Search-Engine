# Visual Search Engine Frontend

React application for Visual Search Engine. It provides user search flows,
bookmarks, history, an indexed image library, and administrator tools.

## Stack

- React 19, TypeScript, Vite, and Tailwind CSS.
- React Router 8 for public, authenticated, and admin routes.
- Axios and TanStack Query 5 for API calls, caching, and async states.
- Lucide React for icons and React Easy Crop for crop-to-search.

## Setup

```bash
cp .env.example .env
npm install
npm run dev
```

The development server starts at http://localhost:5173.

## Environment variables

| Variable | Description |
| --- | --- |
| `VITE_API_BASE_URL` | Backend API base URL, normally `http://localhost:8000/api/v1`. |
| `VITE_ENABLE_MOCK` | Set to `false` for real API integration; set to `true` for local search mock data. |
| `VITE_DEV_PROXY_TARGET` | Backend origin used by Vite to proxy `/static` images for crop support. |

## Useful commands

```bash
npm run dev
npm run lint
npm run build
npm run preview
```

## Project structure

```text
src/
├── app/          # Router and global providers
├── components/   # Shared UI, layouts, and reusable feature components
├── contexts/     # Authentication context
├── features/     # Search, crop, result and bookmark logic
├── lib/          # Axios client, API services, auth, and UI utilities
├── mocks/        # Local mock search data, enabled by VITE_ENABLE_MOCK
├── pages/        # Route pages including admin pages
└── styles/       # Global styles and design tokens
```

## User-facing flows

- Search by text or reference image.
- Browse results with infinite scroll, open details, zoom, crop, and find
  similar images.
- Save or remove bookmarks and review search history.
- Browse the indexed image library.
- Upload and index images, monitor batches, and manage users as an admin.

# Frontend verification report - 2026-08-12

## Scope

- Environment: `http://98.88.36.118:5173`
- Desktop and mobile viewport (`390 x 844`)
- Public Search, authentication gate, authentication forms, protected-route
  redirect, image detail modal, and fallback route
- Build quality checks against local `dev` at commit `7e34a44`

## Results

| Area | Scenario | Result | Evidence / note |
| --- | --- | --- | --- |
| Search Home | Load the public Search page on desktop | Pass | Page loaded without console errors. Search modes, suggestions, and sample results were visible. |
| Search Home | Switch from Text to Image | Pass | Upload area and disabled Search button appeared correctly. |
| Search Home | Open the mobile header search | Pass | Compact search control opened at `390px`; Text/Image modes remained accessible. |
| Auth Search flow | Submit a text search while signed out | Pass | The sign-in dialog opened and preserved the selected action. |
| Protected routes | Open `/bookmark` while signed out | Pass | Redirected to `/login`. |
| Login | Mobile layout and field visibility | Pass | Email, password, visibility control, submit action, and Register navigation were visible. |
| Register | Empty-form validation | Pass | Required messages appeared for name, email, password, and password confirmation without an API request. |
| Image detail | Open a sample image on mobile | Pass | Zoom controls, metadata, OCR text, Bookmark, crop/find-similar, and Copy URL actions were visible in a scrollable modal. |
| Routing | Open an unknown URL | Pass | The custom 404 page was displayed without console errors. |
| Release checks | Run lint and production build | Pass | `npm run lint` and `npm run build` completed successfully. |
| Docker config | Validate Compose configuration | Pass | `docker compose config --quiet` completed successfully. |

## Pending authenticated E2E checks

The following scenarios require test user/admin credentials or an already
authenticated browser session. They were not marked as passed during this run:

- Real Text Search and Image Search API responses
- Infinite loading and duplicate prevention in Search Results
- Bookmark save/remove/Undo against the real API
- Search History and search-again behavior
- Albums and Image Library data operations
- Admin Overview, Users, and full Indexing workflow
- Logout and token-expiration behavior

Continue with the shared checklist in [`TESTING.md`](../TESTING.md) after test
credentials are available.

## Findings

1. **Server-only stale UI:** The deployed Login page still shows a `Forgot
   password?` link to `/forgot-password`, but that route is not implemented.
   The link has already been removed in the local handover changes and must be
   verified again after the next deployment.
2. **Development deployment:** The current server exposes Vite development
   assets (`/@vite/client` and `/src/main.tsx`). This is acceptable for the
   company preview but should not be described as a production build.
3. **Deployment-safe API paths:** Local handover changes use `/api/v1` and
   proxy `/api` plus `/static` to Backend, avoiding browser requests to the
   visitor's `localhost`. These changes still need to be committed and deployed.

## Evidence

- [`search-desktop.png`](evidence/2026-08-12/search-desktop.png)
- [`search-login-gate.png`](evidence/2026-08-12/search-login-gate.png)
- [`search-mobile-viewport.png`](evidence/2026-08-12/search-mobile-viewport.png)
- [`search-mobile-image-mode.png`](evidence/2026-08-12/search-mobile-image-mode.png)
- [`image-detail-mobile.png`](evidence/2026-08-12/image-detail-mobile.png)
- [`login-mobile.png`](evidence/2026-08-12/login-mobile.png)
- [`register-mobile.png`](evidence/2026-08-12/register-mobile.png)

## Preview flow for Friday

1. Open Search Home and explain Text Search and Image Search.
2. Demonstrate an authenticated text search and infinite Search Results.
3. Open an image detail, zoom, bookmark it, crop an area, and find similar
   images.
4. Show Bookmark, History, Albums, and Image Library.
5. Sign in as an admin and demonstrate Overview, Users, and one small Indexing
   batch with live progress.
6. End with responsive behavior on a mobile viewport and summarize the FE/BE/AI
   integration.

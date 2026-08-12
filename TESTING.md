# Manual verification checklist

Latest recorded run: [`docs/TEST_REPORT_2026-08-12.md`](docs/TEST_REPORT_2026-08-12.md).

Run the stack with `docker compose up --build`, then use the Frontend at
http://localhost:5173. Use the API documentation at http://localhost:8000/docs
to inspect the available endpoints when diagnosing an integration issue.

## Authentication

- Register a new account with a valid email and a password that meets the UI
  rules.
- Log in, refresh the page, and confirm the session remains available.
- Log out and confirm protected pages redirect to Login.
- Sign in as an admin and confirm `/admin` is accessible; a normal user must
  not be able to access it.

## Search

- Submit a text search and confirm results, similarity scores, loading, empty,
  and error states behave correctly.
- Upload a valid image and confirm image search opens Results.
- Reject unsupported formats and oversized files with a clear message.
- Scroll Results to load the next page without duplicate cards.
- Open an image, zoom it, save/remove a bookmark, and use “find similar”.
- Crop an image area, apply the crop, and confirm a new similar-image search is
  created. Test the full-image fallback if a remote image cannot be cropped.

## Personal data

- Save an image, check it in Bookmarks, then remove it and use Undo.
- Open History, run a search again from an entry, and confirm its query/mode is
  restored.
- Open Image Library and check image fallback behavior if the source cannot be
  loaded.

## Admin indexing

- Upload a small set of valid images and start an indexing batch.
- Confirm upload and indexing progress update independently.
- Confirm processed, successful, failed, and duplicate counts are plausible.
- Cancel a running batch and confirm the UI shows the cancelled status.
- Open the completed batch in Image Library and verify indexed images appear.

## Responsive and release checks

- Repeat Search, image detail, and account-menu interactions at mobile width.
- Confirm keyboard focus is visible and dialogs close with Escape.
- Run `npm run lint` and `npm run build` in `visual-search-fe` before release.

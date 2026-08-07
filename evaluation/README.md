# Final project evaluation

This folder provides a repeatable, read-only-by-default evaluation for the
final Visual Search Engine demo. It measures the requirements that can be
verified through the existing API and keeps the remaining UI/deployment checks
as an evidence-based checklist.

## What is evaluated

- Exactly 50 labelled queries across semantic text, OCR text, and image search.
- Top-20 response contract, judged coverage@10, Precision@10, Hit@10, MRR,
  Recall@10, and nDCG@10. Final quality metrics are withheld when any returned
  Top-10 item has not been judged. Query-level percentile-bootstrap 95%
  confidence intervals are reported for every final quality metric.
- Mean, P50, P95, and maximum response time. Strict compliance requires every
  semantic/OCR request to be below 2 seconds and every image request below 3
  seconds.
- At least 50,000 successfully indexed **dataset** images. User uploads are
  reported separately and do not inflate this requirement.
- Average full CLIP+OCR indexing time below 5 seconds per successful image,
  read from a completed batch containing at least 50 successful images. Upload time is reported separately by
  the product UI and is intentionally excluded from model indexing time.
- Manual evidence for authentication, UX states, image crop/preview, progress
  persistence, responsive Top-20 results, and Docker Compose startup.

The project brief asks for a Precision@10 report but does not define a minimum
acceptable value. The evaluator therefore reports P@10 without inventing a
pass threshold. To add a team-agreed quality gate, set for example:

```json
"min_mean_precision_at_10": {
  "semantic": 0.6,
  "ocr": 0.8,
  "image": 0.6
}
```

These values are examples, not official project thresholds.

## 1. Prepare the 50-query ground truth

From the repository root:

```powershell
python evaluation/create_manifest.py
```

This creates `evaluation/ground-truth.json` with 20 semantic, 15 OCR, and 15
image-query slots. Then:

1. Replace unsuitable example text with queries representative of the indexed
   Open Images and Unsplash Lite data.
2. Copy 15 query images into `evaluation/query-images/` or set an indexed
   `image_id` instead of `image_path`.
3. Fill `relevant_image_ids` using human judgement. Label at least 10 relevant
   images per query where the dataset permits; fewer labels cap the maximum
   possible Precision@10.
4. For an uploaded query image already present in the index, set
   `exclude_image_id` so the exact source does not receive trivial relevance
   credit.
5. Change each manual check to `pass` or `fail` and add a screenshot, test log,
   or demo note in `evidence`.

Search rankings may be used to build a candidate pool, but retrieved items must
never be marked relevant automatically. Combine candidates from metadata and,
where possible, more than one model/configuration. Use at least two reviewers
for ambiguous semantic/image relevance and resolve disagreements before the
final run.

For the current local Unsplash Lite + PostgreSQL dataset, a reproducible draft
can be generated automatically while all Docker Compose services are running:

First generate a metadata/OCR-fixture draft:

```powershell
python -X utf8 evaluation/prepare_ground_truth.py --force
```

Run one provisional search pass to collect retrieved candidates. Draft labels
produce provisional fields only; the official P@10/nDCG fields remain `N/A`:

```powershell
python -X utf8 evaluation/evaluate.py `
  --manifest evaluation/ground-truth.json `
  --env-file backend/.env `
  --batch-id idx_39634fb15e1a `
  --runs 1 `
  --warmup-runs 1 `
  --output-dir evaluation/results/candidate-pool
```

Merge those Top-20 IDs with independent metadata/OCR candidates:

```powershell
python -X utf8 evaluation/prepare_ground_truth.py `
  --force `
  --candidate-report evaluation/results/candidate-pool/evaluation-report.json
```

`--candidate-report` can be repeated for reports from another prompt strategy
or model. Open `evaluation/ground-truth-review.html`, judge every card as not
relevant, relevant, or highly relevant, and export the reviewed JSON. Replace
`evaluation/ground-truth.json` with that exported file. The browser stores
in-progress judgements in localStorage.

The Vietnamese OCR fixtures in `evaluation/ocr-fixtures.json` are based on
visible text, not on OCR output. This means a missed recognition such as
`Nhím` is counted as a real failure rather than disappearing from ground truth.

Validate without contacting the server:

```powershell
python evaluation/evaluate.py --manifest evaluation/ground-truth.json --validate-only
```

## 1b. Measure human-label reliability

A single reviewer is acceptable for a draft, but it is weak evidence for a
final technical report. Keep the existing 1,980 judgements and ask a different
person to review a deterministic 30% sample independently. The sample is
stratified by query, contains every search mode, and copies neither the primary
grades nor the primary reviewer name.

Create the sample:

```powershell
python -X utf8 evaluation/create_reliability_sample.py `
  --input evaluation/ground-truth.reviewed.json `
  --output evaluation/reliability/second-review.sample.json `
  --sample-ratio 0.30 `
  --seed 2026
```

With PostgreSQL/backend image paths available through Docker Compose, generate
a blind gallery. Metadata/OCR hints and the first review's labels are hidden:

```powershell
python -X utf8 evaluation/prepare_ground_truth.py `
  --input-manifest evaluation/reliability/second-review.sample.json `
  --review-html evaluation/reliability/second-review.html `
  --blind-review
```

Give `second-review.html` to a different reviewer. They must use the same written
grading protocol, work independently, and export `second-review.reviewed.json`.
Place the export in `evaluation/reliability/`, then calculate agreement:

```powershell
python -X utf8 evaluation/reviewer_agreement.py `
  --primary evaluation/ground-truth.reviewed.json `
  --secondary evaluation/reliability/second-review.reviewed.json `
  --output-dir evaluation/reliability/agreement-final
```

The output includes exact agreement with a Wilson 95% interval, unweighted
Cohen's kappa, quadratic-weighted kappa for grades 0/1/2, binary relevance
kappa, a confusion matrix, and a disagreement CSV. Do not silently choose the
first reviewer's grade when labels differ.

The evidence can be embedded directly in the main evaluation report while
adjudication is still pending:

```powershell
python -X utf8 evaluation/evaluate.py `
  --manifest evaluation/ground-truth.reviewed.json `
  --agreement-report evaluation/reliability/agreement-final/reviewer-agreement.json `
  --env-file backend/.env `
  --runs 3 `
  --warmup-runs 1 `
  --shuffle
```

For stronger evidence, let a third person blindly adjudicate disagreements:

```powershell
python -X utf8 evaluation/prepare_ground_truth.py `
  --input-manifest evaluation/reliability/agreement-final/adjudication.sample.json `
  --review-html evaluation/reliability/adjudication.html `
  --blind-review

python -X utf8 evaluation/reviewer_agreement.py `
  --primary evaluation/ground-truth.reviewed.json `
  --secondary evaluation/reliability/second-review.reviewed.json `
  --adjudication evaluation/reliability/adjudication.reviewed.json `
  --output-dir evaluation/reliability/agreement-final `
  --merged-output evaluation/ground-truth.consensus.json
```

Use `ground-truth.consensus.json` for the final evaluator run. None of these
steps changes Qdrant, PostgreSQL, stored OCR, or the already indexed 85K images.

## 2. Run the system and evaluate

Start the current application normally:

```powershell
docker compose up -d
```

Set credentials in the current PowerShell session. The account must have the
admin role so dataset and indexing evidence can be read:

```powershell
$env:EVAL_EMAIL="admin@example.com"
$env:EVAL_PASSWORD="your-password"
python evaluation/evaluate.py --manifest evaluation/ground-truth.json
```

You can instead copy `.env.example` to an ignored local file and pass
`--env-file`, or provide `EVAL_ACCESS_TOKEN`. Passing `--env-file backend/.env`
also recognizes the existing `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`
variables. Credentials and tokens are never written to reports.

Therefore, with the current local setup the shortest complete command is:

```powershell
python evaluation/evaluate.py `
  --manifest evaluation/ground-truth.json `
  --env-file backend/.env `
  --shuffle
```

By default, the evaluator uses the most recent completed indexing batch with at
least 50 successfully processed images. Pinning a fixed batch is still better
for reproducibility:

```powershell
python evaluation/evaluate.py `
  --manifest evaluation/ground-truth.json `
  --batch-id idx_39634fb15e1a
```

The evaluator only performs authenticated searches and GET requests for admin
metrics. It does not upload, delete, re-index, or modify the 60K/85K dataset.
Search history rows are created by the existing search endpoints.

## 3. Use the results

Each run creates a timestamped folder under `evaluation/results/` containing:

- `evaluation-report.md`: presentation-ready requirement summary.
- `evaluation-report.json`: complete machine-readable evidence.
- `query-results.csv`: per-query repeated latency, label coverage, official and
  provisional quality metrics, result IDs, and errors.

The Markdown and JSON reports also contain 95% bootstrap confidence intervals.
Wide intervals mean the query set is still too small or heterogeneous; they are
not fixed by repeating the same API request more times. Add independently chosen
holdout queries if narrower generalization evidence is required.

Exit code `0` means every configured requirement passed. Exit code `2` means
the run completed but at least one requirement failed or a manual check is
still `not_tested`. Exit code `1` means the evaluation could not run.

For the final report, keep the manifest, exact commit hash, Docker configuration,
machine CPU/RAM, dataset counts, and one timestamped result folder together.
The CLI defaults to three full runs after one discarded warm-up request per
mode. Per-query latency uses the median while the mode summary reports every
measured request, including strict maximum-threshold compliance.

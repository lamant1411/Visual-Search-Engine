# Visual-Search-Engine

## CPU tuning for batch indexing

The AI service uses one shared CLIP model and one shared EasyOCR model. Its CPU
budget is controlled with these environment variables:

- `AI_CPU_THREADS`: total logical CPU threads available to AI inference. The
  default is the smaller of 4 or the detected CPU count minus one.
- `MAX_INDEX_WORKERS`: concurrent item workers. The default is 1 and the value
  is capped by `AI_CPU_THREADS`.
- `TORCH_NUM_INTEROP_THREADS`: PyTorch inter-op threads. Keep this at 1 for the
  current per-image pipeline.
- `OCR_MAX_INPUT_DIMENSION`: maximum image dimension passed to EasyOCR. Lower
  values use less CPU at the cost of small-text accuracy.

The development Docker configuration is tuned for a 6-core/12-thread CPU: ten
inference threads shared by two item workers, leaving two logical CPUs for the
API, database, and Docker. For a smaller machine, use the latency-friendly
profile `AI_CPU_THREADS=4` and `MAX_INDEX_WORKERS=1`. For fastest batch
throughput, start with `AI_CPU_THREADS=<logical CPUs minus 2>` and
`MAX_INDEX_WORKERS=2`, then compare a 100-image benchmark before increasing it.

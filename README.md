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

The development Docker configuration is tuned for maximum batch throughput on
a 6-core/12-thread CPU: twelve inference threads shared by two item workers,
with EasyOCR recognizing up to four detected text regions per inference batch.
For a smaller machine, use the latency-friendly profile `AI_CPU_THREADS=4`,
`MAX_INDEX_WORKERS=1`, and `OCR_RECOGNITION_BATCH_SIZE=1`. If the API must stay
responsive during indexing, reserve two logical CPUs with
`AI_CPU_THREADS=<logical CPUs minus 2>` and keep `MAX_INDEX_WORKERS=2`.

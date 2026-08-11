# AI indexing tuning

The AI service uses one shared CLIP model and one shared EasyOCR model. Its CPU
budget is controlled with these environment variables:

- `AI_CPU_THREADS`: total logical CPU threads available to AI inference. The
  default is the smaller of 4 or the detected CPU count minus one.
- `MAX_INDEX_WORKERS`: concurrent item workers. The default is 1 and the value
  is capped by `AI_CPU_THREADS`.
- `AI_INFERENCE_THREADS`: PyTorch intra-op threads used by each active model
  call. By default the CPU budget is divided by the item-worker count.
- `TORCH_NUM_INTEROP_THREADS`: PyTorch inter-op threads. Keep this at 1 for the
  current per-image pipeline.
- `CLIP_IMAGE_BATCH_SIZE`: concurrent image requests combined into one CLIP
  forward pass. Keep this at 2 for the current CPU profile.
- `OCR_MAX_CONCURRENT_INFERENCE`: maximum simultaneous EasyOCR calls. The
  current 12-thread profile uses 2 and automatically falls back to serial mode
  if EasyOCR reports a runtime/concurrency failure.
- `OCR_MAX_INPUT_DIMENSION`: maximum image dimension passed to EasyOCR. Lower
  values use less CPU at the cost of small-text accuracy.

The development Docker configuration is tuned for maximum batch throughput on
a 6-core/12-thread CPU. Four queue workers keep the stages fed while each model
call uses four threads. One CLIP call and up to two EasyOCR calls can overlap,
filling 12 logical CPUs. CLIP dynamically combines two concurrent image
requests, and EasyOCR recognizes up to four detected text regions per batch.
For a smaller machine, use the latency-friendly profile `AI_CPU_THREADS=4`,
`AI_INFERENCE_THREADS=4`, `MAX_INDEX_WORKERS=1`, and
`OCR_RECOGNITION_BATCH_SIZE=1`. If the API must stay responsive during
indexing, reserve two logical CPUs and set `AI_INFERENCE_THREADS` to half of
`AI_CPU_THREADS`.

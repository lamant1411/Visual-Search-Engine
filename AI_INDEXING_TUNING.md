# Tinh chỉnh hiệu năng AI indexing

Dịch vụ AI dùng chung một model CLIP và một model EasyOCR. Ngân sách CPU được
điều khiển bằng các biến môi trường sau:

- `AI_CPU_THREADS`: tổng số luồng CPU logic dành cho AI inference. Mặc định là
  giá trị nhỏ hơn giữa 4 và số CPU phát hiện được trừ một.
- `MAX_INDEX_WORKERS`: số worker xử lý item đồng thời. Mặc định là 1 và không
  vượt quá `AI_CPU_THREADS`.
- `AI_INFERENCE_THREADS`: số luồng intra-op của PyTorch cho mỗi lần gọi model.
  Mặc định ngân sách CPU được chia theo số item worker.
- `TORCH_NUM_INTEROP_THREADS`: số luồng inter-op của PyTorch. Giữ bằng 1 với
  pipeline xử lý từng ảnh hiện tại.
- `CLIP_IMAGE_BATCH_SIZE`: số request ảnh đồng thời được gộp trong một lượt
  forward CLIP. Giữ bằng 2 với cấu hình CPU hiện tại.
- `OCR_MAX_CONCURRENT_INFERENCE`: số lượt EasyOCR tối đa chạy đồng thời. Cấu
  hình 12 luồng hiện tại dùng 2 và tự chuyển về tuần tự nếu EasyOCR báo lỗi runtime/concurrency.
- `OCR_MAX_INPUT_DIMENSION`: kích thước lớn nhất của ảnh đưa vào EasyOCR. Giá
  trị thấp dùng ít CPU hơn nhưng có thể giảm độ chính xác với chữ nhỏ.

Docker development được tinh chỉnh để đạt thông lượng batch cao trên CPU 6
nhân/12 luồng. Bốn queue worker duy trì dữ liệu cho pipeline, mỗi lần gọi model
dùng bốn luồng. Một lượt CLIP và tối đa hai lượt EasyOCR có thể chạy xen kẽ để
tận dụng 12 CPU logic. CLIP gộp động hai request ảnh đồng thời và EasyOCR nhận
diện tối đa bốn vùng chữ trong mỗi batch. Với máy cấu hình thấp, dùng cấu hình
ưu tiên độ trễ `AI_CPU_THREADS=4`,
`AI_INFERENCE_THREADS=4`, `MAX_INDEX_WORKERS=1` và
`OCR_RECOGNITION_BATCH_SIZE=1`. Nếu API cần duy trì phản hồi trong khi indexing,
hãy dành lại hai CPU logic và đặt `AI_INFERENCE_THREADS` bằng một nửa
`AI_CPU_THREADS`.

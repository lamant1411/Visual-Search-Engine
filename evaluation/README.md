# Đánh giá dự án cuối kỳ

Thư mục này cung cấp quy trình đánh giá có thể lặp lại, mặc định chỉ đọc, dành
cho buổi demo cuối của Visual Search Engine. Quy trình đo các yêu cầu có thể xác
minh qua API hiện tại và giữ các kiểm tra UI/deploy còn lại dưới dạng checklist
có minh chứng.

## Nội dung đánh giá

- Chính xác 50 truy vấn đã gán nhãn, gồm Semantic Text Search, OCR Text Search
  và Image Search.
- Contract response Top-20, coverage@10 đã đánh giá, Precision@10, Hit@10, MRR,
  Recall@10 và nDCG@10. Chỉ công bố chỉ số chất lượng cuối khi mọi item Top-10
  trả về đã được đánh giá. Mỗi chỉ số chất lượng cuối có khoảng tin cậy 95% theo
  percentile bootstrap ở cấp truy vấn.
- Thời gian phản hồi trung bình, P50, P95 và tối đa. Đạt yêu cầu nghiêm ngặt khi
  mọi request Semantic/OCR dưới 2 giây và mọi request Image dưới 3 giây.
- Ít nhất 50.000 ảnh **dataset** được index thành công. Ảnh người dùng tải lên
  được báo cáo riêng và không tính vào yêu cầu này.
- Thời gian CLIP+OCR đầy đủ trung bình dưới 5 giây cho mỗi ảnh thành công, lấy
  từ một batch hoàn thành có ít nhất 50 ảnh thành công. Thời gian upload được UI
  sản phẩm báo cáo riêng và không tính vào thời gian model indexing.
- Minh chứng thủ công cho xác thực, trạng thái UX, crop/preview ảnh, lưu tiến
  trình, kết quả Top-20 responsive và khởi động Docker Compose.

Đề bài yêu cầu báo cáo Precision@10 nhưng không quy định ngưỡng đạt tối thiểu.
Vì vậy evaluator chỉ báo cáo P@10, không tự đặt ngưỡng. Để thêm ngưỡng chất
lượng do nhóm thống nhất, có thể cấu hình ví dụ:

```json
"min_mean_precision_at_10": {
  "semantic": 0.6,
  "ocr": 0.8,
  "image": 0.6
}
```

Các giá trị trên chỉ là ví dụ, không phải ngưỡng chính thức của dự án.

## 1. Chuẩn bị ground truth gồm 50 truy vấn

Từ thư mục gốc repository:

```powershell
python evaluation/create_manifest.py
```

Lệnh tạo `evaluation/ground-truth.json` với 20 vị trí Semantic, 15 vị trí OCR
và 15 vị trí truy vấn ảnh. Sau đó:

1. Thay nội dung ví dụ chưa phù hợp bằng truy vấn đại diện cho dữ liệu Open Images
   và Unsplash Lite đã index.
2. Chép 15 ảnh truy vấn vào `evaluation/query-images/`, hoặc đặt `image_id` của
   ảnh đã index thay cho `image_path`.
3. Điền `relevant_image_ids` bằng đánh giá của con người. Nếu dataset cho phép,
   gán ít nhất 10 ảnh liên quan cho mỗi truy vấn; ít nhãn hơn sẽ giới hạn
   Precision@10 tối đa có thể đạt.
4. Với ảnh truy vấn đã có sẵn trong index, đặt `exclude_image_id` để ảnh nguồn
   chính xác không được tính điểm liên quan một cách hiển nhiên.
5. Đổi từng kiểm tra thủ công thành `pass` hoặc `fail`, rồi thêm ảnh chụp, log
   kiểm thử hoặc ghi chú demo vào `evidence`.

Có thể dùng xếp hạng tìm kiếm để tạo candidate pool nhưng tuyệt đối không tự
động đánh dấu item trả về là liên quan. Hãy kết hợp ứng viên từ metadata và, nếu
có thể, nhiều model/cấu hình. Dùng ít nhất hai người đánh giá với mức liên quan
Semantic/Image chưa rõ và giải quyết bất đồng trước lần chạy cuối.

Với dữ liệu Unsplash Lite + PostgreSQL hiện tại trên local, có thể tạo bản nháp
có thể tái lập khi toàn bộ dịch vụ Docker Compose đang chạy.

Đầu tiên, tạo bản nháp từ metadata/OCR fixture:

```powershell
python -X utf8 evaluation/prepare_ground_truth.py --force
```

Chạy một lượt tìm kiếm tạm để thu thập ứng viên. Nhãn nháp chỉ sinh trường tạm;
P@10/nDCG chính thức vẫn là `N/A`:

```powershell
python -X utf8 evaluation/evaluate.py `
  --manifest evaluation/ground-truth.json `
  --env-file backend/.env `
  --batch-id idx_39634fb15e1a `
  --runs 1 `
  --warmup-runs 1 `
  --output-dir evaluation/results/candidate-pool
```

Gộp các ID Top-20 với ứng viên metadata/OCR độc lập:

```powershell
python -X utf8 evaluation/prepare_ground_truth.py `
  --force `
  --candidate-report evaluation/results/candidate-pool/evaluation-report.json
```

Có thể lặp lại `--candidate-report` với báo cáo từ prompt hoặc model khác. Mở
`evaluation/ground-truth-review.html`, đánh giá từng thẻ là không liên quan,
liên quan hoặc rất liên quan rồi export JSON đã review. Thay
`evaluation/ground-truth.json` bằng file được export. Trình duyệt lưu đánh giá
đang làm trong localStorage.

Các OCR fixture tiếng Việt trong `evaluation/ocr-fixtures.json` dựa trên chữ
nhìn thấy trong ảnh, không dựa trên output OCR. Do đó lỗi nhận diện như bỏ sót
`Nhím` được tính là lỗi thực thay vì biến mất khỏi ground truth.

Validate mà không liên hệ server:

```powershell
python evaluation/evaluate.py --manifest evaluation/ground-truth.json --validate-only
```

## 1b. Đo độ tin cậy giữa người gán nhãn

Một người review có thể chấp nhận cho bản nháp nhưng là minh chứng yếu với báo
cáo kỹ thuật cuối. Giữ 1.980 nhận định hiện có và nhờ một người khác review độc
lập mẫu 30% cố định. Mẫu được phân tầng theo truy vấn, chứa mọi chế độ tìm kiếm
và không sao chép điểm hay tên người review chính.

Tạo mẫu:

```powershell
python -X utf8 evaluation/create_reliability_sample.py `
  --input evaluation/ground-truth.reviewed.json `
  --output evaluation/reliability/second-review.sample.json `
  --sample-ratio 0.30 `
  --seed 2026
```

Khi đường dẫn ảnh PostgreSQL/Backend khả dụng qua Docker Compose, tạo gallery
review ẩn danh. Gợi ý metadata/OCR và nhãn của lần review đầu sẽ bị ẩn:

```powershell
python -X utf8 evaluation/prepare_ground_truth.py `
  --input-manifest evaluation/reliability/second-review.sample.json `
  --review-html evaluation/reliability/second-review.html `
  --blind-review
```

Gửi `second-review.html` cho người đánh giá khác. Người này phải dùng cùng quy
tắc chấm, làm độc lập và export `second-review.reviewed.json`. Đặt file export
vào `evaluation/reliability/`, sau đó tính mức đồng thuận:

```powershell
python -X utf8 evaluation/reviewer_agreement.py `
  --primary evaluation/ground-truth.reviewed.json `
  --secondary evaluation/reliability/second-review.reviewed.json `
  --output-dir evaluation/reliability/agreement-final
```

Output gồm đồng thuận chính xác với khoảng Wilson 95%, Cohen's kappa không trọng
số, kappa trọng số bậc hai cho mức 0/1/2, kappa liên quan nhị phân, confusion
matrix và CSV bất đồng. Không được âm thầm chọn nhãn của người review đầu khi
hai bên khác nhau.

Có thể nhúng minh chứng trực tiếp vào báo cáo đánh giá chính trong khi vẫn đang
chờ phân xử:

```powershell
python -X utf8 evaluation/evaluate.py `
  --manifest evaluation/ground-truth.reviewed.json `
  --agreement-report evaluation/reliability/agreement-final/reviewer-agreement.json `
  --env-file backend/.env `
  --runs 3 `
  --warmup-runs 1 `
  --shuffle
```

Để có minh chứng mạnh hơn, nhờ người thứ ba phân xử ẩn danh các bất đồng:

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

Dùng `ground-truth.consensus.json` cho lần chạy evaluator cuối. Không bước nào
trong số này thay đổi Qdrant, PostgreSQL, OCR đã lưu hoặc 85K ảnh đã index.

## 2. Chạy hệ thống và đánh giá

Khởi động ứng dụng theo cách thông thường:

```powershell
docker compose up -d
```

Đặt thông tin đăng nhập trong phiên PowerShell hiện tại. Tài khoản phải có role
Admin để đọc minh chứng dataset và indexing:

```powershell
$env:EVAL_EMAIL="admin@example.com"
$env:EVAL_PASSWORD="your-password"
python evaluation/evaluate.py --manifest evaluation/ground-truth.json
```

Cũng có thể chép `.env.example` sang file local đã ignore rồi truyền
`--env-file`, hoặc cung cấp `EVAL_ACCESS_TOKEN`. Khi truyền
`--env-file backend/.env`, công cụ cũng nhận các biến `SEED_ADMIN_EMAIL` và
`SEED_ADMIN_PASSWORD`. Thông tin đăng nhập và token không được ghi vào báo cáo.

Với cấu hình local hiện tại, lệnh đầy đủ ngắn nhất là:

```powershell
python evaluation/evaluate.py `
  --manifest evaluation/ground-truth.json `
  --env-file backend/.env `
  --shuffle
```

Mặc định, evaluator dùng batch indexing hoàn thành gần nhất có ít nhất 50 ảnh
xử lý thành công. Chỉ định batch cố định vẫn tốt hơn cho khả năng tái lập:

```powershell
python evaluation/evaluate.py `
  --manifest evaluation/ground-truth.json `
  --batch-id idx_39634fb15e1a
```

Evaluator chỉ thực hiện tìm kiếm đã xác thực và GET request cho số liệu Admin.
Công cụ không upload, xóa, re-index hoặc sửa dataset 60K/85K. Các bản ghi lịch
sử tìm kiếm được tạo bởi endpoint Search hiện có.

## 3. Sử dụng kết quả

Mỗi lần chạy tạo một thư mục có timestamp trong `evaluation/results/`, gồm:

- `evaluation-report.md`: tóm tắt yêu cầu sẵn sàng để trình bày.
- `evaluation-report.json`: toàn bộ minh chứng ở định dạng máy đọc được.
- `query-results.csv`: độ trễ lặp lại theo truy vấn, độ phủ nhãn, chỉ số chất
  lượng chính thức và tạm thời, ID kết quả và lỗi.

Báo cáo Markdown và JSON cũng chứa khoảng tin cậy bootstrap 95%. Khoảng rộng
cho thấy tập truy vấn còn nhỏ hoặc không đồng nhất; lặp lại cùng request API
không giải quyết được vấn đề này. Hãy thêm truy vấn holdout được chọn độc lập
nếu cần minh chứng tổng quát hóa hẹp hơn.

Exit code `0` nghĩa là mọi yêu cầu cấu hình đều đạt. Exit code `2` nghĩa là lần
chạy hoàn tất nhưng có ít nhất một yêu cầu không đạt hoặc kiểm tra thủ công vẫn
là `not_tested`. Exit code `1` nghĩa là không thể chạy đánh giá.

Trong báo cáo cuối, lưu cùng nhau manifest, commit hash chính xác, cấu hình
Docker, CPU/RAM máy, số lượng dataset và một thư mục kết quả có timestamp. CLI
mặc định chạy ba lượt đầy đủ sau một request warm-up bị loại cho mỗi chế độ. Độ
trễ theo truy vấn dùng median, còn phần tổng hợp chế độ báo cáo mọi request đã
đo, bao gồm kiểm tra nghiêm ngặt ngưỡng tối đa.

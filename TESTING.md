# Checklist kiểm thử thủ công

Lần kiểm thử được ghi nhận gần nhất: [`docs/TEST_REPORT_2026-08-12.md`](docs/TEST_REPORT_2026-08-12.md).

Chạy hệ thống bằng `docker compose up --build`, sau đó truy cập Frontend tại
http://localhost:5173. Khi chẩn đoán lỗi tích hợp, dùng tài liệu API tại
http://localhost:8000/docs để kiểm tra các endpoint hiện có.

## Xác thực

- Đăng ký tài khoản mới bằng email hợp lệ và mật khẩu đáp ứng quy tắc giao diện.
- Đăng nhập, tải lại trang và xác nhận phiên đăng nhập vẫn còn.
- Đăng xuất và xác nhận trang được bảo vệ chuyển về Login.
- Đăng nhập bằng Admin và xác nhận truy cập được `/admin`; user thường không được truy cập.

## Tìm kiếm

- Tìm bằng văn bản và kiểm tra kết quả, điểm tương đồng, trạng thái loading, rỗng và lỗi.
- Tải ảnh hợp lệ và xác nhận Image Search mở trang Results.
- Kiểm tra định dạng không hỗ trợ và file quá lớn bị từ chối với thông báo rõ ràng.
- Cuộn Results để tải trang tiếp theo mà không lặp thẻ ảnh.
- Mở ảnh, zoom, thêm/xóa bookmark và dùng chức năng tìm ảnh tương tự.
- Crop một vùng ảnh, áp dụng và xác nhận tạo lượt tìm tương tự mới. Kiểm tra fallback
  dùng toàn bộ ảnh nếu ảnh từ xa không thể crop.

## Dữ liệu cá nhân

- Lưu ảnh, kiểm tra trong Bookmark, sau đó xóa và dùng Undo.
- Mở History, tìm lại từ một bản ghi và xác nhận query/chế độ được khôi phục.
- Mở Image Library và kiểm tra fallback khi nguồn ảnh không tải được.

## Admin indexing

- Tải một nhóm nhỏ ảnh hợp lệ và bắt đầu batch indexing.
- Xác nhận tiến trình upload và indexing cập nhật độc lập.
- Kiểm tra số ảnh đã xử lý, thành công, thất bại và trùng lặp hợp lý.
- Hủy batch đang chạy và xác nhận giao diện hiển thị trạng thái đã hủy.
- Mở batch hoàn thành trong Image Library và xác nhận ảnh đã index xuất hiện.

## Kiểm tra responsive và phát hành

- Lặp lại thao tác Search, chi tiết ảnh và menu tài khoản ở kích thước mobile.
- Xác nhận focus bàn phím nhìn thấy được và dialog đóng bằng phím Escape.
- Chạy `npm run lint` và `npm run build` trong `visual-search-fe` trước khi phát hành.

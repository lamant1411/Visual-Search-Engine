# Báo cáo kiểm tra Frontend - 2026-08-12

## Phạm vi

- Môi trường: `http://98.88.36.118:5173`
- Viewport desktop và mobile (`390 x 844`)
- Search công khai, chặn xác thực, form xác thực, chuyển hướng route được bảo vệ,
  modal chi tiết ảnh và fallback route
- Kiểm tra chất lượng build trên nhánh `dev` local tại commit `7e34a44`

## Kết quả

| Khu vực | Kịch bản | Kết quả | Minh chứng / ghi chú |
| --- | --- | --- | --- |
| Search Home | Mở trang Search công khai trên desktop | Đạt | Trang tải không có lỗi console; hiển thị chế độ tìm, gợi ý và kết quả mẫu. |
| Search Home | Chuyển từ Text sang Image | Đạt | Khu vực upload và nút Search bị vô hiệu hóa hiển thị đúng. |
| Search Home | Mở Search trên header mobile | Đạt | Điều khiển Search thu gọn mở ở `390px`; vẫn truy cập được chế độ Text/Image. |
| Luồng Auth Search | Tìm bằng text khi chưa đăng nhập | Đạt | Dialog đăng nhập mở và giữ lại hành động đã chọn. |
| Route bảo vệ | Mở `/bookmark` khi chưa đăng nhập | Đạt | Chuyển hướng đến `/login`. |
| Login | Bố cục mobile và khả năng nhìn thấy trường | Đạt | Hiển thị email, mật khẩu, nút hiện/ẩn, submit và điều hướng Register. |
| Register | Validate form rỗng | Đạt | Hiện thông báo bắt buộc cho tên, email, mật khẩu và xác nhận mà không gọi API. |
| Chi tiết ảnh | Mở ảnh mẫu trên mobile | Đạt | Modal cuộn được, hiển thị zoom, metadata, OCR, Bookmark, crop/tìm tương tự và Copy URL. |
| Routing | Mở URL không tồn tại | Đạt | Trang 404 tùy chỉnh hiển thị không có lỗi console. |
| Kiểm tra phát hành | Chạy lint và production build | Đạt | `npm run lint` và `npm run build` hoàn tất thành công. |
| Cấu hình Docker | Kiểm tra cấu hình Compose | Đạt | `docker compose config --quiet` hoàn tất thành công. |

## Kiểm thử E2E có xác thực đang chờ

Các kịch bản sau cần tài khoản user/admin test hoặc phiên trình duyệt đã xác
thực, vì vậy chưa được đánh dấu đạt trong lần chạy này:

- Response API thật của Text Search và Image Search
- Infinite loading và chống lặp dữ liệu trong Search Results
- Lưu/xóa/Undo Bookmark với API thật
- Search History và hành vi tìm lại
- Thao tác dữ liệu Album và Image Library
- Admin Overview, Users và toàn bộ luồng Indexing
- Đăng xuất và xử lý token hết hạn

Tiếp tục theo checklist chung trong [`TESTING.md`](../TESTING.md) khi có tài khoản test.

## Phát hiện

1. **UI cũ chỉ tồn tại trên server:** Trang Login đã deploy vẫn có liên kết
   `Forgot password?` đến `/forgot-password`, nhưng route này chưa được triển khai.
   Link đã được xóa trong thay đổi bàn giao local và cần kiểm tra lại sau lần deploy tiếp theo.
2. **Deploy development:** Server hiện tại đang phục vụ asset development của
   Vite (`/@vite/client` và `/src/main.tsx`). Cách này phù hợp để preview với
   công ty nhưng không nên mô tả là production build.
3. **Đường dẫn API phù hợp khi deploy:** Thay đổi bàn giao local dùng `/api/v1`
   và proxy `/api`, `/static` sang Backend, tránh gửi request đến `localhost`
   của người truy cập. Các thay đổi này vẫn cần commit và deploy.

## Minh chứng

- [`search-desktop.png`](evidence/2026-08-12/search-desktop.png)
- [`search-login-gate.png`](evidence/2026-08-12/search-login-gate.png)
- [`search-mobile-viewport.png`](evidence/2026-08-12/search-mobile-viewport.png)
- [`search-mobile-image-mode.png`](evidence/2026-08-12/search-mobile-image-mode.png)
- [`image-detail-mobile.png`](evidence/2026-08-12/image-detail-mobile.png)
- [`login-mobile.png`](evidence/2026-08-12/login-mobile.png)
- [`register-mobile.png`](evidence/2026-08-12/register-mobile.png)

## Kịch bản preview thứ Sáu

1. Mở Search Home và giải thích Text Search, Image Search.
2. Demo Text Search sau xác thực và Search Results dạng infinite scroll.
3. Mở chi tiết ảnh, zoom, bookmark, crop một vùng và tìm ảnh tương tự.
4. Trình bày Bookmark, History, Albums và Image Library.
5. Đăng nhập Admin, demo Overview, Users và một batch Indexing nhỏ có tiến trình trực tiếp.
6. Kết thúc bằng giao diện responsive trên mobile và tóm tắt tích hợp FE/BE/AI.

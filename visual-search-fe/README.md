# 🔍 Visual Search Engine - Frontend 

## Tech Stack

* **Core:** React 18 + Vite 
* **Ngôn ngữ:** TypeScript (Đảm bảo tính chặt chẽ của dữ liệu, đặc biệt là dữ liệu API trả về).
* **Routing:** React Router v6 (Quản lý luồng chuyển trang Login, Search, Admin...).
* **Gọi API & Quản lý State:** Axios + TanStack Query v5 (Tự động cache dữ liệu, quản lý trạng thái loading/error).
* **Mock API:** MSW (Mock Service Worker - Cho phép FE tự chạy với dữ liệu giả lập trong lúc chờ BE hoàn thiện API).
* **Kiến trúc thư mục:** Feature-Sliced Design (FSD - Chia module theo từng tính năng độc lập).

## Cấu trúc dự án 

Dự án áp dụng kiến trúc **Feature-Sliced Design**. Thay vì gom chung tất cả API vào một chỗ, tất cả Giao diện vào một chỗ, chúng ta chia theo từng **Tính năng (Feature)** :

```text
src/
 ├─ app/            # Cấu hình gốc của ứng dụng (Router, Provider)
 ├─ components/     # Các UI Component dùng chung toàn hệ thống (Button, Input, Layout)
 ├─ features/       # Vùng code nghiệp vụ chính (ĐƯỢC CHIA LÀM VIỆC TẠI ĐÂY)
 │   ├─ auth/       # Tính năng Đăng nhập / Đăng ký
 │   ├─ search/     # Tính năng Tìm kiếm bằng hình ảnh (Lõi của ứng dụng)
 │   └─ admin/      # Trang quản trị viên
 ├─ lib/            # Các cấu hình dùng chung (Axios client, Format dữ liệu)
 ├─ mocks/          # Chứa dữ liệu giả (Mock data) bằng MSW
 └─ styles/         # Biến màu sắc, font chữ chuẩn (Design Tokens)
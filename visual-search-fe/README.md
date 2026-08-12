# Frontend Visual Search Engine

Ứng dụng React của Visual Search Engine, cung cấp luồng tìm kiếm, bookmark,
lịch sử, thư viện ảnh đã index và các công cụ quản trị.

## Công nghệ

- React 19, TypeScript, Vite và Tailwind CSS.
- React Router 8 cho route công khai, route cần xác thực và route Admin.
- Axios và TanStack Query 5 để gọi API, cache và quản lý trạng thái bất đồng bộ.
- Lucide React cho icon và React Easy Crop cho chức năng crop-to-search.

## Cài đặt

```bash
cp .env.example .env
npm install
npm run dev
```

Development server chạy tại http://localhost:5173.

## Biến môi trường

| Biến | Mô tả |
| --- | --- |
| `VITE_API_BASE_URL` | Base URL của Backend API, thường là `http://localhost:8000/api/v1`. |
| `VITE_ENABLE_MOCK` | Đặt `false` để dùng API thật; đặt `true` để dùng mock data Search trên local. |
| `VITE_DEV_PROXY_TARGET` | Origin Backend để Vite proxy ảnh `/static`, phục vụ chức năng crop. |

## Lệnh thường dùng

```bash
npm run dev
npm run lint
npm run build
npm run preview
```

## Cấu trúc dự án

```text
src/
├── app/          # Router và provider toàn cục
├── components/   # UI dùng chung, layout và component tái sử dụng
├── contexts/     # Context xác thực
├── features/     # Logic Search, crop, kết quả và bookmark
├── lib/          # Axios client, API service, auth và tiện ích UI
├── mocks/        # Mock data Search trên local, bật bằng VITE_ENABLE_MOCK
├── pages/        # Các trang route, gồm cả trang Admin
└── styles/       # Style toàn cục và design token
```

## Luồng dành cho người dùng

- Tìm kiếm bằng văn bản hoặc ảnh tham chiếu.
- Xem kết quả bằng infinite scroll, mở chi tiết, zoom, crop và tìm ảnh tương tự.
- Lưu/xóa bookmark và xem lịch sử tìm kiếm.
- Duyệt thư viện ảnh đã index.
- Với Admin: tải và index ảnh, theo dõi batch và quản lý người dùng.

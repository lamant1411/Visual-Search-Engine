# Sử dụng Python 3.9 phiên bản slim để tối ưu dung lượng bộ nhớ
FROM python:3.9-slim

# Cài đặt các gói hệ thống bắt buộc cho OpenCV (Đã thay libgl1-mesa-glx thành libgl1)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Thiết lập thư mục làm việc bên trong container
WORKDIR /app

# Sao chép file cài đặt thư viện vào trước để tối ưu hóa Docker Cache
COPY requirements.txt .

# Nâng cấp bộ cài đặt pip và tiến hành cài các thư viện AI
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Sao chép toàn bộ mã nguồn và các file liên quan trong thư mục AI vào container
COPY . .

# Khai báo cổng kết nối mà AI Service sẽ sử dụng
EXPOSE 8001

# Lệnh mặc định để khởi chạy Server AI
CMD ["uvicorn", "ai_service:app", "--host", "0.0.0.0", "--port", "8001"]
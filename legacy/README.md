# Hako Downloader

Ứng dụng web tải light novel từ [Hako/Docln](https://docln.sbs), xuất ra TXT / DOCX / EPUB và đóng gói ZIP.

Sử dụng **FastAPI + Gradio + Playwright**.

## Tính năng

- Đăng nhập tài khoản Hako trực tiếp trên giao diện web
- Hỗ trợ truyện yêu cầu đăng nhập mới xem được
- Lấy danh sách tập từ URL truyện, chọn một hoặc nhiều tập để tải
- Xuất ra 3 định dạng: TXT, DOCX, EPUB
- Tự động đóng gói file ZIP
- Thanh tiến trình và nhật ký xử lý realtime
- Giới hạn 10 job tải song song (asyncio semaphore)
- Admin dashboard (`/admin`) để quản lý session, file đã tải, và thống kê server

## Yêu cầu

- Python 3.10+
- Chromium cho Playwright

## Cài đặt

```bash
pip install -r requirements.txt
playwright install chromium
```

## Cấu hình

Tạo file `.env` từ `.env.example`:

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin
```

## Chạy

```bash
python -m uvicorn app:app --host 127.0.0.1 --port 8000
```

Mở trình duyệt tại `http://127.0.0.1:8000`.

## Sử dụng

1. Nhập tài khoản Hako → **Đăng nhập**
2. Dán URL bộ truyện → **Lấy thông tin truyện**
3. Chọn tập và định dạng xuất → **Tải truyện**
4. Tải file từ danh sách kết quả

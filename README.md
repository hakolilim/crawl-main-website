# Hako Downloader Web

Ứng dụng web dùng **FastAPI + Gradio + Playwright** để:

- đăng nhập tài khoản Hako/Docln,
- lấy thông tin bộ truyện từ URL,
- chọn tập cần tải,
- xuất truyện ra các định dạng **TXT**, **DOCX**, **EPUB**,
- và tự động đóng gói thêm file **ZIP** để tải về thuận tiện.

## Tính năng chính

- Giao diện web đơn giản, chạy cục bộ.
- Đăng nhập Hako trực tiếp trên giao diện.
- Hỗ trợ truyện yêu cầu đăng nhập mới xem được.
- Lấy danh sách tập từ URL truyện.
- Chọn một hoặc nhiều tập để tải.
- Xuất ra nhiều định dạng:
  - `txt`
  - `docx`
  - `epub`
- Tự động tạo file `.zip` chứa toàn bộ file đã xuất.
- Có **thanh tiến trình tải truyện** trong giao diện.
- Có favicon và logo giao diện riêng trong thư mục `public/`.
- Giới hạn số job tải song song để tránh mở quá nhiều trình duyệt Playwright cùng lúc.

## Công nghệ sử dụng

- **FastAPI**: dựng web app và static files
- **Gradio**: giao diện người dùng
- **Playwright**: đăng nhập và crawl nội dung truyện
- **playwright-stealth**: giảm khả năng bị chặn bởi anti-bot cơ bản
- **BeautifulSoup4**: parse HTML
- **aiohttp**: tải ảnh trong chương
- **python-docx**: xuất file DOCX

## Yêu cầu môi trường

- Python **3.10+** khuyến nghị
- Windows / Linux / macOS
- Đã cài Chromium cho Playwright

## Cài đặt

### 1) Cài dependency Python

```bash
pip install -r requirements.txt
```

### 2) Cài trình duyệt Chromium cho Playwright

```bash
playwright install chromium
```

> Nếu lệnh `playwright` không có sẵn trong terminal, bạn có thể dùng:

```bash
python -m playwright install chromium
```

## Chạy ứng dụng

```bash
python -m uvicorn app:app --host 127.0.0.1 --port 8000
```

Sau đó mở trình duyệt tại:

```text
http://127.0.0.1:8000
```

## Cách sử dụng

1. Mở ứng dụng web.
2. Nhập tài khoản Hako/Docln và bấm **Đăng nhập**.
3. Dán URL bộ truyện vào ô **Link truyện**.
4. Bấm **Lấy thông tin truyện**.
5. Chọn các tập muốn tải.
6. Chọn định dạng xuất (`TXT`, `DOCX`, `EPUB`).
7. Bấm **Tải truyện**.
8. Theo dõi:
   - thanh tiến trình,
   - nhật ký xử lý,
   - danh sách file kết quả.

## Cấu trúc thư mục

```text
.
├── app.py                # Entry point FastAPI + Gradio UI
├── hako_service.py       # Đăng nhập, crawl truyện, xuất file
├── crawlhako.py          # Mã hỗ trợ/legacy liên quan crawler
├── requirements.txt      # Danh sách dependency
├── public/
│   ├── favicon.ico       # Favicon ứng dụng
│   └── logo.webp         # Logo giao diện
└── downloads/            # File tải về sinh ra khi chạy
```

## Cấu hình quan trọng

Trong `app.py`:

- `MAX_CONCURRENT_JOBS = 3`

Ý nghĩa:

- Giới hạn số job tải chạy song song.
- Giảm nguy cơ quá tải máy do Playwright mở nhiều browser/context cùng lúc.
- Phù hợp cho máy cá nhân hoặc VPS cấu hình vừa.

Nếu bạn muốn tăng thông lượng, có thể cân nhắc:

- tăng `MAX_CONCURRENT_JOBS`,
- nâng RAM/CPU,
- tách phần crawler sang queue/background worker,
- hoặc scale nhiều instance phía sau reverse proxy.

## Đầu ra file

Mỗi lần tải, ứng dụng sẽ tạo file trong thư mục `downloads/<session-id>/...`.

Các file kết quả có thể bao gồm:

- `.txt`
- `.docx`
- `.epub`
- `.zip` tổng hợp

## Lưu ý quan trọng

- Website nguồn có thể thay đổi selector HTML theo thời gian.
- Hệ thống đăng nhập có thể bị ảnh hưởng bởi captcha / anti-bot / thay đổi flow đăng nhập.
- Nếu Hako/Docln thay đổi giao diện, có thể cần cập nhật selector trong `hako_service.py`.
- Một số nội dung hoặc ảnh có thể tải chậm tùy mạng hoặc tình trạng website nguồn.
- Favicon có thể bị cache trong trình duyệt; nếu chưa thấy đổi ngay, hãy thử **Ctrl + F5**.

## Dọn file sinh ra

Thư mục `downloads/` được dùng để chứa kết quả tải về và đã được thêm vào `.gitignore`.

Bạn có thể xóa thủ công nếu muốn dọn dẹp dữ liệu cũ.

## Khắc phục sự cố nhanh

### 1) Không đăng nhập được

- Kiểm tra lại tài khoản/mật khẩu.
- Kiểm tra website nguồn có yêu cầu captcha không.
- Thử chạy lại app rồi đăng nhập lại.

### 2) Không thấy favicon mới

- Hard refresh trình duyệt: `Ctrl + F5`
- Xóa cache trình duyệt nếu cần.

### 3) Không tải được truyện

- Kiểm tra URL truyện có đúng không.
- Kiểm tra truyện có yêu cầu đăng nhập không.
- Xem ô **Nhật ký** để biết chương nào bị lỗi.

## Gợi ý phát triển tiếp

- Thêm hàng đợi tải nền.
- Thêm trang quản lý lịch sử tải.
- Thêm cấu hình thư mục output.
- Thêm retry cho ảnh/chương lỗi.
- Thêm kiểm tra trạng thái website nguồn.

---

Nếu cần, tôi có thể tiếp tục viết thêm phần:

- **hướng dẫn deploy VPS**,
- **systemd/nginx**,
- hoặc **README song ngữ Việt/Anh**.

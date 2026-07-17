# Hako Downloader (Next.js)

Ứng dụng web tải light novel từ [Hako/Docln](https://docln.sbs), xuất **TXT / DOCX / EPUB** và đóng gói ZIP.

Stack:

- **Frontend / App**: Next.js (App Router) + React
- **Auth & DB & Storage**: Supabase
- **Crawl browser**: [Playwright](https://playwright.dev/) local (`chromium.launch`)
- **Chạy**: local / self-host Node (không dùng Browserless)

## Kiến trúc

**Client orchestrator + API gateway**

| Việc | Nơi chạy |
|---|---|
| Điều phối job, progress, export file, upload Storage | **Browser (client)** |
| Login Hako / fetch novel / fetch 1 chapter (Playwright) | **Node API** (local Chromium) |
| Auth, metadata, RLS, Storage signed URL | **Supabase** |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** |

Client **không** nhận full Hako `storage_state` (cookies lưu trên `profiles` qua service role).

> **Lưu ý deploy:** Crawl cần Chromium local nên phù hợp **máy dev / VPS / Docker self-host**. Vercel serverless **không** được hỗ trợ cho crawl sau khi bỏ Browserless.

## Tính năng

- Đăng ký / đăng nhập app (Supabase Auth)
- Đăng nhập tài khoản Hako qua Playwright
- Lấy danh sách tập, chọn tập + định dạng xuất
- Tải từng chương (API ngắn), export TXT/DOCX/EPUB + ZIP trên client
- Lịch sử truyện / jobs / files
- Admin dashboard (role `admin`)

## Setup

### 1. Supabase

1. Tạo project tại https://supabase.com  
2. SQL Editor → chạy **bắt buộc** theo thứ tự:
   - `supabase/migrations/001_init.sql` (tables + RLS)
   - `supabase/migrations/002_storage_downloads.sql` (**bucket `downloads` + storage policies**)
3. Xác nhận Dashboard → **Storage** có bucket private tên `downloads`  
   - Nếu thiếu: lỗi upload sẽ là `Bucket not found` và file không vào Lịch sử  
4. Authentication → bật Email provider  
5. (Tuỳ chọn) tắt “Confirm email” khi dev  
6. Gán admin: sau khi user đăng ký, trong Table Editor `profiles` set `role = 'admin'`,  
   hoặc điền email vào `ADMIN_EMAILS` trước khi user được bootstrap

### 2. Playwright (Chromium)

```bash
npm install
npx playwright install chromium
# hoặc
npm run playwright:install
```

Binary được tải vào cache user (Windows: `%USERPROFILE%\AppData\Local\ms-playwright`).

### 3. Env

```bash
cp .env.example .env.local
```

Điền:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
ADMIN_EMAILS=you@email.com

# Optional — show browser while debugging login/crawl
# PLAYWRIGHT_HEADLESS=false
```

Không còn `BROWSERLESS_TOKEN` / `BROWSERLESS_WS_ENDPOINT`.

### 4. Chạy local

```bash
npm install
npx playwright install chromium
npm run dev
```

Mở http://localhost:3000

Route crawl đã set `maxDuration = 60` và `runtime = nodejs`.

`next.config.ts` dùng `serverExternalPackages: ["playwright"]` để không bundle Playwright vào app chunk.

## Sử dụng

1. Đăng ký / đăng nhập app  
2. Nhập tài khoản Hako → **Đăng nhập**  
3. Dán URL bộ truyện → **Lấy thông tin truyện**  
4. Chọn tập + định dạng → **Tải truyện** (giữ tab mở)  
5. Tải file từ danh sách kết quả hoặc trang **Lịch sử**

## Cấu trúc chính

```
app/                 # pages + API routes
components/          # UI
lib/hako/            # crawl (server) + export (client) + orchestrator
  browser.ts         # chromium.launch + withBrowserContext
lib/supabase/        # clients
supabase/migrations/ # SQL schema
legacy/              # bản Python/Gradio cũ
```

## Lưu ý

- Đóng tab khi đang tải sẽ dừng job (client-orchestrated).  
- Mỗi chapter = 1 lần `chromium.launch` (session ngắn, an toàn tài nguyên).  
- Anti-bot / captcha docln có thể làm login fail — thử `PLAYWRIGHT_HEADLESS=false` để debug.  
- Code Python cũ nằm trong `legacy/` để tham chiếu.

## Health

`GET /api/health` → `{ status: "ok" }`

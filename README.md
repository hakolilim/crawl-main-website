# Hako Downloader (Next.js)

Ứng dụng web tải light novel từ [Hako/Docln](https://docln.sbs), xuất **TXT / DOCX / EPUB** và đóng gói ZIP.

Stack mới:

- **Frontend / App**: Next.js (App Router) + React
- **Auth & DB & Storage**: Supabase
- **Crawl browser**: [browserless.io](https://www.browserless.io/) (Playwright remote)
- **Deploy**: Vercel

## Kiến trúc

**Client orchestrator + Vercel API gateway**

| Việc | Nơi chạy |
|---|---|
| Điều phối job, progress, export file, upload Storage | **Browser (client)** |
| Login Hako / fetch novel / fetch 1 chapter (Playwright) | **Vercel API** (giữ `BROWSERLESS_TOKEN`) |
| Auth, metadata, RLS, Storage signed URL | **Supabase** |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** |

Client **không** nhận Browserless token và **không** nhận full Hako `storage_state` (cookies lưu trên `profiles` qua service role).

## Tính năng

- Đăng ký / đăng nhập app (Supabase Auth)
- Đăng nhập tài khoản Hako qua Browserless
- Lấy danh sách tập, chọn tập + định dạng xuất
- Tải từng chương (API ngắn), export TXT/DOCX/EPUB + ZIP trên client
- Lịch sử truyện / jobs / files
- Admin dashboard (role `admin`)

## Setup

### 1. Supabase

1. Tạo project tại https://supabase.com  
2. SQL Editor → chạy toàn bộ `supabase/migrations/001_init.sql`  
3. Storage → tạo bucket **private** tên `downloads`  
4. Storage policies (SQL Editor), ví dụ:

```sql
insert into storage.buckets (id, name, public)
values ('downloads', 'downloads', false)
on conflict (id) do nothing;

create policy "storage_read_own" on storage.objects for select
  using (
    bucket_id = 'downloads'
    and (auth.uid()::text = (storage.foldername(name))[1] or public.is_admin())
  );

create policy "storage_insert_own" on storage.objects for insert
  with check (
    bucket_id = 'downloads'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "storage_update_own" on storage.objects for update
  using (
    bucket_id = 'downloads'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "storage_delete_own" on storage.objects for delete
  using (
    bucket_id = 'downloads'
    and (auth.uid()::text = (storage.foldername(name))[1] or public.is_admin())
  );
```

5. Authentication → bật Email provider  
6. (Tuỳ chọn) tắt “Confirm email” khi dev  
7. Gán admin: sau khi user đăng ký, trong Table Editor `profiles` set `role = 'admin'`,  
   hoặc điền email vào `ADMIN_EMAILS` trước khi user được bootstrap

### 2. Browserless

1. Đăng ký https://www.browserless.io/  
2. Lấy API token  
3. Endpoint **base** (không cần path):  
   - Khuyến nghị: `wss://production-sfo.browserless.io`  
   - Region khác: xem dashboard (lon/ams/…)  
4. Code tự nối path Playwright: `/chromium/playwright`  
   - **Không** dùng legacy `wss://chrome.browserless.io` (404/408)  
   - **Không** set tay `/chrome/playwright`


### 3. Env

```bash
cp .env.example .env.local
```

Điền:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
BROWSERLESS_TOKEN=...
BROWSERLESS_WS_ENDPOINT=wss://production-sfo.browserless.io
ADMIN_EMAILS=you@email.com


```

### 4. Chạy local

```bash
npm install
npm run dev
```

Mở http://localhost:3000

### 5. Deploy Vercel

1. Import repo  
2. Thêm cùng env vars (Production + Preview)  
3. Deploy  

Route crawl đã set `maxDuration = 60` và `runtime = nodejs`.

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
lib/supabase/        # clients
supabase/migrations/ # SQL schema
legacy/              # bản Python/Gradio cũ
```

## Lưu ý

- Đóng tab khi đang tải sẽ dừng job (client-orchestrated).  
- Mỗi chapter = 1 request Browserless → tốn quota.  
- Anti-bot / captcha docln có thể làm login fail — kiểm tra token Browserless và credentials.  
- Code Python cũ nằm trong `legacy/` để tham chiếu.

## Health

`GET /api/health` → `{ status: "ok" }`

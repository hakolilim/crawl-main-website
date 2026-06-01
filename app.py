import asyncio
import os
import shutil
import uuid
from pathlib import Path
from typing import Dict, List

import gradio as gr
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from hako_service import (
    AuthenticationError,
    HakoCrawler,
    HakoError,
    HakoSessionManager,
    SessionState,
    download_volumes,
    reset_output_dir,
)

load_dotenv()

ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin")

APP_TITLE = "Hako Downloader"
BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR / "public"
DOWNLOAD_DIR = BASE_DIR / "downloads"
FAVICON_PATH = PUBLIC_DIR / "favicon.ico"

APP_CONFIG = {
    "MAX_CONCURRENT_JOBS": 10,
    "MAX_SESSIONS": 20,
}

DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title=APP_TITLE)
app.mount("/public", StaticFiles(directory=str(PUBLIC_DIR)), name="public")
app.mount("/downloads", StaticFiles(directory=str(DOWNLOAD_DIR)), name="downloads")

session_store: Dict[str, Dict] = {}

class ConcurrencyManager:
    def __init__(self):
        self.active_jobs = 0
        self.cond = asyncio.Condition()

    async def acquire(self):
        async with self.cond:
            await self.cond.wait_for(lambda: self.active_jobs < APP_CONFIG["MAX_CONCURRENT_JOBS"])
            self.active_jobs += 1

    async def release(self):
        async with self.cond:
            self.active_jobs -= 1
            self.cond.notify()

download_manager = ConcurrencyManager()


async def ensure_user_session(session_id: str) -> Dict:
    if session_id not in session_store:
        if len(session_store) >= APP_CONFIG["MAX_SESSIONS"]:
            oldest_sid = next(iter(session_store))
            oldest_session = session_store[oldest_sid]
            if oldest_session.get("is_downloading", False):
                raise HakoError("Máy chủ đang đầy, vui lòng thử lại sau.")
            else:
                state = oldest_session.get("state")
                if state:
                    manager = HakoSessionManager(state)
                    await manager.close()
                del session_store[oldest_sid]

        user_dir = DOWNLOAD_DIR / session_id
        user_dir.mkdir(parents=True, exist_ok=True)
        session_store[session_id] = {
            "state": SessionState(),
            "novel_data": None,
            "volumes": [],
            "status": "Chưa đăng nhập.",
            "output_dir": str(user_dir),
            "is_downloading": False,
        }
    return session_store[session_id]


def format_volume_choices(volumes: List[Dict]) -> List[tuple]:
    return [(f"[{vol['id']}] {vol['title']} ({vol['chapter_count']} chương)", vol["id"]) for vol in volumes]


def render_summary(novel_data: Dict) -> str:
    if not novel_data:
        return "<div class='panel'><p>Chưa có dữ liệu truyện.</p></div>"
    return f"""
    <div class='panel'>
      <h3>{novel_data['title']}</h3>
      <p><strong>Tác giả:</strong> {novel_data['author']}</p>
      <p><strong>Thể loại:</strong> {novel_data['genres']}</p>
      <details open>
        <summary><strong>Tóm tắt</strong></summary>
        <div style='margin-top: 8px;'>{novel_data['summary']}</div>
      </details>
      <p><strong>Số tập:</strong> {len(novel_data['volumes'])}</p>
    </div>
    """


async def do_login(session_id: str, username: str, password: str):
    session = await ensure_user_session(session_id)
    manager = HakoSessionManager(session["state"])
    if not username or not password:
        return "Vui lòng nhập tài khoản và mật khẩu Hako.", session["status"]
    try:
        label = await manager.login(username, password)
        session["status"] = f"Đã đăng nhập: {label}"
        return session["status"], session["status"]
    except AuthenticationError as exc:
        session["status"] = f"Đăng nhập thất bại: {exc}"
        return session["status"], session["status"]
    except Exception as exc:
        session["status"] = f"Lỗi đăng nhập: {exc}"
        return session["status"], session["status"]


async def fetch_novel(session_id: str, url: str):
    session = await ensure_user_session(session_id)
    state = session["state"]
    storage_state = None
    if state.logged_in:
        storage_state = await HakoSessionManager(state).export_storage_state()

    messages: List[str] = []
    crawler = HakoCrawler(storage_state=storage_state, progress_cb=messages.append)
    try:
        novel_data = await crawler.fetch_info(url.strip())
        session["novel_data"] = novel_data
        session["volumes"] = novel_data["volumes"]
        summary_html = render_summary(novel_data)
        return (
            summary_html,
            gr.update(choices=format_volume_choices(novel_data["volumes"]), value=[]),
            "\n".join(messages + [f"Đã lấy thông tin: {novel_data['title']}"]),
        )
    except Exception as exc:
        return (
            "<div class='panel'><p>Không thể đọc thông tin truyện.</p></div>",
            gr.update(choices=[], value=[]),
            f"Lỗi: {exc}",
        )


async def download_selected(
    session_id: str,
    selected_ids: List[int],
    export_formats: List[str],
    progress=gr.Progress(),
):
    session = await ensure_user_session(session_id)
    novel_data = session.get("novel_data")
    if not novel_data:
        return [], "Hãy lấy thông tin truyện trước khi tải."

    selected_ids_int = [int(x) for x in selected_ids]
    selected_volumes = [vol for vol in session.get("volumes", []) if vol["id"] in selected_ids_int]
    total_chapters = sum(len(vol.get("chapters", [])) for vol in selected_volumes) or 1

    state = session["state"]
    storage_state = None
    if state.logged_in:
        storage_state = await HakoSessionManager(state).export_storage_state()

    logs: List[str] = []
    chapter_progress = {"completed": 0}

    def progress_cb(message: str):
        logs.append(message)

        if message.startswith("Bắt đầu tải tập:"):
            progress(min(chapter_progress["completed"] / total_chapters, 0.05), desc=message)
            return

        if message.startswith("Tải chương "):
            chapter_progress["completed"] += 1
            progress(min(chapter_progress["completed"] / total_chapters, 0.95), desc=message)
            return

        if message.startswith("Hoàn tất tập:"):
            progress(min(chapter_progress["completed"] / total_chapters, 0.98), desc=message)
            return

        if message.startswith("Đã đóng gói file ZIP:"):
            progress(1.0, desc=message)
            return

        progress(min(chapter_progress["completed"] / total_chapters, 0.98), desc=message)

    try:
        session["is_downloading"] = True
        progress(0, desc="Chuẩn bị tải truyện...")
        await download_manager.acquire()
        try:
            output_dir = reset_output_dir(session["output_dir"])
            files = await download_volumes(
                novel_data=novel_data,
                selected_ids=selected_ids_int,
                export_formats=export_formats,
                output_root=output_dir,
                storage_state=storage_state,
                progress_cb=progress_cb,
            )
        finally:
            await download_manager.release()
            
        progress(1.0, desc="Hoàn tất tải truyện.")
        return files, "\n".join(logs + ["Hoàn tất tải truyện."])
    except HakoError as exc:
        progress(1.0, desc="Tải truyện thất bại.")
        return [], f"Lỗi nghiệp vụ: {exc}"
    except Exception as exc:
        progress(1.0, desc="Tải truyện thất bại.")
        return [], f"Lỗi hệ thống: {exc}"
    finally:
        session["is_downloading"] = False


def build_ui():
    # CSS cải tiến: Phân tách rõ ràng giao diện cho Khối logo (.hero)
    css = """
    .gradio-container, .app-shell, .panel, .hero, .hero * {
        font-family: "Segoe UI", Tahoma, Geneva, Verdana, Arial, sans-serif;
    }
    .app-shell {max-width: 1180px; margin: 0 auto;}
    
    /* Cấu hình chung cho khung logo */
    .hero {
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:center;
        text-align:center;
        gap:18px;
        padding:28px 20px;
        border-radius:20px;
        margin-bottom:18px;
    }
    .hero img {width:96px; height:96px; object-fit:contain; background:white; border-radius:20px; padding:10px; margin:0 auto;}
    .hero-copy {max-width: 760px; margin: 0 auto;}

    /* MÀU SẮC THEO THEME CHO KHUNG LOGO (.hero) */
    /* 1. Khi ở giao diện SÁNG (Light Mode): Nền trắng/xám nhẹ, chữ tối, có viền mảnh */
    :root:not(.dark) .hero {
        background: var(--block-background-fill);
        color: var(--body-text-color);
        border: 1px solid var(--border-color-primary);
        box-shadow: 0 4px 20px rgba(0,0,0,.02);
    }
    
    /* 2. Khi ở giao diện TỐI (Dark Mode): Giữ nguyên màu Gradient tối cũ của bạn */
    :root.dark .hero {
        background: linear-gradient(135deg,#111827,#1f2937);
        color: white;
        border: none;
        box-shadow: none;
    }
    
    /* Cấu hình chung cho panel thông tin truyện */
    .panel {
        background-color: var(--block-background-fill); 
        color: var(--body-text-color);
        border: 1px solid var(--border-color-primary); 
        border-radius: 16px; 
        padding: 16px; 
        box-shadow: 0 8px 30px rgba(0,0,0,.05);
    }
    
    .muted {color:#6b7280;}
    footer {display:none !important;}
    """

    head = """
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="icon" type="image/x-icon" href="/public/favicon.ico?v=2">
    <link rel="shortcut icon" href="/public/favicon.ico?v=2">
    <link rel="apple-touch-icon" href="/public/favicon.ico?v=2">
    """

    with gr.Blocks(title=APP_TITLE, css=css, theme=gr.themes.Soft(), head=head) as demo:
        session_id = gr.State(lambda: str(uuid.uuid4()))

        gr.HTML(
            """
            <div class='app-shell'>
              <div class='hero'>
                <img src='/public/logo.webp' alt='Hako logo' />
                <div class='hero-copy'>
                  <h1 style='margin:0;'>Hako Downloader</h1>
                  <p style='margin:6px 0 0;'>Đăng nhập tài khoản Hako, lấy danh sách tập và tải truyện về TXT / DOCX / EPUB.</p>
                  <p class='muted' style='margin:6px 0 0;'>Thiết kế cho tải đồng thời khoảng 10 người dùng, với giới hạn job song song để ổn định tài nguyên.</p>
                </div>
              </div>
            </div>
            """
        )

        with gr.Row():
            with gr.Column(scale=1):
                gr.Markdown("## 1) Đăng nhập Hako")
                username = gr.Textbox(label="Email / Username", placeholder="Nhập tài khoản Hako")
                password = gr.Textbox(label="Mật khẩu", placeholder="Nhập mật khẩu", type="password")
                login_btn = gr.Button("Đăng nhập", variant="primary")
                login_status = gr.Textbox(label="Trạng thái đăng nhập", interactive=False)

                gr.Markdown("## 2) URL bộ truyện")
                novel_url = gr.Textbox(label="Link truyện", placeholder="https://docln.sbs/truyen/...")
                fetch_btn = gr.Button("Lấy thông tin truyện")

            with gr.Column(scale=2):
                summary = gr.HTML("<div class='panel'><p>Chưa có dữ liệu truyện.</p></div>")
                volumes = gr.CheckboxGroup(label="Chọn tập cần tải", choices=[])
                export_formats = gr.CheckboxGroup(
                    label="Định dạng xuất",
                    choices=[("TXT", "txt"), ("DOCX", "docx"), ("EPUB", "epub")],
                    value=["epub"],
                )
                download_btn = gr.Button("Tải truyện", variant="primary")
                output_files = gr.Files(label="File đã tạo")
                logs = gr.Textbox(label="Nhật ký", lines=18, interactive=False)

        login_btn.click(do_login, inputs=[session_id, username, password], outputs=[login_status, logs])
        fetch_btn.click(fetch_novel, inputs=[session_id, novel_url], outputs=[summary, volumes, logs])
        download_btn.click(download_selected, inputs=[session_id, volumes, export_formats], outputs=[output_files, logs])

    return demo

@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return FileResponse(FAVICON_PATH)


@app.get("/health")
async def health():
    return {"status": "ok", "max_concurrent_jobs": APP_CONFIG["MAX_CONCURRENT_JOBS"]}


def get_server_stats():
    total, used, free = shutil.disk_usage(DOWNLOAD_DIR)
    
    active_sessions = len(session_store)
    
    downloaded_files_count = 0
    downloaded_size = 0
    for root, dirs, files in os.walk(DOWNLOAD_DIR):
        for f in files:
            fp = os.path.join(root, f)
            if not os.path.islink(fp):
                downloaded_files_count += 1
                downloaded_size += os.path.getsize(fp)
                
    return f"""
### Tình trạng máy chủ
- **Phiên hoạt động (Active Sessions):** {active_sessions}
- **Số lượng file đã tải:** {downloaded_files_count}
- **Dung lượng file tải về:** {downloaded_size // (1024*1024)} MB
- **Ổ cứng sử dụng:** {used // (1024*1024*1024)} GB / {total // (1024*1024*1024)} GB
"""

def list_hako_accounts():
    accounts = []
    for sid, data in session_store.items():
        state = data.get("state")
        label = state.user_label if state else "Chưa đăng nhập"
        status = data.get("status", "")
        accounts.append([sid, label, status])
    return accounts


def list_account_choices():
    choices = []
    for sid, data in session_store.items():
        state = data.get("state")
        label = state.user_label if state else "Chưa đăng nhập"
        choices.append((f"{label} ({sid[:8]}...)", sid))
    return choices


async def delete_selected_accounts(selected_sids: List[str]):
    if not selected_sids:
        return list_hako_accounts(), gr.update(choices=list_account_choices(), value=[]), "Chưa chọn tài khoản nào."
    deleted = 0
    for sid in selected_sids:
        if sid in session_store:
            session = session_store[sid]
            state = session.get("state")
            if state:
                manager = HakoSessionManager(state)
                await manager.close()
            del session_store[sid]
            deleted += 1
    return list_hako_accounts(), gr.update(choices=list_account_choices(), value=[]), f"Đã xoá {deleted} tài khoản."


async def delete_all_accounts():
    count = len(session_store)
    for sid in list(session_store.keys()):
        session = session_store[sid]
        state = session.get("state")
        if state:
            manager = HakoSessionManager(state)
            await manager.close()
        del session_store[sid]
    return list_hako_accounts(), gr.update(choices=list_account_choices(), value=[]), f"Đã xoá tất cả {count} tài khoản."

def list_downloaded_novels():
    items = []
    for user_dir in DOWNLOAD_DIR.iterdir():
        if user_dir.is_dir():
            for novel_dir in user_dir.iterdir():
                if novel_dir.is_dir():
                    for file_path in novel_dir.rglob('*'):
                        if file_path.is_file():
                            rel_path = file_path.relative_to(DOWNLOAD_DIR).as_posix()
                            size_kb = file_path.stat().st_size // 1024
                            link = f'<a href="/downloads/{rel_path}" target="_blank" download>Tải file</a>'
                            items.append([f"{novel_dir.name}/{file_path.name}", f"{size_kb} KB", link])
                elif novel_dir.is_file():
                    rel_path = novel_dir.relative_to(DOWNLOAD_DIR).as_posix()
                    size_kb = novel_dir.stat().st_size // 1024
                    link = f'<a href="/downloads/{rel_path}" target="_blank" download>Tải file</a>'
                    items.append([novel_dir.name, f"{size_kb} KB", link])
    return items


def list_file_choices():
    choices = []
    for user_dir in DOWNLOAD_DIR.iterdir():
        if user_dir.is_dir():
            for novel_dir in user_dir.iterdir():
                if novel_dir.is_dir():
                    for file_path in novel_dir.rglob('*'):
                        if file_path.is_file():
                            rel_path = file_path.relative_to(DOWNLOAD_DIR).as_posix()
                            size_kb = file_path.stat().st_size // 1024
                            choices.append((f"{novel_dir.name}/{file_path.name} ({size_kb} KB)", rel_path))
                elif novel_dir.is_file():
                    rel_path = novel_dir.relative_to(DOWNLOAD_DIR).as_posix()
                    size_kb = novel_dir.stat().st_size // 1024
                    choices.append((f"{novel_dir.name} ({size_kb} KB)", rel_path))
    return choices


def delete_selected_files(selected_paths: List[str]):
    if not selected_paths:
        return list_downloaded_novels(), gr.update(choices=list_file_choices(), value=[]), get_server_stats(), "Chưa chọn file nào."
    deleted = 0
    for rel_path in selected_paths:
        full_path = DOWNLOAD_DIR / rel_path
        if full_path.is_file():
            full_path.unlink()
            deleted += 1
            parent = full_path.parent
            if parent != DOWNLOAD_DIR and not any(parent.iterdir()):
                parent.rmdir()
    return list_downloaded_novels(), gr.update(choices=list_file_choices(), value=[]), get_server_stats(), f"Đã xoá {deleted} file."

def delete_all_novels():
    try:
        for item in DOWNLOAD_DIR.iterdir():
            if item.is_dir():
                shutil.rmtree(item)
            else:
                item.unlink()
        DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
        return list_downloaded_novels(), gr.update(choices=list_file_choices(), value=[]), get_server_stats(), "Đã xoá toàn bộ truyện."
    except Exception as e:
        return list_downloaded_novels(), gr.update(choices=list_file_choices(), value=[]), get_server_stats(), f"Lỗi: {e}"

def build_admin_ui():
    with gr.Blocks(title="Admin Dashboard", theme=gr.themes.Soft()) as admin_demo:
        gr.Markdown("# Bảng điều khiển quản trị (Admin Dashboard)")

        with gr.Row():
            with gr.Column(scale=2):
                stats_md = gr.Markdown(get_server_stats())
                refresh_btn = gr.Button("Làm mới trạng thái")
            
            with gr.Column(scale=1):
                gr.Markdown("### Cấu hình máy chủ")
                max_sessions_input = gr.Number(label="Max Sessions (Số người dùng)", value=lambda: APP_CONFIG["MAX_SESSIONS"], precision=0)
                max_jobs_input = gr.Number(label="Max Concurrent Jobs (Luồng tải)", value=lambda: APP_CONFIG["MAX_CONCURRENT_JOBS"], precision=0)
                save_config_btn = gr.Button("Lưu cấu hình", variant="primary")
                config_msg = gr.Textbox(label="Thông báo", interactive=False)

        def save_config(max_sessions, max_jobs):
            APP_CONFIG["MAX_SESSIONS"] = int(max_sessions)
            APP_CONFIG["MAX_CONCURRENT_JOBS"] = int(max_jobs)
            return "Đã lưu cấu hình."

        save_config_btn.click(save_config, inputs=[max_sessions_input, max_jobs_input], outputs=[config_msg])

        with gr.Row():
            with gr.Column():
                gr.Markdown("## Quản lý tài khoản Hako đã đăng nhập")
                accounts_df = gr.Dataframe(
                    headers=["Session ID", "User Label", "Trạng thái"],
                    value=list_hako_accounts(),
                    interactive=False
                )
                account_select = gr.CheckboxGroup(
                    label="Chọn tài khoản để xoá",
                    choices=list_account_choices(),
                )
                with gr.Row():
                    delete_selected_acc_btn = gr.Button("Xoá tài khoản đã chọn", variant="stop")
                    delete_all_acc_btn = gr.Button("Xoá tất cả tài khoản", variant="stop")
                acc_msg = gr.Textbox(label="Thông báo", interactive=False)

            with gr.Column():
                gr.Markdown("## Quản lý truyện đã tải")
                novels_df = gr.Dataframe(
                    headers=["Tên file", "Dung lượng", "Liên kết tải"],
                    datatype=["str", "str", "html"],
                    value=list_downloaded_novels(),
                    interactive=False
                )
                file_select = gr.CheckboxGroup(
                    label="Chọn file để xoá",
                    choices=list_file_choices(),
                )
                with gr.Row():
                    delete_selected_files_btn = gr.Button("Xoá file đã chọn", variant="stop")
                    delete_all_btn = gr.Button("Xoá TẤT CẢ truyện", variant="stop")
                novel_msg = gr.Textbox(label="Thông báo", interactive=False)

        def refresh_all():
            return (
                get_server_stats(),
                list_hako_accounts(),
                gr.update(choices=list_account_choices(), value=[]),
                list_downloaded_novels(),
                gr.update(choices=list_file_choices(), value=[]),
            )

        refresh_btn.click(
            refresh_all,
            outputs=[stats_md, accounts_df, account_select, novels_df, file_select]
        )

        delete_selected_acc_btn.click(
            delete_selected_accounts, inputs=[account_select],
            outputs=[accounts_df, account_select, acc_msg]
        )
        delete_selected_acc_btn.click(get_server_stats, outputs=[stats_md])

        delete_all_acc_btn.click(
            delete_all_accounts,
            outputs=[accounts_df, account_select, acc_msg]
        )
        delete_all_acc_btn.click(get_server_stats, outputs=[stats_md])

        delete_selected_files_btn.click(
            delete_selected_files, inputs=[file_select],
            outputs=[novels_df, file_select, stats_md, novel_msg]
        )

        delete_all_btn.click(
            delete_all_novels,
            outputs=[novels_df, file_select, stats_md, novel_msg]
        )

        admin_demo.load(
            refresh_all,
            outputs=[stats_md, accounts_df, account_select, novels_df, file_select]
        )

    return admin_demo

demo = build_ui()
admin_demo = build_admin_ui()

# Use Gradio's standard multi-app mounting logic correctly
# Mount /admin first, then / to avoid routing conflicts
# FastAPI reads routes in order.
# We mount the Gradio apps correctly ensuring /admin/ gets routed.
app = gr.mount_gradio_app(
    app, 
    admin_demo, 
    path="/admin", 
    auth=(ADMIN_USERNAME, ADMIN_PASSWORD)
)
app = gr.mount_gradio_app(app, demo, path="/")

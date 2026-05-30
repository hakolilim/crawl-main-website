import asyncio
import uuid
from pathlib import Path
from typing import Dict, List

import gradio as gr
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

APP_TITLE = "Hako Downloader"
BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR / "public"
DOWNLOAD_DIR = BASE_DIR / "downloads"
FAVICON_PATH = PUBLIC_DIR / "favicon.ico"
MAX_CONCURRENT_JOBS = 10

DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title=APP_TITLE)
app.mount("/public", StaticFiles(directory=str(PUBLIC_DIR)), name="public")
app.mount("/downloads", StaticFiles(directory=str(DOWNLOAD_DIR)), name="downloads")

session_store: Dict[str, Dict] = {}
download_semaphore = asyncio.Semaphore(MAX_CONCURRENT_JOBS)


def ensure_user_session(session_id: str) -> Dict:
    if session_id not in session_store:
        user_dir = DOWNLOAD_DIR / session_id
        user_dir.mkdir(parents=True, exist_ok=True)
        session_store[session_id] = {
            "state": SessionState(),
            "novel_data": None,
            "volumes": [],
            "status": "Chưa đăng nhập.",
            "output_dir": str(user_dir),
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
    session = ensure_user_session(session_id)
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
    session = ensure_user_session(session_id)
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
    session = ensure_user_session(session_id)
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
        progress(0, desc="Chuẩn bị tải truyện...")
        async with download_semaphore:
            output_dir = reset_output_dir(session["output_dir"])
            files = await download_volumes(
                novel_data=novel_data,
                selected_ids=selected_ids_int,
                export_formats=export_formats,
                output_root=output_dir,
                storage_state=storage_state,
                progress_cb=progress_cb,
            )
        progress(1.0, desc="Hoàn tất tải truyện.")
        return files, "\n".join(logs + ["Hoàn tất tải truyện."])
    except HakoError as exc:
        progress(1.0, desc="Tải truyện thất bại.")
        return [], f"Lỗi nghiệp vụ: {exc}"
    except Exception as exc:
        progress(1.0, desc="Tải truyện thất bại.")
        return [], f"Lỗi hệ thống: {exc}"


def build_ui():
    # CSS mới: Loại bỏ background màu trắng chết cố định.
    # Sử dụng các biến CSS mặc định của Gradio (--block-background-fill, --body-text-color) 
    # để panel tự động đổi màu mượt mà theo đúng Dark/Light mode hệ thống.
    css = """
    .gradio-container, .app-shell, .panel, .hero, .hero * {
        font-family: "Segoe UI", Tahoma, Geneva, Verdana, Arial, sans-serif;
    }
    .app-shell {max-width: 1180px; margin: 0 auto;}
    .hero {
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:center;
        text-align:center;
        gap:18px;
        background:linear-gradient(135deg,#111827,#1f2937);
        color:white;
        padding:28px 20px;
        border-radius:20px;
        margin-bottom:18px;
    }
    .hero img {width:96px; height:96px; object-fit:contain; background:white; border-radius:20px; padding:10px; margin:0 auto;}
    .hero-copy {max-width: 760px; margin: 0 auto;}
    
    /* Sửa lỗi hiển thị panel thông tin truyện */
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

    # ĐÃ XOÁ hoàn toàn đoạn biến force_theme_js ở đây

    with gr.Blocks(title=APP_TITLE, css=css, theme=gr.themes.Soft(), head=head) as demo:
        session_id = gr.State(str(uuid.uuid4()))

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

        # ĐÃ XOÁ dòng demo.load gọi JavaScript ép giao diện tại đây

        login_btn.click(do_login, inputs=[session_id, username, password], outputs=[login_status, logs])
        fetch_btn.click(fetch_novel, inputs=[session_id, novel_url], outputs=[summary, volumes, logs])
        download_btn.click(download_selected, inputs=[session_id, volumes, export_formats], outputs=[output_files, logs])

    return demo

@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return FileResponse(FAVICON_PATH)


@app.get("/health")
async def health():
    return {"status": "ok", "max_concurrent_jobs": MAX_CONCURRENT_JOBS}


demo = build_ui()
app = gr.mount_gradio_app(app, demo, path="/")
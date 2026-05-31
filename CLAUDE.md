# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Hako Downloader — a Python/FastAPI web app that crawls the Hako/Docln (docln.sbs) light novel platform. Users log in via Playwright-controlled browser sessions, browse novels, select volumes, and download chapters as TXT/DOCX/EPUB (packaged in ZIP). Supports ~10 concurrent users via asyncio semaphore.

## Commands

```bash
# Install dependencies
pip install -r requirements.txt
playwright install chromium

# Run the server
python -m uvicorn app:app --host 127.0.0.1 --port 8000

# Legacy standalone CLI crawler (not used by web app)
python crawlhako.py
```

No test framework, linter, or CI is configured.

## Architecture

**`app.py`** — Entry point. Creates FastAPI app, mounts two Gradio interfaces:
- `/` — Main user UI (login, fetch novel, select volumes, download)
- `/admin` — Admin dashboard (HTTP Basic Auth, server stats, session/file management)
- `/health` — Health check endpoint
- `/downloads/*` and `/public/*` — Static file serving

**`hako_service.py`** — Core service layer:
- `SessionState` — per-user Playwright browser/context/page state
- `HakoSessionManager` — browser lifecycle and Hako login
- `HakoCrawler` — fetches novel metadata, downloads chapter HTML + images
- `export_volume_txt/docx/epub` — export functions producing files
- `download_volumes()` — orchestrates full download pipeline, produces ZIP

**`crawlhako.py`** — Legacy interactive CLI (headful browser, reads .env credentials). Independent from the web app.

## Session Model

Each browser tab gets a UUID `session_id` in Gradio state. Server-side `session_store` dict maps IDs to Playwright browser instances, novel data, and output directories under `downloads/<session_id>/`. Sessions are in-memory only — lost on restart.

## Environment Variables

Defined in `.env` (see `.env.example`):
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` — credentials for `/admin` dashboard

## Key Constants

- `MAX_CONCURRENT_JOBS = 10` (asyncio semaphore in `app.py`)
- `BASE_URL = "https://docln.sbs"` (hardcoded in `hako_service.py`)
- `DOWNLOAD_DIR = ./downloads/`, `PUBLIC_DIR = ./public/`

## Platform Notes

- Windows: `crawlhako.py` sets `asyncio.WindowsSelectorEventLoopPolicy`
- EPUB export is built manually with `zipfile` (no ebooklib)
- Playwright stealth plugin used to avoid bot detection

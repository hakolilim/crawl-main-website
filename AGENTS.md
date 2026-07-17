<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Hako Downloader agent notes

- Architecture: **client orchestrator** + **Vercel API gateway** (Browserless secrets server-side only).
- Python/Gradio source kept under `legacy/`.
- Never expose `BROWSERLESS_TOKEN` or `SUPABASE_SERVICE_ROLE_KEY` to the client.
- Crawl routes must use `export const runtime = "nodejs"`.

"use client";

import { useMemo, useState } from "react";
import {
  runDownloadJob,
  type GeneratedFile,
} from "@/lib/hako/client/orchestrator";
import type { ExportFormat, NovelData, Profile } from "@/lib/types";
import { AppNav } from "@/components/AppNav";

export function DownloaderApp({
  profile,
  userId,
}: {
  profile: Profile | null;
  userId: string;
}) {
  const [hakoUser, setHakoUser] = useState("");
  const [hakoPass, setHakoPass] = useState("");
  const [loginStatus, setLoginStatus] = useState(
    profile?.hako_logged_in
      ? `Đã đăng nhập: ${profile.hako_user_label}`
      : "Chưa đăng nhập.",
  );
  const [novelUrl, setNovelUrl] = useState("");
  const [novel, setNovel] = useState<NovelData | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [formats, setFormats] = useState<ExportFormat[]>(["epub"]);
  const [logs, setLogs] = useState("");
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [files, setFiles] = useState<GeneratedFile[]>([]);
  const [busy, setBusy] = useState(false);

  const volumeChoices = useMemo(() => novel?.volumes || [], [novel]);

  function appendLog(line: string) {
    setLogs((prev) => (prev ? `${prev}\n${line}` : line));
  }

  async function handleHakoLogin() {
    setBusy(true);
    try {
      const res = await fetch("/api/hako/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: hakoUser, password: hakoPass }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Đăng nhập thất bại");
      setLoginStatus(data.message);
      appendLog(data.message);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLoginStatus(`Đăng nhập thất bại: ${msg}`);
      appendLog(`Lỗi đăng nhập: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleFetchNovel() {
    setBusy(true);
    try {
      const res = await fetch("/api/hako/fetch-novel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: novelUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lấy thông tin thất bại");
      setNovel(data.novel);
      setSelectedIds([]);
      appendLog(data.message || `Đã lấy thông tin: ${data.novel.title}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setNovel(null);
      appendLog(`Lỗi: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  function toggleVolume(id: number) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleFormat(fmt: ExportFormat) {
    setFormats((prev) =>
      prev.includes(fmt) ? prev.filter((x) => x !== fmt) : [...prev, fmt],
    );
  }

  async function handleDownload() {
    if (!novel) {
      appendLog("Hãy lấy thông tin truyện trước khi tải.");
      return;
    }
    if (!selectedIds.length) {
      appendLog("Hãy chọn ít nhất một tập.");
      return;
    }
    if (!formats.length) {
      appendLog("Hãy chọn ít nhất một định dạng xuất.");
      return;
    }

    setBusy(true);
    setProgress(0);
    setProgressMsg("Chuẩn bị tải truyện...");
    try {
      const result = await runDownloadJob({
        novel,
        selectedVolumeIds: selectedIds,
        exportFormats: formats,
        userId,
        callbacks: {
          onLog: appendLog,
          onProgress: (p, msg) => {
            setProgress(p);
            setProgressMsg(msg);
          },
        },
      });
      setFiles((prev) => {
        prev.forEach((f) => URL.revokeObjectURL(f.objectUrl));
        return result;
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      appendLog(`Lỗi hệ thống: ${msg}`);
      setProgressMsg("Tải truyện thất bại.");
      setProgress(1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <AppNav profile={profile} />

      <div className="hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.webp" alt="Hako logo" />
        <div>
          <h1 style={{ margin: 0 }}>Hako Downloader</h1>
          <p style={{ margin: "6px 0 0" }}>
            Đăng nhập tài khoản Hako, lấy danh sách tập và tải truyện về TXT /
            DOCX / EPUB.
          </p>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            Client điều phối tải từng chương; Vercel API giữ secrets
            (Browserless + Supabase service role).
          </p>
        </div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>1) Đăng nhập Hako</h2>
          <div className="field">
            <label className="label">Email / Username</label>
            <input
              className="input"
              value={hakoUser}
              onChange={(e) => setHakoUser(e.target.value)}
              placeholder="Nhập tài khoản Hako"
              disabled={busy}
            />
          </div>
          <div className="field">
            <label className="label">Mật khẩu</label>
            <input
              className="input"
              type="password"
              value={hakoPass}
              onChange={(e) => setHakoPass(e.target.value)}
              placeholder="Nhập mật khẩu"
              disabled={busy}
            />
          </div>
          <button
            className="btn btn-primary"
            onClick={handleHakoLogin}
            disabled={busy}
            type="button"
          >
            Đăng nhập
          </button>
          <div className="field" style={{ marginTop: 12 }}>
            <label className="label">Trạng thái đăng nhập</label>
            <input className="input" value={loginStatus} readOnly />
          </div>

          <h2>2) URL bộ truyện</h2>
          <div className="field">
            <label className="label">Link truyện</label>
            <input
              className="input"
              value={novelUrl}
              onChange={(e) => setNovelUrl(e.target.value)}
              placeholder="https://docln.sbs/truyen/..."
              disabled={busy}
            />
          </div>
          <button
            className="btn btn-secondary"
            onClick={handleFetchNovel}
            disabled={busy}
            type="button"
          >
            Lấy thông tin truyện
          </button>
        </div>

        <div className="panel">
          <div
            className="panel"
            style={{ boxShadow: "none", marginBottom: 12 }}
            dangerouslySetInnerHTML={{
              __html: novel
                ? `<h3 style="margin-top:0">${novel.title}</h3>
                   <p><strong>Tác giả:</strong> ${novel.author}</p>
                   <p><strong>Thể loại:</strong> ${novel.genres}</p>
                   <details open><summary><strong>Tóm tắt</strong></summary>
                   <div style="margin-top:8px">${novel.summary}</div></details>
                   <p><strong>Số tập:</strong> ${novel.volumes?.length || 0}</p>`
                : "<p>Chưa có dữ liệu truyện.</p>",
            }}
          />

          <div className="field">
            <label className="label">Chọn tập cần tải</label>
            <div
              style={{
                maxHeight: 220,
                overflow: "auto",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: 8,
              }}
            >
              {volumeChoices.length === 0 && (
                <p className="muted">Chưa có tập.</p>
              )}
              {volumeChoices.map((vol) => (
                <label key={vol.id} className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(vol.id)}
                    onChange={() => toggleVolume(vol.id)}
                    disabled={busy}
                  />
                  <span>
                    [{vol.id}] {vol.title} ({vol.chapter_count} chương)
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="field">
            <label className="label">Định dạng xuất</label>
            {(["txt", "docx", "epub"] as ExportFormat[]).map((fmt) => (
              <label key={fmt} className="checkbox-row">
                <input
                  type="checkbox"
                  checked={formats.includes(fmt)}
                  onChange={() => toggleFormat(fmt)}
                  disabled={busy}
                />
                <span>{fmt.toUpperCase()}</span>
              </label>
            ))}
          </div>

          <button
            className="btn btn-primary"
            onClick={handleDownload}
            disabled={busy}
            type="button"
          >
            {busy ? "Đang xử lý..." : "Tải truyện"}
          </button>

          {(progress > 0 || progressMsg) && (
            <div style={{ marginTop: 12 }}>
              <div className="muted" style={{ marginBottom: 6 }}>
                {progressMsg} ({Math.round(progress * 100)}%)
              </div>
              <div className="progress">
                <span style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            </div>
          )}

          <div className="field" style={{ marginTop: 16 }}>
            <label className="label">File đã tạo</label>
            {files.length === 0 ? (
              <p className="muted">Chưa có file.</p>
            ) : (
              <ul>
                {files.map((f) => (
                  <li key={f.filename}>
                    <a href={f.objectUrl} download={f.filename}>
                      {f.filename}
                    </a>{" "}
                    <span className="muted">
                      ({Math.round(f.blob.size / 1024)} KB)
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="field">
            <label className="label">Nhật ký</label>
            <textarea
              className="textarea"
              rows={16}
              value={logs}
              readOnly
              style={{ fontFamily: "ui-monospace, monospace" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

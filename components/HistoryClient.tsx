"use client";

import { useState } from "react";
import { AppNav } from "@/components/AppNav";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

type NovelRow = {
  id: string;
  title: string;
  author: string | null;
  source_url: string;
  created_at: string;
  updated_at: string;
};

type JobRow = {
  id: string;
  novel_id: string | null;
  status: string;
  progress: number;
  current_message: string | null;
  export_formats: string[] | null;
  created_at: string;
  finished_at: string | null;
  error: string | null;
};

type FileRow = {
  id: string;
  filename: string;
  format: string | null;
  storage_path: string;
  size_bytes: number;
  created_at: string;
  job_id: string | null;
};

export function HistoryClient({
  profile,
  novels,
  jobs,
  files,
}: {
  profile: Profile | null;
  novels: NovelRow[];
  jobs: JobRow[];
  files: FileRow[];
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function downloadFile(file: FileRow) {
    setBusyId(file.id);
    setMessage("");
    try {
      const supabase = createClient();
      const { data, error } = await supabase.storage
        .from("downloads")
        .createSignedUrl(file.storage_path, 3600);
      if (error || !data?.signedUrl) {
        throw new Error(error?.message || "Không tạo được signed URL");
      }
      window.open(data.signedUrl, "_blank");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function deleteFile(file: FileRow) {
    if (!confirm(`Xoá file ${file.filename}?`)) return;
    setBusyId(file.id);
    try {
      const supabase = createClient();
      await supabase.storage.from("downloads").remove([file.storage_path]);
      await supabase.from("download_files").delete().eq("id", file.id);
      setMessage(`Đã xoá ${file.filename}. Tải lại trang để cập nhật.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="app-shell">
      <AppNav profile={profile} />
      <h1>Lịch sử</h1>
      {message && <p className="muted">{message}</p>}

      <div className="panel" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Truyện đã lấy</h2>
        {novels.length === 0 ? (
          <p className="muted">Chưa có.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th align="left">Tên</th>
                <th align="left">Tác giả</th>
                <th align="left">URL</th>
              </tr>
            </thead>
            <tbody>
              {novels.map((n) => (
                <tr key={n.id}>
                  <td>{n.title}</td>
                  <td>{n.author}</td>
                  <td>
                    <a href={n.source_url} target="_blank" rel="noreferrer">
                      link
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Jobs tải</h2>
        {jobs.length === 0 ? (
          <p className="muted">Chưa có.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th align="left">Trạng thái</th>
                <th align="left">Tiến độ</th>
                <th align="left">Thông báo</th>
                <th align="left">Thời gian</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td>{j.status}</td>
                  <td>{Math.round(Number(j.progress || 0) * 100)}%</td>
                  <td>{j.error || j.current_message}</td>
                  <td>{new Date(j.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>File đã tải</h2>
        {files.length === 0 ? (
          <p className="muted">Chưa có.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th align="left">Tên file</th>
                <th align="left">Định dạng</th>
                <th align="left">Dung lượng</th>
                <th align="left">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.id}>
                  <td>{f.filename}</td>
                  <td>{f.format}</td>
                  <td>{Math.round((f.size_bytes || 0) / 1024)} KB</td>
                  <td style={{ display: "flex", gap: 8 }}>
                    <button
                      className="btn btn-secondary"
                      type="button"
                      disabled={busyId === f.id}
                      onClick={() => downloadFile(f)}
                    >
                      Tải
                    </button>
                    <button
                      className="btn btn-danger"
                      type="button"
                      disabled={busyId === f.id}
                      onClick={() => deleteFile(f)}
                    >
                      Xoá
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

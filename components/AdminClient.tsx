"use client";

import { useState } from "react";
import { AppNav } from "@/components/AppNav";
import type { Profile } from "@/lib/types";

type Stats = {
  users: number;
  novels: number;
  jobs: number;
  runningJobs: number;
  files: number;
  totalSizeBytes: number;
};

type UserRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  role: string;
  hako_user_label: string | null;
  hako_logged_in: boolean | null;
  created_at: string;
};

type FileRow = {
  id: string;
  size_bytes: number | null;
  filename: string;
  storage_path: string;
  user_id: string;
};

export function AdminClient({
  profile,
  stats,
  users,
  files,
  config,
}: {
  profile: Profile | null;
  stats: Stats;
  users: UserRow[];
  files: FileRow[];
  config: Record<string, unknown>;
}) {
  const [maxJobs, setMaxJobs] = useState(
    Number(config.max_concurrent_jobs ?? 10),
  );
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function saveConfig() {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          max_concurrent_jobs: maxJobs,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lưu thất bại");
      setMessage("Đã lưu cấu hình.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function clearHakoSession(userId: string) {
    if (!confirm("Xoá session Hako của user này?")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/clear-hako-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Thất bại");
      setMessage(data.message || "Đã xoá session.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function deleteFile(fileId: string, storagePath: string) {
    if (!confirm("Xoá file này?")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/delete-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId, storagePath }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Thất bại");
      setMessage("Đã xoá file. Tải lại trang để cập nhật.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <AppNav profile={profile} />
      <h1>Admin Dashboard</h1>
      {message && <p className="muted">{message}</p>}

      <div className="panel" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Tình trạng</h2>
        <ul>
          <li>Users: {stats.users}</li>
          <li>Novels: {stats.novels}</li>
          <li>Jobs: {stats.jobs}</li>
          <li>Running jobs: {stats.runningJobs}</li>
          <li>Files: {stats.files}</li>
          <li>
            Dung lượng file: {Math.round(stats.totalSizeBytes / (1024 * 1024))}{" "}
            MB
          </li>
        </ul>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Cấu hình</h2>
        <div className="field">
          <label className="label">Max concurrent jobs (tham chiếu)</label>
          <input
            className="input"
            type="number"
            value={maxJobs}
            onChange={(e) => setMaxJobs(Number(e.target.value))}
          />
        </div>
        <button
          className="btn btn-primary"
          type="button"
          disabled={busy}
          onClick={saveConfig}
        >
          Lưu cấu hình
        </button>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Users / Hako sessions</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th align="left">Email</th>
              <th align="left">Role</th>
              <th align="left">Hako</th>
              <th align="left">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.email}</td>
                <td>{u.role}</td>
                <td>
                  {u.hako_logged_in ? u.hako_user_label : "Chưa đăng nhập"}
                </td>
                <td>
                  <button
                    className="btn btn-danger"
                    type="button"
                    disabled={busy || !u.hako_logged_in}
                    onClick={() => clearHakoSession(u.id)}
                  >
                    Xoá Hako session
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Files</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th align="left">File</th>
              <th align="left">Size</th>
              <th align="left">User</th>
              <th align="left">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {files.map((f) => (
              <tr key={f.id}>
                <td>{f.filename}</td>
                <td>{Math.round((f.size_bytes || 0) / 1024)} KB</td>
                <td style={{ fontSize: 12 }}>{f.user_id.slice(0, 8)}…</td>
                <td>
                  <button
                    className="btn btn-danger"
                    type="button"
                    disabled={busy}
                    onClick={() => deleteFile(f.id, f.storage_path)}
                  >
                    Xoá
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const supabase = createClient();
    const { data, error: err } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName || email.split("@")[0] },
      },
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    if (data.session) {
      router.push("/");
      router.refresh();
      return;
    }
    setMessage("Đăng ký thành công. Kiểm tra email để xác nhận (nếu bật).");
  }

  return (
    <div className="app-shell" style={{ maxWidth: 480 }}>
      <div className="panel">
        <h1 style={{ marginTop: 0 }}>Đăng ký</h1>
        <form onSubmit={onSubmit}>
          <div className="field">
            <label className="label">Tên hiển thị</label>
            <input
              className="input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="label">Email</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label className="label">Mật khẩu</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
          </div>
          {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
          {message && <p style={{ color: "var(--primary)" }}>{message}</p>}
          <button className="btn btn-primary" disabled={busy} type="submit">
            {busy ? "Đang đăng ký..." : "Đăng ký"}
          </button>
        </form>
        <p style={{ marginTop: 16 }}>
          Đã có tài khoản? <Link href="/login">Đăng nhập</Link>
        </p>
      </div>
    </div>
  );
}

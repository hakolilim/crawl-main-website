"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

export function AppNav({ profile }: { profile: Profile | null }) {
  const router = useRouter();

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="nav">
      <Link href="/">Tải truyện</Link>
      <Link href="/history">Lịch sử</Link>
      {profile?.role === "admin" && <Link href="/admin">Admin</Link>}
      <span className="muted" style={{ marginLeft: "auto" }}>
        {profile?.email || "—"}
        {profile?.hako_logged_in
          ? ` · Hako: ${profile.hako_user_label}`
          : " · Chưa đăng nhập Hako"}
      </span>
      <button className="btn btn-secondary" onClick={logout} type="button">
        Đăng xuất
      </button>
    </div>
  );
}

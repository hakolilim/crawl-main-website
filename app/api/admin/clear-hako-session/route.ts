import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const schema = z.object({
  userId: z.string().uuid(),
});

export async function POST(request: Request) {
  const { isAdmin } = await requireAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = schema.parse(await request.json());
    const admin = createAdminClient();
    await admin
      .from("profiles")
      .update({
        hako_storage_state: null,
        hako_logged_in: false,
        hako_user_label: "Chưa đăng nhập",
        updated_at: new Date().toISOString(),
      })
      .eq("id", body.userId);
    return NextResponse.json({ ok: true, message: "Đã xoá Hako session." });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid payload" },
      { status: 400 },
    );
  }
}

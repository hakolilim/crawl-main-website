import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthenticationError, HakoError } from "@/lib/hako/browserless";
import { loginHako } from "@/lib/hako/session";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const { user } = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Vui lòng nhập tài khoản và mật khẩu Hako." },
      { status: 400 },
    );
  }

  try {
    const { userLabel, storageState } = await loginHako(
      body.username,
      body.password,
    );

    const admin = createAdminClient();
    await admin
      .from("profiles")
      .update({
        hako_user_label: userLabel,
        hako_logged_in: true,
        hako_storage_state: storageState,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    return NextResponse.json({
      ok: true,
      userLabel,
      message: `Đã đăng nhập: ${userLabel}`,
    });
  } catch (err) {
    const message =
      err instanceof AuthenticationError || err instanceof HakoError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Lỗi đăng nhập";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

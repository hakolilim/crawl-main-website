import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { HakoError } from "@/lib/hako/browserless";
import { fetchChapterContent } from "@/lib/hako/crawler";
import type { PlaywrightStorageState } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  url: z.string().url(),
  title: z.string().default(""),
  chapterIndex: z.number().int().positive().default(1),
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
    return NextResponse.json({ error: "Payload chương không hợp lệ." }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("hako_storage_state")
      .eq("id", user.id)
      .maybeSingle();

    const storageState = (profile?.hako_storage_state ||
      null) as PlaywrightStorageState | null;

    const chapter = await fetchChapterContent(
      body.url,
      body.title,
      body.chapterIndex,
      storageState,
    );

    return NextResponse.json({ ok: true, chapter });
  } catch (err) {
    const message =
      err instanceof HakoError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Lỗi tải chương";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

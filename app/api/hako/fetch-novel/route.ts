import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { HakoError } from "@/lib/hako/browserless";
import { fetchNovelInfo } from "@/lib/hako/crawler";
import type { PlaywrightStorageState } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  url: z.string().url(),
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
    return NextResponse.json({ error: "URL truyện không hợp lệ." }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("hako_storage_state, hako_logged_in")
      .eq("id", user.id)
      .maybeSingle();

    const storageState = (profile?.hako_storage_state ||
      null) as PlaywrightStorageState | null;

    const novel = await fetchNovelInfo(body.url, storageState);

    const { data: saved, error } = await admin
      .from("novels")
      .upsert(
        {
          user_id: user.id,
          source_url: novel.source_url,
          title: novel.title,
          author: novel.author,
          genres: novel.genres,
          summary_html: novel.summary,
          volumes: novel.volumes,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,source_url" },
      )
      .select("id, title, author, genres, summary_html, volumes, source_url")
      .single();

    if (error) {
      return NextResponse.json(
        { error: `Lưu novel thất bại: ${error.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      novel: {
        id: saved.id,
        title: saved.title,
        author: saved.author,
        genres: saved.genres,
        summary: saved.summary_html,
        volumes: saved.volumes,
        source_url: saved.source_url,
      },
      message: `Đã lấy thông tin: ${novel.title}`,
    });
  } catch (err) {
    const message =
      err instanceof HakoError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Không thể đọc thông tin truyện.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

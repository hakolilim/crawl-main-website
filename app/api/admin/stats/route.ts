import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET() {
  const { isAdmin } = await requireAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const [profiles, novels, jobs, files, running] = await Promise.all([
    admin.from("profiles").select("id", { count: "exact", head: true }),
    admin.from("novels").select("id", { count: "exact", head: true }),
    admin.from("download_jobs").select("id", { count: "exact", head: true }),
    admin.from("download_files").select("id, size_bytes"),
    admin
      .from("download_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "running"),
  ]);

  const totalSize =
    files.data?.reduce((sum, f) => sum + (f.size_bytes || 0), 0) || 0;

  return NextResponse.json({
    users: profiles.count || 0,
    novels: novels.count || 0,
    jobs: jobs.count || 0,
    runningJobs: running.count || 0,
    files: files.data?.length || 0,
    totalSizeBytes: totalSize,
  });
}

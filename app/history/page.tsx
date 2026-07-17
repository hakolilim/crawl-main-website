import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { HistoryClient } from "@/components/HistoryClient";

export default async function HistoryPage() {
  const { user, profile, supabase } = await requireUser();
  if (!user) redirect("/login");

  const [{ data: novels }, { data: jobs }, { data: files }] = await Promise.all([
    supabase
      .from("novels")
      .select("id, title, author, source_url, created_at, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(50),
    supabase
      .from("download_jobs")
      .select(
        "id, novel_id, status, progress, current_message, export_formats, created_at, finished_at, error",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("download_files")
      .select("id, filename, format, storage_path, size_bytes, created_at, job_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  return (
    <HistoryClient
      profile={profile}
      novels={novels || []}
      jobs={jobs || []}
      files={files || []}
    />
  );
}

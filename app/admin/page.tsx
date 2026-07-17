import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminClient } from "@/components/AdminClient";

export default async function AdminPage() {
  const { user, profile, isAdmin } = await requireAdmin();
  if (!user) redirect("/login");
  if (!isAdmin) redirect("/");

  const admin = createAdminClient();
  const [profiles, novels, jobs, files, configs] = await Promise.all([
    admin
      .from("profiles")
      .select(
        "id, email, display_name, role, hako_user_label, hako_logged_in, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(100),
    admin.from("novels").select("id", { count: "exact", head: true }),
    admin
      .from("download_jobs")
      .select("id, status", { count: "exact" })
      .limit(200),
    admin.from("download_files").select("id, size_bytes, filename, storage_path, user_id"),
    admin.from("app_config").select("key, value"),
  ]);

  const running =
    jobs.data?.filter((j) => j.status === "running").length || 0;
  const totalSize =
    files.data?.reduce((s, f) => s + (f.size_bytes || 0), 0) || 0;

  const configMap: Record<string, unknown> = {};
  for (const row of configs.data || []) {
    configMap[row.key] = row.value;
  }

  return (
    <AdminClient
      profile={profile}
      stats={{
        users: profiles.data?.length || 0,
        novels: novels.count || 0,
        jobs: jobs.count || 0,
        runningJobs: running,
        files: files.data?.length || 0,
        totalSizeBytes: totalSize,
      }}
      users={profiles.data || []}
      files={files.data || []}
      config={configMap}
    />
  );
}

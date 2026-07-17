import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/types";

export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return { user: null, supabase, profile: null as Profile | null };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, email, display_name, role, hako_user_label, hako_logged_in, created_at, updated_at",
    )
    .eq("id", user.id)
    .maybeSingle();

  // Bootstrap profile if trigger missed (e.g. existing users)
  if (!profile) {
    const admin = createAdminClient();
    const adminEmails = (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const role = adminEmails.includes((user.email || "").toLowerCase())
      ? "admin"
      : "user";
    await admin.from("profiles").upsert({
      id: user.id,
      email: user.email,
      display_name: user.email?.split("@")[0] || "user",
      role,
    });
    const { data: created } = await supabase
      .from("profiles")
      .select(
        "id, email, display_name, role, hako_user_label, hako_logged_in, created_at, updated_at",
      )
      .eq("id", user.id)
      .maybeSingle();
    return { user, supabase, profile: created as Profile | null };
  }

  return { user, supabase, profile: profile as Profile };
}

export async function requireAdmin() {
  const result = await requireUser();
  if (!result.user || result.profile?.role !== "admin") {
    return { ...result, isAdmin: false as const };
  }
  return { ...result, isAdmin: true as const };
}

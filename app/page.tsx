import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { DownloaderApp } from "@/components/DownloaderApp";

export default async function HomePage() {
  const { user, profile } = await requireUser();
  if (!user) redirect("/login");

  return <DownloaderApp profile={profile} userId={user.id} />;
}

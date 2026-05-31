import { redirect } from "next/navigation";
import { createClient } from "@/app/lib/supabase/server";
import { AppShell } from "@/app/components/shell/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  return <AppShell email={user.email ?? null}>{children}</AppShell>;
}

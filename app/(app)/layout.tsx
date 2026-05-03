import { AppShell } from "@/components/shell/app-shell";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let user: { name: string | null; email: string } | null = null;
  let initialDark = false;

  if (isSupabaseConfigured()) {
    try {
      const supabase = await createClient();
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (authUser) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("name, dark_mode")
          .eq("id", authUser.id)
          .maybeSingle();
        user = {
          name: profile?.name ?? null,
          email: authUser.email ?? "",
        };
        initialDark = profile?.dark_mode ?? false;
      }
    } catch {
      // unauthenticated — fine
    }
  }

  return (
    <AppShell user={user} initialDark={initialDark}>
      {children}
    </AppShell>
  );
}

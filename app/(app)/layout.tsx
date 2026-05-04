import { AppShell } from "@/components/shell/app-shell";
import { PlanStalePrompt } from "@/components/plan/plan-stale-prompt";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { readPlanStaleHintCookie } from "@/lib/plans/staleness";

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

  // Mounted globally so any mutating action that sets the cookie gets
  // its prompt rendered on the next page load (including after the
  // redirect that removeMember triggers). The dialog itself dismisses
  // + clears the cookie when the user picks an option.
  const planStaleHint = user ? await readPlanStaleHintCookie() : null;

  return (
    <AppShell user={user} initialDark={initialDark}>
      {children}
      {planStaleHint ? <PlanStalePrompt hint={planStaleHint} /> : null}
    </AppShell>
  );
}

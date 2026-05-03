import { redirect } from "next/navigation";
import { H, Body, Label } from "@/components/ds";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { ProgramCard } from "@/components/programs/program-card";
import { PROGRAMS } from "@/lib/programs";

export default async function ProgramsPage() {
  const supabase = isSupabaseConfigured() ? await createClient() : null;
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user || !supabase) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("active_program")
    .eq("id", user.id)
    .maybeSingle();
  const active = (profile?.active_program as string | null) ?? null;

  return (
    <div className="px-6 md:px-12 py-8 md:py-12 max-w-6xl mx-auto flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Label>library</Label>
        <H size="xl" as="h1">
          Programs
        </H>
        <Body size="lg" dim>
          Curated meal-planning systems. Activate one and Hestia&apos;s coach +
          insights bias toward it. End anytime.
        </Body>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {PROGRAMS.map((p) => (
          <ProgramCard key={p.id} program={p} active={active === p.id} />
        ))}
      </div>
    </div>
  );
}

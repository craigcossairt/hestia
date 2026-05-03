import { redirect } from "next/navigation";
import { H, Body, Label } from "@/components/ds";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { ProgramCard } from "@/components/programs/program-card";
import { PROGRAMS } from "@/lib/programs";
import type { FamilyMember } from "@/lib/family";

export default async function ProgramsPage() {
  const supabase = isSupabaseConfigured() ? await createClient() : null;
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user || !supabase) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("active_programs, family_json")
    .eq("id", user.id)
    .maybeSingle();
  const userPrograms =
    ((profile as { active_programs?: string[] | null } | null)?.active_programs) ??
    [];
  const family =
    ((profile as { family_json?: FamilyMember[] | null } | null)?.family_json) ??
    [];

  // Build a map of programId -> list of scope display names that have it active.
  const scopesByProgram = new Map<string, string[]>();
  for (const id of userPrograms) {
    scopesByProgram.set(id, ["You"]);
  }
  for (const member of family) {
    if (!member.name?.trim()) continue;
    for (const id of member.active_programs ?? []) {
      const cur = scopesByProgram.get(id) ?? [];
      cur.push(member.name);
      scopesByProgram.set(id, cur);
    }
  }

  return (
    <div className="px-6 md:px-12 py-8 md:py-12 max-w-6xl mx-auto flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Label>library</Label>
        <H size="xl" as="h1">
          Programs
        </H>
        <Body size="lg" dim>
          Curated meal-planning systems. Activate any combination — workflow
          programs stack, while patterns and focus protocols are exclusive
          per person. End anytime.
        </Body>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {PROGRAMS.map((p) => (
          <ProgramCard
            key={p.id}
            program={p}
            activeScopes={scopesByProgram.get(p.id) ?? []}
            activeForUser={userPrograms.includes(p.id)}
          />
        ))}
      </div>
    </div>
  );
}

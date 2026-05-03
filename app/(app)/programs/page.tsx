import { redirect } from "next/navigation";
import { H, Body, Label } from "@/components/ds";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { ProgramCard } from "@/components/programs/program-card";
import { PROGRAMS, type ProgramKind } from "@/lib/programs";
import type { FamilyMember } from "@/lib/family";

const SECTIONS: Array<{
  kind: ProgramKind;
  title: string;
  blurb: string;
}> = [
  {
    kind: "workflow",
    title: "Workflows",
    blurb:
      "Cooking-mode toggles. Stack as many as fit your kitchen — they don't conflict with each other or with patterns and focuses. Household-level only (not assigned per person).",
  },
  {
    kind: "pattern",
    title: "Patterns",
    blurb:
      "Eating-pattern protocols (when and how you eat). Only one can be active per person — patterns disagree on timing. Activating a second pattern replaces the first.",
  },
  {
    kind: "focus",
    title: "Focus protocols",
    blurb:
      "Therapeutic or performance focus (what you eat and why). Only one can be active per person — focuses disagree on dietary framing. Activating a second focus replaces the first.",
  },
];

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
    (
      (profile as { family_json?: FamilyMember[] | null } | null)?.family_json ??
      []
    ).filter((m) => m.name?.trim());

  // Build a map of programId -> list of scope display names that have it active.
  const scopesByProgram = new Map<string, string[]>();
  for (const id of userPrograms) {
    scopesByProgram.set(id, ["You"]);
  }
  for (const member of family) {
    for (const id of member.active_programs ?? []) {
      const cur = scopesByProgram.get(id) ?? [];
      cur.push(member.name);
      scopesByProgram.set(id, cur);
    }
  }

  const familyForCards = family.map((m) => ({
    id: m.id,
    name: m.name,
    active_programs: m.active_programs ?? [],
  }));

  return (
    <div className="px-6 md:px-12 py-8 md:py-12 max-w-6xl mx-auto flex flex-col gap-10">
      <header className="flex flex-col gap-2">
        <Label>library</Label>
        <H size="xl" as="h1">
          Programs
        </H>
        <Body size="lg" dim>
          Curated meal-planning systems. Activate any combination — workflow
          programs stack, while patterns and focus protocols are exclusive
          per person.
        </Body>
      </header>

      {SECTIONS.map((section) => {
        const programs = PROGRAMS.filter((p) => p.kind === section.kind);
        if (programs.length === 0) return null;
        return (
          <section key={section.kind} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2 border-l-2 border-accent pl-4">
              <H size="sm" as="h2" className="text-ink">
                {section.title}
              </H>
              <Body size="sm" dim className="max-w-2xl">
                {section.blurb}
              </Body>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {programs.map((p) => (
                <ProgramCard
                  key={p.id}
                  program={p}
                  activeScopes={scopesByProgram.get(p.id) ?? []}
                  activeForUser={userPrograms.includes(p.id)}
                  userActivePrograms={userPrograms}
                  family={familyForCards}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

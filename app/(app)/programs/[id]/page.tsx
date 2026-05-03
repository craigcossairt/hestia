import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Check } from "lucide-react";
import { H, Body, Label, Btn, Card, Mono } from "@/components/ds";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { ScopePicker } from "@/components/programs/scope-picker";
import { SundayPrepTimeline } from "@/components/programs/sunday-prep-timeline";
import { getProgram } from "@/lib/programs";
import type { FamilyMember } from "@/lib/family";

export default async function ProgramDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const program = getProgram(id);
  if (!program) notFound();

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

  const options = [
    { label: "You", scope: { kind: "user" as const }, active: userPrograms.includes(id) },
    ...family
      .filter((m) => m.name?.trim())
      .map((m) => ({
        label: m.name,
        scope: { kind: "member" as const, memberId: m.id },
        active: (m.active_programs ?? []).includes(id),
      })),
  ];

  return (
    <div className="flex flex-col">
      {/* hero strip */}
      <div
        className="h-32"
        style={{
          background: `linear-gradient(135deg, ${program.hero_color}, color-mix(in oklch, ${program.hero_color} 60%, white))`,
        }}
      />

      <div className="px-6 md:px-12 py-8 md:py-12 max-w-4xl mx-auto w-full flex flex-col gap-8">
        <header className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Label>{program.category}</Label>
            <Mono className="text-ink-3 text-[12px]">
              {program.duration_days}-day program
            </Mono>
          </div>
          <H size="xl" as="h1">
            {program.name}
          </H>
          <Body size="lg" dim>
            {program.long}
          </Body>
        </header>

        <Card className="p-6 flex flex-col gap-4">
          <Label>what&apos;s included</Label>
          <ul className="flex flex-col gap-2 mt-1">
            {program.features.map((f) => (
              <li
                key={f}
                className="flex items-start gap-2.5 text-ink-2 font-sans text-[14px]"
              >
                <Check
                  size={14}
                  strokeWidth={2}
                  className="mt-1 shrink-0 text-accent"
                />
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <div className="border-t border-ink-l/40 pt-4">
            <ScopePicker
              programId={id}
              programName={program.name}
              programKind={program.kind}
              options={options}
            />
          </div>
          <div className="flex gap-2 pt-3 border-t border-ink-l/40">
            <Link href="/programs">
              <Btn variant="ghost">All programs</Btn>
            </Link>
          </div>
        </Card>

        {/* Sunday Prep gets the timeline generator */}
        {id === "sunday-prep" ? (
          <section className="flex flex-col gap-3">
            <H size="md" as="h2">
              This week&apos;s timeline
            </H>
            <SundayPrepTimeline />
          </section>
        ) : null}
      </div>
    </div>
  );
}

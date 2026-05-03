import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Check } from "lucide-react";
import { H, Body, Label, Btn, Card, Mono } from "@/components/ds";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import {
  activateProgram,
  deactivateProgram,
} from "@/app/(app)/programs/actions";
import { SundayPrepTimeline } from "@/components/programs/sunday-prep-timeline";
import { getProgram } from "@/lib/programs";

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
    .select("active_program")
    .eq("id", user.id)
    .maybeSingle();
  const isActive =
    (profile as { active_program?: string | null } | null)?.active_program === id;

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

        <Card className="p-6 flex flex-col gap-3">
          <Label>what&apos;s included</Label>
          <ul className="flex flex-col gap-2 mt-2">
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
          <div className="flex gap-2 pt-3 border-t border-ink-l/40 mt-2">
            {isActive ? (
              <form
                action={async () => {
                  "use server";
                  await deactivateProgram();
                }}
              >
                <Btn variant="outline" type="submit">
                  Active · end program
                </Btn>
              </form>
            ) : (
              <form
                action={async () => {
                  "use server";
                  await activateProgram(id);
                }}
              >
                <Btn variant="primary" type="submit">
                  Activate program
                </Btn>
              </form>
            )}
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

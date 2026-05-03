import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { H, Body, Label, Btn, Card, Mono } from "@/components/ds";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { ProfileSection } from "@/components/me/profile-section";
import { DietSection } from "@/components/me/diet-section";
import { ScheduleSection } from "@/components/me/schedule-section";
import { WeightSection } from "@/components/me/weight-section";
import { HealthSection } from "@/components/me/health-section";
import { RemoveMemberButton } from "@/components/family/remove-member-button";
import type { FamilyMember } from "@/lib/family";

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = isSupabaseConfigured() ? await createClient() : null;
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user || !supabase) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("schedule_json, family_json")
    .eq("id", user.id)
    .maybeSingle();
  const family =
    (profile?.family_json as FamilyMember[] | null | undefined) ?? [];
  const member = family.find((m) => m.id === id);
  if (!member) notFound();

  // Per-member weight log history. Falls through gracefully if migration
  // hasn't been run yet.
  let recentWeights: Array<{ id: string; value_kg: number; logged_at: string }> = [];
  try {
    const { data } = await supabase
      .from("weight_logs")
      .select("id, value_kg, logged_at")
      .eq("user_id", user.id)
      .eq("family_member_id", id)
      .order("logged_at", { ascending: false })
      .limit(5);
    recentWeights = data ?? [];
  } catch {
    // table or column doesn't exist yet — ignore
  }

  // Member's own schedule, falling back to the household default.
  const householdSchedule = (profile?.schedule_json as {
    breakfast?: string;
    lunch?: string;
    dinner?: string;
  } | null) ?? { breakfast: "08:00", lunch: "12:30", dinner: "19:00" };
  const memberSchedule = member.schedule_json ?? {};
  const schedule = {
    breakfast: memberSchedule.breakfast ?? householdSchedule.breakfast ?? "08:00",
    lunch: memberSchedule.lunch ?? householdSchedule.lunch ?? "12:30",
    dinner: memberSchedule.dinner ?? householdSchedule.dinner ?? "19:00",
  };

  const scope = { kind: "member" as const, memberId: id };

  return (
    <div className="px-6 md:px-12 py-8 md:py-12 max-w-2xl mx-auto flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <Link
          href="/family"
          className="inline-flex items-center gap-1.5 text-ink-3 hover:text-ink font-sans text-[12.5px]"
        >
          <ArrowLeft size={14} strokeWidth={1.6} />
          All family
        </Link>
        <Mono className="text-ink-3 text-[10.5px] uppercase tracking-[1.4px]">
          household member
        </Mono>
      </div>

      <header className="flex flex-col gap-2">
        <Label>profile</Label>
        <H size="xl" as="h1">
          {member.name || "Unnamed member"}
        </H>
        <Body size="lg" dim>
          Edit anything below — Hestia uses it when planning meals for the
          household.
        </Body>
      </header>

      <ProfileSection
        scope={scope}
        profile={{
          name: member.name,
          sex: member.sex ?? null,
          age: member.age,
          height_cm: member.height_cm ?? null,
          weight_kg: member.weight_kg ?? null,
          activity: member.activity ?? null,
          goal: member.goal ?? null,
          kcal_target: member.kcal_target ?? null,
          protein_target: member.protein_target ?? null,
          carbs_target: member.carbs_target ?? null,
          fat_target: member.fat_target ?? null,
        }}
      />

      <WeightSection
        scope={scope}
        currentKg={member.weight_kg ?? null}
        recent={recentWeights}
      />

      <DietSection
        scope={scope}
        initial={{
          dietary_restrictions: member.dietary_restrictions ?? [],
          allergies: member.allergies ?? [],
          disliked_foods: member.disliked_foods ?? [],
        }}
      />

      <HealthSection
        scope={scope}
        initial={member.medical_conditions ?? []}
      />

      <ScheduleSection scope={scope} initial={schedule} />

      <Card className="p-6 flex flex-col gap-3">
        <Label accent>danger zone</Label>
        <Body size="sm" dim>
          Removes {member.name || "this member"} from the household and deletes
          their weight history. Programs assigned to them are dropped.
        </Body>
        <RemoveMemberButton memberId={id} memberName={member.name} />
      </Card>

      <Link href="/family" className="self-start">
        <Btn variant="ghost" size="sm">
          ← Back to family
        </Btn>
      </Link>
    </div>
  );
}

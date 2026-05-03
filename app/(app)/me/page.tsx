import { redirect } from "next/navigation";
import { H, Body, Btn, Label, Card, Mono } from "@/components/ds";
import { signOut } from "@/app/(auth)/login/actions";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { ProfileSection } from "@/components/me/profile-section";
import { DietSection } from "@/components/me/diet-section";
import { ScheduleSection } from "@/components/me/schedule-section";
import { AppearanceSection } from "@/components/me/appearance-section";
import { WeightSection } from "@/components/me/weight-section";
import { FamilySection } from "@/components/me/family-section";
import type { AccentPreset } from "@/lib/types/database";
import type { FamilyMember } from "@/lib/family";

export default async function MePage() {
  const supabase = isSupabaseConfigured() ? await createClient() : null;
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user || !supabase) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "name, sex, age, height_cm, weight_kg, activity, goal, kcal_target, protein_target, carbs_target, fat_target, dietary_restrictions, schedule_json, accent_preset, dark_mode, onboarded_at, family_json",
    )
    .eq("id", user.id)
    .maybeSingle();

  const family =
    (profile?.family_json as FamilyMember[] | null | undefined) ?? [];

  if (!profile?.onboarded_at) redirect("/onboard");

  // Best-effort: weight_logs table may not exist yet if migration 0002 hasn't
  // been run. Tolerate the failure — the WeightSection still renders for
  // logging, just without the recent list.
  let recentWeights: Array<{ id: string; value_kg: number; logged_at: string }> = [];
  try {
    const { data } = await supabase
      .from("weight_logs")
      .select("id, value_kg, logged_at")
      .eq("user_id", user.id)
      .order("logged_at", { ascending: false })
      .limit(5);
    recentWeights = data ?? [];
  } catch {
    // table doesn't exist yet — ignore
  }

  const schedule = (profile.schedule_json as {
    breakfast?: string;
    lunch?: string;
    dinner?: string;
  } | null) ?? { breakfast: "08:00", lunch: "12:30", dinner: "19:00" };

  return (
    <div className="px-6 md:px-12 py-8 md:py-12 max-w-2xl mx-auto flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Label>profile</Label>
        <H size="xl" as="h1">
          Me
        </H>
        <Body size="lg" dim>
          Edit anything below — Hestia uses it to compute targets and generate
          recipes.
        </Body>
      </header>

      <ProfileSection
        profile={{
          name: profile.name,
          sex: profile.sex,
          age: profile.age,
          height_cm: profile.height_cm,
          weight_kg: profile.weight_kg,
          activity: profile.activity,
          goal: profile.goal,
          kcal_target: profile.kcal_target,
          protein_target: profile.protein_target,
          carbs_target: profile.carbs_target,
          fat_target: profile.fat_target,
        }}
      />

      <WeightSection currentKg={profile.weight_kg} recent={recentWeights} />

      <FamilySection initial={family} />

      <DietSection initial={profile.dietary_restrictions ?? []} />

      <ScheduleSection
        initial={{
          breakfast: schedule.breakfast ?? "08:00",
          lunch: schedule.lunch ?? "12:30",
          dinner: schedule.dinner ?? "19:00",
        }}
      />

      <AppearanceSection
        initialAccent={(profile.accent_preset as AccentPreset) ?? "charcoal"}
        initialDark={profile.dark_mode ?? false}
      />

      <Card className="p-6 flex flex-col gap-3">
        <Label>account</Label>
        <Body size="sm">
          Signed in as <Mono className="text-ink">{user.email}</Mono>.
        </Body>
        <form action={signOut}>
          <Btn variant="outline" type="submit">
            sign out
          </Btn>
        </form>
      </Card>
    </div>
  );
}

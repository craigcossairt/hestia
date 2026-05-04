import { redirect } from "next/navigation";
import { H, Body, Label } from "@/components/ds";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { FamilyCard } from "@/components/family/family-card";
import { AddMemberForm } from "@/components/family/add-member-form";
import type { FamilyMember } from "@/lib/family";

export default async function FamilyPage() {
  const supabase = isSupabaseConfigured() ? await createClient() : null;
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user || !supabase) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "name, sex, age, height_cm, weight_kg, activity, goal, kcal_target, protein_target, carbs_target, fat_target, dietary_restrictions, allergies, disliked_foods, medical_conditions, family_json, active_programs",
    )
    .eq("id", user.id)
    .maybeSingle();

  const family =
    (profile?.family_json as FamilyMember[] | null | undefined) ?? [];

  // Shape the user's profile as a FamilyMember-equivalent so the same card
  // component renders both. The "self" card links to /me.
  const selfAsMember: FamilyMember = {
    id: "self",
    name: profile?.name ?? "You",
    age: profile?.age ?? 0,
    sex: profile?.sex ?? undefined,
    height_cm: profile?.height_cm ?? null,
    weight_kg: profile?.weight_kg ?? null,
    activity: profile?.activity ?? null,
    goal: profile?.goal ?? null,
    kcal_target: profile?.kcal_target ?? null,
    protein_target: profile?.protein_target ?? null,
    carbs_target: profile?.carbs_target ?? null,
    fat_target: profile?.fat_target ?? null,
    dietary_restrictions: profile?.dietary_restrictions ?? [],
    allergies: profile?.allergies ?? [],
    disliked_foods: profile?.disliked_foods ?? [],
    medical_conditions: profile?.medical_conditions ?? [],
    portion_modifier: 1,
    active_programs: profile?.active_programs ?? [],
  };

  return (
    <div className="px-6 md:px-12 py-8 md:py-12 max-w-5xl mx-auto flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Label>household</Label>
        <H size="xl" as="h1">
          Family
        </H>
        <Body size="lg" dim>
          Everyone you cook for. Click a card to edit their profile —
          Hestia uses these to plan plates that work for the whole table.
        </Body>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <FamilyCard member={selfAsMember} href="/me" isSelf />
        {family
          .filter((m) => m.name?.trim())
          .map((m) => (
            <FamilyCard key={m.id} member={m} href={`/family/${m.id}`} />
          ))}
      </section>

      <div>
        <AddMemberForm />
      </div>
    </div>
  );
}

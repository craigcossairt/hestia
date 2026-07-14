"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { computeTargets, type TargetInputs } from "@/lib/ai/targets";
import { generateBlueprintInsight } from "@/lib/ai/blueprint-insight";

export interface OnboardSubmission {
  name: string;
  sex: TargetInputs["sex"];
  age: number;
  height_cm: number;
  weight_kg: number;
  activity: TargetInputs["activity"];
  goal: TargetInputs["goal"];
  dietary_restrictions: string[];
  schedule: { breakfast: string; lunch: string; dinner: string };
}

export async function submitOnboarding(submission: OnboardSubmission) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const targets = computeTargets({
    sex: submission.sex,
    age: submission.age,
    height_cm: submission.height_cm,
    weight_kg: submission.weight_kg,
    activity: submission.activity,
    goal: submission.goal,
  });

  // Best-effort AI narrative — if the call fails (no key, network, quota),
  // persist numbers anyway and skip the narrative.
  const narrative = await generateBlueprintInsight({
    supabase,
    userId: user.id,
    inputs: {
      sex: submission.sex,
      age: submission.age,
      height_cm: submission.height_cm,
      weight_kg: submission.weight_kg,
      activity: submission.activity,
      goal: submission.goal,
    },
    targets,
    persist: false,
    warnLabel: "Blueprint narrative skipped",
  });

  const { error } = await supabase
    .from("profiles")
    .update({
      name: submission.name,
      sex: submission.sex,
      age: submission.age,
      height_cm: submission.height_cm,
      weight_kg: submission.weight_kg,
      activity: submission.activity,
      goal: submission.goal,
      kcal_target: targets.kcal,
      protein_target: targets.protein_g,
      carbs_target: targets.carbs_g,
      fat_target: targets.fat_g,
      dietary_restrictions: submission.dietary_restrictions,
      schedule_json: submission.schedule,
      onboarded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    return { error: error.message };
  }

  if (narrative) {
    await supabase.from("insights").insert({
      user_id: user.id,
      kind: "blueprint",
      body: narrative,
    });
  }

  redirect("/result");
}

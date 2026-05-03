"use server";

import { redirect } from "next/navigation";
import { generateText } from "ai";
import { createClient } from "@/lib/supabase/server";
import { computeTargets, type TargetInputs } from "@/lib/ai/targets";
import { getXai, MODELS } from "@/lib/ai/grok";
import { blueprintPrompt } from "@/lib/ai/prompts/blueprint";

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

  // Best-effort AI narrative — if the call fails (no key, network), persist
  // numbers anyway and skip the narrative.
  let narrative: string | null = null;
  try {
    const xai = getXai();
    const { text } = await generateText({
      model: xai(MODELS.fast),
      prompt: blueprintPrompt(
        {
          sex: submission.sex,
          age: submission.age,
          height_cm: submission.height_cm,
          weight_kg: submission.weight_kg,
          activity: submission.activity,
          goal: submission.goal,
        },
        targets,
      ),
    });
    narrative = text.trim();
  } catch (err) {
    console.warn("Blueprint narrative skipped:", (err as Error).message);
  }

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

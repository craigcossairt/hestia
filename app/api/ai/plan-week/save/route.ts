import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { resolveRecipePhoto } from "@/lib/ai/photo";
import { PlanWeekSchema, type PlanSlot } from "@/lib/ai/prompts/plan-week";
import type { FamilyMember } from "@/lib/family";

// Saves the AI's already-streamed plan: resolves photos in parallel,
// writes recipes + plan_entries (with leftover propagation). Mirrors the
// shape of the legacy /api/ai/plan-week route's save phase, just driven
// by a client-supplied result instead of a server-side AI call.

// Photo resolution + 21 inserts can take longer than the previous 120s
// budget when the photo chain has to go all the way through Brave/Pexels
// for every meal. 300s = Vercel default, plenty of headroom.
export const maxDuration = 300;

const REQUIRED_SLOTS: PlanSlot[] = ["breakfast", "lunch", "dinner"];

function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const out = new Date(d);
  out.setDate(d.getDate() + diff);
  out.setHours(0, 0, 0, 0);
  return out;
}

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

const Body = z.object({
  week_start: z.string().optional(),
  include_snack: z.boolean().optional(),
  include_dessert: z.boolean().optional(),
  include_beverage: z.boolean().optional(),
  regenerate: z.boolean().optional(),
  result: PlanWeekSchema,
});

export async function POST(req: NextRequest) {
  try {
    const json = await req.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: `Invalid body: ${parsed.error.message}` },
        { status: 400 },
      );
    }
    const body = parsed.data;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("family_json")
      .eq("id", user.id)
      .maybeSingle();
    const family = (
      (profile as { family_json?: FamilyMember[] | null } | null)?.family_json ??
      []
    ).filter((f) => f.name && f.name.trim().length > 0);

    const slots: PlanSlot[] = [...REQUIRED_SLOTS];
    if (body.include_snack) slots.push("snack");
    if (body.include_dessert) slots.push("dessert");
    if (body.include_beverage) slots.push("beverage");

    const requestedWeek =
      body.week_start && isValidDate(body.week_start)
        ? new Date(`${body.week_start}T00:00:00`)
        : new Date();
    const start = startOfWeek(requestedWeek);
    const dates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d.toISOString().slice(0, 10);
    });

    // Optional regenerate: drop existing planned entries for this week +
    // these slots before insert. Logged/skipped never touched.
    if (body.regenerate) {
      await supabase
        .from("meal_plan_entries")
        .delete()
        .eq("user_id", user.id)
        .eq("status", "planned")
        .gte("date", dates[0])
        .lte("date", dates[6])
        .in("slot", slots);
    }

    const { data: existingPlans } = await supabase
      .from("meal_plan_entries")
      .select("date, slot")
      .eq("user_id", user.id)
      .gte("date", dates[0])
      .lte("date", dates[6])
      .in("slot", slots);
    const filledKeys = new Set(
      (existingPlans ?? []).map((e) => `${e.date}|${e.slot}`),
    );

    const meals = body.result.meals;

    // Resolve photos up-front in parallel for meals with a recipe AND
    // not already-filled. AI-supplied image URLs win in the resolver.
    const photoTargets: Array<{
      index: number;
      recipeName: string;
      aiImageUrl: string | null;
      promptHint: string;
    }> = [];
    meals.forEach((m, i) => {
      const slotOk = slots.includes(m.slot as PlanSlot);
      const dateOk = dates.includes(m.date);
      const filled = filledKeys.has(`${m.date}|${m.slot}`);
      if (m.recipe && slotOk && dateOk && !filled) {
        photoTargets.push({
          index: i,
          recipeName: m.recipe.name,
          aiImageUrl: m.recipe.image_url ?? null,
          promptHint: m.recipe.tags?.slice(0, 3).join(", ") ?? "",
        });
      }
    });
    const resolvedPhotos = await Promise.all(
      photoTargets.map((t) =>
        resolveRecipePhoto({
          recipeName: t.recipeName,
          aiImageUrl: t.aiImageUrl,
          promptHint: t.promptHint,
        }).catch(() => null),
      ),
    );
    const photoByIndex = new Map<number, string | null>();
    photoTargets.forEach((t, j) => {
      photoByIndex.set(t.index, resolvedPhotos[j]?.url ?? null);
    });

    const created: Array<{ date: string; slot: string; recipe_name: string }> = [];
    let skipped = filledKeys.size;
    const entryIdByIndex = new Map<number, string>();
    const recipeIdByIndex = new Map<number, string>();

    for (let i = 0; i < meals.length; i++) {
      const m = meals[i];
      if (!dates.includes(m.date) || !slots.includes(m.slot as PlanSlot)) {
        continue;
      }
      if (filledKeys.has(`${m.date}|${m.slot}`)) {
        continue;
      }

      // Leftover branch: reuse an earlier insert.
      if (typeof m.is_leftover_of_index === "number") {
        const sourceIdx = m.is_leftover_of_index;
        if (sourceIdx >= i) continue;
        const sourceEntryId = entryIdByIndex.get(sourceIdx);
        const sourceRecipeId = recipeIdByIndex.get(sourceIdx);
        if (!sourceEntryId || !sourceRecipeId) continue;

        await supabase.from("meal_plan_entries").insert({
          user_id: user.id,
          date: m.date,
          slot: m.slot,
          recipe_id: sourceRecipeId,
          status: "planned",
          is_leftover_of: sourceEntryId,
        });
        created.push({
          date: m.date,
          slot: m.slot,
          recipe_name: `(leftover) ${meals[sourceIdx]?.recipe?.name ?? "earlier meal"}`,
        });
        continue;
      }

      // Fresh recipe branch.
      const r = m.recipe;
      if (!r) continue;
      const { data: recipeRow, error: recipeErr } = await supabase
        .from("recipes")
        .insert({
          owner_id: user.id,
          name: r.name,
          photo_url: photoByIndex.get(i) ?? null,
          source_url: null,
          ingredients_json: r.ingredients,
          steps_json: r.steps,
          kcal: r.kcal,
          protein: r.protein,
          carbs: r.carbs,
          fat: r.fat,
          time_min: r.time_min,
          servings: r.servings ?? 1 + family.length,
          family_notes_json: r.family_modifications ?? [],
          tips_json: r.tips ?? [],
          tags: [...new Set([...(r.tags ?? []), "auto-generated"])],
        })
        .select("id")
        .single();

      if (recipeErr || !recipeRow) continue;
      recipeIdByIndex.set(i, recipeRow.id);

      const { data: entryRow } = await supabase
        .from("meal_plan_entries")
        .insert({
          user_id: user.id,
          date: m.date,
          slot: m.slot,
          recipe_id: recipeRow.id,
          status: "planned",
        })
        .select("id")
        .single();
      if (entryRow) entryIdByIndex.set(i, entryRow.id);

      created.push({
        date: m.date,
        slot: m.slot,
        recipe_name: r.name,
      });
    }

    revalidatePath("/plan");
    revalidatePath("/today");
    revalidatePath("/recipes");
    revalidatePath("/shop");

    return NextResponse.json({ ok: true, created, skipped });
  } catch (err) {
    return NextResponse.json(
      { error: `Server error: ${(err as Error).message ?? "unknown"}` },
      { status: 500 },
    );
  }
}

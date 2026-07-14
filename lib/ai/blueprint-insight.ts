// Shared best-effort blueprint narrative generation used by /me, /family,
// and onboarding. Quota failures and model errors are logged and skipped —
// callers must never fail the surrounding math/persist path on narrative.

import { generateText } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertAiQuota } from "@/lib/ai/quota";
import { getModel } from "@/lib/ai/provider";
import { blueprintPrompt } from "@/lib/ai/prompts/blueprint";
import type { TargetInputs, TargetResult } from "@/lib/ai/targets";

export async function generateBlueprintInsight(args: {
  supabase: SupabaseClient;
  userId: string;
  inputs: TargetInputs;
  targets: TargetResult;
  /** Prepended to the stored insight body (e.g. member name). */
  bodyPrefix?: string;
  /**
   * When true (default), insert an insights row. When false, only return
   * the trimmed narrative so the caller can persist later.
   */
  persist?: boolean;
  warnLabel?: string;
}): Promise<string | null> {
  const warnLabel = args.warnLabel ?? "Blueprint narrative skipped";
  const quota = await assertAiQuota(args.supabase, args.userId);
  if (!quota.ok) {
    console.warn(`${warnLabel}:`, quota.error);
    return null;
  }

  try {
    const { text } = await generateText({
      model: getModel("fast"),
      prompt: blueprintPrompt(args.inputs, args.targets),
    });
    const narrative = text.trim();
    if (!narrative) return null;

    const body = args.bodyPrefix
      ? `${args.bodyPrefix}${narrative}`
      : narrative;

    if (args.persist !== false) {
      await args.supabase.from("insights").insert({
        user_id: args.userId,
        kind: "blueprint",
        body,
      });
    }

    return body;
  } catch (err) {
    console.warn(`${warnLabel}:`, (err as Error).message);
    return null;
  }
}

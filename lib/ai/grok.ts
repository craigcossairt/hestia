// Backwards-compatible shim. New code should import { getModel } from
// "@/lib/ai/provider" directly. This file existed when Hestia only spoke
// Grok; the provider abstraction now picks the model based on env.

import type { LanguageModel } from "ai";
import { getModel } from "./provider";

// Mimics the old `xai(modelName)` callable so existing callers compile.
// Whichever modelName is passed, we map by name → role and dispatch to the
// configured provider.
function modelByName(_name: string): LanguageModel {
  // Vision model names are the only ones we care about distinguishing for
  // legacy callers. Everything else routes to "fast".
  const role = /vision/.test(_name) ? "vision" : "fast";
  return getModel(role);
}

export function getXai() {
  return modelByName;
}

// Old code uses `MODELS.fast` / `MODELS.vision` as opaque strings. The
// values are no longer dispositive — getXai()(name) ignores them and uses
// env config — but we keep the export so call sites still type-check.
export const MODELS = {
  fast: "fast",
  vision: "vision",
} as const;

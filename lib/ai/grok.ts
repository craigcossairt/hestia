import { createXai } from "@ai-sdk/xai";

let cached: ReturnType<typeof createXai> | null = null;

export function getXai() {
  if (cached) return cached;
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "XAI_API_KEY is not set. Add it to .env.local — get a key at https://console.x.ai.",
    );
  }
  cached = createXai({ apiKey });
  return cached;
}

// Models we use across the app. Keep names in one place.
export const MODELS = {
  // Fast text generation, structured outputs, recipes, narratives.
  fast: "grok-4-fast-reasoning",
  // Vision for receipt OCR.
  vision: "grok-2-vision-1212",
} as const;

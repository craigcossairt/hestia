// Hestia's AI provider abstraction. Picks a provider + model based on env
// vars so the app can ship with Grok by default but swap in OpenAI,
// Anthropic, Google Gemini, or any model accessible via the Vercel AI
// Gateway with a single env change.
//
// Env vars (all optional except the API key for the chosen provider):
//   AI_PROVIDER       — "xai" (default) | "openai" | "anthropic" | "google" | "gateway"
//   AI_MODEL_FAST     — override the fast text/json model
//   AI_MODEL_BULK     — override the model used for the plan-week generator
//                       (defaults to AI_MODEL_FAST). Swap to a faster
//                       non-reasoning model — e.g. AI_MODEL_BULK=grok-3-fast
//                       on xAI — when 21-meal generations are timing out.
//   AI_MODEL_VISION   — override the vision (image input) model
//   AI_MODEL_IMAGE    — override the image-generation model
//   AI_TEMPERATURE    — sampling temperature for text generations (default 0.4)
//   AI_SEED           — fixed seed for repeatable outputs (optional; integer)
//
//   XAI_API_KEY              — required when AI_PROVIDER=xai (default)
//   OPENAI_API_KEY           — required when AI_PROVIDER=openai
//   ANTHROPIC_API_KEY        — required when AI_PROVIDER=anthropic
//   GOOGLE_GENERATIVE_AI_API_KEY — required when AI_PROVIDER=google
//   AI_GATEWAY_API_KEY       — required when AI_PROVIDER=gateway
//
// Gateway models use "provider/model-id" strings, e.g. "openai/gpt-4o-mini".

import type { ImageModel, LanguageModel } from "ai";
import type { ProviderOptions } from "@ai-sdk/provider-utils";
import { createXai } from "@ai-sdk/xai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { gateway } from "ai";

export type AiProvider = "xai" | "openai" | "anthropic" | "google" | "gateway";
// "fast"   — default text/json model, balanced quality/latency.
// "bulk"   — used by plan-week's 21-recipe generator. Defaults to "fast"
//            for each provider; override via AI_MODEL_BULK to swap in a
//            faster non-reasoning variant when big plans time out.
// "vision" — image-input capable model.
export type ModelRole = "fast" | "bulk" | "vision";

const PROVIDER: AiProvider = (process.env.AI_PROVIDER as AiProvider) || "xai";

// Sensible defaults per provider. Override per role via AI_MODEL_FAST /
// AI_MODEL_VISION / AI_MODEL_IMAGE. For the gateway, the model strings use
// "provider/model".
const DEFAULTS: Record<
  AiProvider,
  Record<ModelRole | "image", string | null>
> = {
  xai: {
    fast: "grok-4-fast-reasoning",
    bulk: "grok-4-fast-reasoning",
    vision: "grok-2-vision-1212",
    image: "grok-2-image-1212",
  },
  openai: {
    fast: "gpt-4o-mini",
    bulk: "gpt-4o-mini",
    vision: "gpt-4o-mini",
    image: "dall-e-3",
  },
  anthropic: {
    fast: "claude-haiku-4-5-20251001",
    bulk: "claude-haiku-4-5-20251001",
    vision: "claude-haiku-4-5-20251001",
    image: null,
  },
  google: {
    fast: "gemini-2.5-flash",
    bulk: "gemini-2.5-flash",
    vision: "gemini-2.5-flash",
    image: "imagen-3.0-generate-001",
  },
  gateway: {
    fast: "xai/grok-4-fast-reasoning",
    bulk: "xai/grok-4-fast-reasoning",
    vision: "xai/grok-2-vision-1212",
    image: "xai/grok-2-image-1212",
  },
};

function modelName(role: ModelRole): string {
  if (role === "fast")
    return process.env.AI_MODEL_FAST || (DEFAULTS[PROVIDER].fast as string);
  if (role === "bulk") {
    return (
      process.env.AI_MODEL_BULK ||
      process.env.AI_MODEL_FAST ||
      (DEFAULTS[PROVIDER].bulk as string)
    );
  }
  return process.env.AI_MODEL_VISION || (DEFAULTS[PROVIDER].vision as string);
}

function imageModelName(): string | null {
  return process.env.AI_MODEL_IMAGE || DEFAULTS[PROVIDER].image;
}

function requireKey(name: string, label: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `${label} is not set. Set ${name} in your environment (or change AI_PROVIDER).`,
    );
  }
  return v;
}

let xaiClient: ReturnType<typeof createXai> | null = null;
let openaiClient: ReturnType<typeof createOpenAI> | null = null;
let anthropicClient: ReturnType<typeof createAnthropic> | null = null;
let googleClient: ReturnType<typeof createGoogleGenerativeAI> | null = null;

function ensureXai() {
  if (!xaiClient) {
    xaiClient = createXai({ apiKey: requireKey("XAI_API_KEY", "xAI API key") });
  }
  return xaiClient;
}
function ensureOpenAI() {
  if (!openaiClient) {
    openaiClient = createOpenAI({
      apiKey: requireKey("OPENAI_API_KEY", "OpenAI API key"),
    });
  }
  return openaiClient;
}
function ensureAnthropic() {
  if (!anthropicClient) {
    anthropicClient = createAnthropic({
      apiKey: requireKey("ANTHROPIC_API_KEY", "Anthropic API key"),
    });
  }
  return anthropicClient;
}
function ensureGoogle() {
  if (!googleClient) {
    googleClient = createGoogleGenerativeAI({
      apiKey: requireKey(
        "GOOGLE_GENERATIVE_AI_API_KEY",
        "Google Generative AI API key",
      ),
    });
  }
  return googleClient;
}

// Returns a LanguageModel ready for `generateObject` / `generateText` /
// `streamText`. Pick "fast" for text + JSON outputs and "vision" for any
// call that includes image inputs.
export function getModel(role: ModelRole): LanguageModel {
  const name = modelName(role);
  switch (PROVIDER) {
    case "xai":
      return ensureXai()(name);
    case "openai":
      return ensureOpenAI()(name);
    case "anthropic":
      return ensureAnthropic()(name);
    case "google":
      return ensureGoogle()(name);
    case "gateway":
      requireKey("AI_GATEWAY_API_KEY", "Vercel AI Gateway API key");
      return gateway(name);
    default:
      throw new Error(`Unknown AI_PROVIDER: ${PROVIDER}`);
  }
}

// Image generation model, or null if the configured provider doesn't ship
// one. Use with `experimental_generateImage` from the AI SDK.
export function getImageModel(): ImageModel | null {
  const name = imageModelName();
  if (!name) return null;
  try {
    switch (PROVIDER) {
      case "xai":
        return ensureXai().imageModel(name);
      case "openai":
        return ensureOpenAI().imageModel(name);
      case "google":
        return ensureGoogle().imageModel(name);
      case "anthropic":
        return null;
      case "gateway":
        requireKey("AI_GATEWAY_API_KEY", "Vercel AI Gateway API key");
        return gateway.imageModel(name);
    }
  } catch {
    return null;
  }
  return null;
}

// Default sampling settings — kept consistent across providers so swapping
// AI_PROVIDER doesn't materially change the output style. Override via
// AI_TEMPERATURE / AI_SEED.
export function getModelOpts(): { temperature: number; seed?: number } {
  const temperature = process.env.AI_TEMPERATURE
    ? Math.max(0, Math.min(1, Number(process.env.AI_TEMPERATURE)))
    : 0.4;
  const seedRaw = process.env.AI_SEED;
  const seed = seedRaw && /^\d+$/.test(seedRaw) ? Number(seedRaw) : undefined;
  return seed != null ? { temperature, seed } : { temperature };
}

// Provider-specific options passed straight through to generateText /
// generateObject / streamText. Today this enables live web search for
// providers that support it natively.
//
// Default-on for xAI (the photo-passthrough chain leans on the model
// returning image_url from search results — no search means no
// passthrough). Set AI_DISABLE_SEARCH=true to opt out globally, OR pass
// { disableSearch: true } per call for routes where the search latency
// is too costly (e.g. plan-week generates 21 recipes; with auto-search
// per recipe the model spends 60+ seconds searching before any token
// streams to the client).
export function getProviderOptions(opts?: {
  disableSearch?: boolean;
}): ProviderOptions {
  const globallyDisabled = process.env.AI_DISABLE_SEARCH === "true";
  if (globallyDisabled || opts?.disableSearch) return {};
  switch (PROVIDER) {
    case "xai":
      return {
        xai: {
          searchParameters: { mode: "auto", returnCitations: true },
        },
      };
    default:
      // OpenAI / Anthropic / Google search wiring varies per provider and
      // is left to the user (e.g. AI_MODEL_FAST=gpt-4o-search-preview).
      return {};
  }
}

// Useful for clients that need to know which provider is wired up
// (telemetry, debug pages, etc).
export function getProviderId(): AiProvider {
  return PROVIDER;
}

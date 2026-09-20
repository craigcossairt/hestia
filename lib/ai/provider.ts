// Hestia's AI provider abstraction. Picks a provider + model based on env
// vars so the app can ship with Grok by default but swap in OpenAI,
// Anthropic, Google Gemini, or any model accessible via the Vercel AI
// Gateway with a single env change.
//
// Call sites MUST use roles (`getModel("fast" | "bulk" | "vision")`), never
// provider slugs. Slugs live only in the catalog below (plus env overrides).
//
// Env vars (all optional except the API key for the chosen provider):
//   AI_PROVIDER       — "xai" (default) | "openai" | "anthropic" | "google" | "gateway"
//   AI_MODEL_FAST     — override the fast text/json model
//   AI_MODEL_BULK     — override the plan-week generator. Independent of
//                       AI_MODEL_FAST so a Coach bump cannot put week
//                       generation back on a reasoning model.
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
// Capability roles — the only model identifiers call sites should use.
// "fast"   — default text/json: coach, single recipes, pantry, insights.
// "bulk"   — plan-week's 21-recipe generator. Must stream JSON immediately
//            (non-reasoning). Do not point this at grok-4.6: that model
//            defaults to high reasoning that cannot be disabled.
// "vision" — image-input capable model (receipts, recipe photos).
export type ModelRole = "fast" | "bulk" | "vision";

const PROVIDERS = [
  "xai",
  "openai",
  "anthropic",
  "google",
  "gateway",
] as const satisfies readonly AiProvider[];

function isAiProvider(value: string): value is AiProvider {
  return (PROVIDERS as readonly string[]).includes(value);
}

function currentProvider(): AiProvider {
  const raw = process.env.AI_PROVIDER;
  if (!raw) return "xai";
  if (isAiProvider(raw)) return raw;
  throw new Error(`Unknown AI_PROVIDER: ${raw}`);
}

// Per-provider catalog keyed by role. Override a role via AI_MODEL_FAST /
// AI_MODEL_BULK / AI_MODEL_VISION / AI_MODEL_IMAGE. Gateway strings use
// "provider/model".
const DEFAULTS: Record<
  AiProvider,
  Record<ModelRole | "image", string | null>
> = {
  xai: {
    fast: "grok-4.3",
    bulk: "grok-4.20-0309-non-reasoning",
    vision: "grok-4.3",
    image: "grok-imagine-image-2.0",
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
    fast: "xai/grok-4.3",
    bulk: "xai/grok-4.20-0309-non-reasoning",
    vision: "xai/grok-4.3",
    image: "xai/grok-imagine-image-2.0",
  },
};

function catalogModel(
  provider: AiProvider,
  role: ModelRole | "image",
): string | null {
  return DEFAULTS[provider][role];
}

function envOverride(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

// Retired / reasoning slugs that stall week-plan JSON (no text-delta until
// thinking finishes, then often past Vercel's 300s budget). Env overrides
// from the old docs (AI_MODEL_BULK=grok-4-fast-reasoning, grok-4.6, grok-4.3)
// must not beat the non-reasoning catalog row.
function bareModelId(slug: string): string {
  const slash = slug.lastIndexOf("/");
  return slash >= 0 ? slug.slice(slash + 1) : slug;
}

export function isReasoningBulkSlug(slug: string): boolean {
  const id = bareModelId(slug);
  if (id.includes("non-reasoning")) return false;
  if (id.includes("reasoning")) return true;
  return /^(grok-4)(\.3|\.5|\.6)?(-latest|-0709)?$/.test(id);
}

function coerceBulkSlug(slug: string, provider: AiProvider): string {
  if (!isReasoningBulkSlug(slug)) return slug;
  return catalogModel(provider, "bulk") as string;
}

// Resolved slug for a role. Exported for tests and telemetry — generation
// call sites should keep using getModel(role).
export function getModelId(role: ModelRole): string {
  const provider = currentProvider();
  if (role === "fast") {
    return envOverride("AI_MODEL_FAST") ?? (catalogModel(provider, "fast") as string);
  }
  if (role === "bulk") {
    const raw =
      envOverride("AI_MODEL_BULK") ?? (catalogModel(provider, "bulk") as string);
    return coerceBulkSlug(raw, provider);
  }
  return (
    envOverride("AI_MODEL_VISION") ?? (catalogModel(provider, "vision") as string)
  );
}

export function getImageModelId(): string | null {
  return envOverride("AI_MODEL_IMAGE") ?? catalogModel(currentProvider(), "image");
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
// `streamText`. Pick "fast" for text + JSON, "bulk" for week-scale JSON,
// and "vision" for any call that includes image inputs.
export function getModel(role: ModelRole): LanguageModel {
  const name = getModelId(role);
  const provider = currentProvider();
  switch (provider) {
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
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unknown AI_PROVIDER: ${_exhaustive}`);
    }
  }
}

// Image generation model, or null if the configured provider doesn't ship
// one. Use with `experimental_generateImage` from the AI SDK.
export function getImageModel(): ImageModel | null {
  const name = getImageModelId();
  if (!name) return null;
  const provider = currentProvider();
  try {
    switch (provider) {
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
      default: {
        const _exhaustive: never = provider;
        throw new Error(`Unknown AI_PROVIDER: ${_exhaustive}`);
      }
    }
  } catch {
    return null;
  }
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
// streams to the client). When search is off we send mode: "off"
// explicitly so a newer Grok default cannot turn search back on.
export function getProviderOptions(opts?: {
  disableSearch?: boolean;
}): ProviderOptions {
  const searchOff =
    process.env.AI_DISABLE_SEARCH === "true" || Boolean(opts?.disableSearch);
  const provider = currentProvider();
  switch (provider) {
    case "xai":
      return {
        xai: {
          searchParameters: searchOff
            ? { mode: "off" }
            : { mode: "auto", returnCitations: true },
        },
      };
    case "openai":
    case "anthropic":
    case "google":
    case "gateway":
      return {};
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unknown AI_PROVIDER: ${_exhaustive}`);
    }
  }
}

// Useful for clients that need to know which provider is wired up
// (telemetry, debug pages, etc).
export function getProviderId(): AiProvider {
  return currentProvider();
}

// Hestia's AI provider abstraction. Picks a provider + model based on env
// vars so the app can ship with Grok by default but swap in OpenAI,
// Anthropic, Google Gemini, or any model accessible via the Vercel AI
// Gateway with a single env change.
//
// Env vars (all optional except the API key for the chosen provider):
//   AI_PROVIDER       — "xai" (default) | "openai" | "anthropic" | "google" | "gateway"
//   AI_MODEL_FAST     — override the fast text/json model
//   AI_MODEL_VISION   — override the vision (image input) model
//
//   XAI_API_KEY              — required when AI_PROVIDER=xai (default)
//   OPENAI_API_KEY           — required when AI_PROVIDER=openai
//   ANTHROPIC_API_KEY        — required when AI_PROVIDER=anthropic
//   GOOGLE_GENERATIVE_AI_API_KEY — required when AI_PROVIDER=google
//   AI_GATEWAY_API_KEY       — required when AI_PROVIDER=gateway
//
// Gateway models use "provider/model-id" strings, e.g. "openai/gpt-4o-mini".

import type { LanguageModel } from "ai";
import { createXai } from "@ai-sdk/xai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { gateway } from "ai";

export type AiProvider = "xai" | "openai" | "anthropic" | "google" | "gateway";
export type ModelRole = "fast" | "vision";

const PROVIDER: AiProvider = (process.env.AI_PROVIDER as AiProvider) || "xai";

// Sensible defaults per provider. Override per role via AI_MODEL_FAST /
// AI_MODEL_VISION. For the gateway, the model strings use "provider/model".
const DEFAULTS: Record<AiProvider, Record<ModelRole, string>> = {
  xai: {
    fast: "grok-4-fast-reasoning",
    vision: "grok-2-vision-1212",
  },
  openai: {
    fast: "gpt-4o-mini",
    vision: "gpt-4o-mini",
  },
  anthropic: {
    fast: "claude-haiku-4-5-20251001",
    vision: "claude-haiku-4-5-20251001",
  },
  google: {
    fast: "gemini-2.5-flash",
    vision: "gemini-2.5-flash",
  },
  gateway: {
    fast: "xai/grok-4-fast-reasoning",
    vision: "xai/grok-2-vision-1212",
  },
};

function modelName(role: ModelRole): string {
  if (role === "fast") return process.env.AI_MODEL_FAST || DEFAULTS[PROVIDER][role];
  return process.env.AI_MODEL_VISION || DEFAULTS[PROVIDER][role];
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

// Returns a LanguageModel ready for `generateObject` / `generateText` /
// `streamText`. Pick "fast" for text + JSON outputs and "vision" for any
// call that includes image inputs.
export function getModel(role: ModelRole): LanguageModel {
  const name = modelName(role);
  switch (PROVIDER) {
    case "xai": {
      if (!xaiClient) {
        xaiClient = createXai({
          apiKey: requireKey("XAI_API_KEY", "xAI API key"),
        });
      }
      return xaiClient(name);
    }
    case "openai": {
      if (!openaiClient) {
        openaiClient = createOpenAI({
          apiKey: requireKey("OPENAI_API_KEY", "OpenAI API key"),
        });
      }
      return openaiClient(name);
    }
    case "anthropic": {
      if (!anthropicClient) {
        anthropicClient = createAnthropic({
          apiKey: requireKey("ANTHROPIC_API_KEY", "Anthropic API key"),
        });
      }
      return anthropicClient(name);
    }
    case "google": {
      if (!googleClient) {
        googleClient = createGoogleGenerativeAI({
          apiKey: requireKey(
            "GOOGLE_GENERATIVE_AI_API_KEY",
            "Google Generative AI API key",
          ),
        });
      }
      return googleClient(name);
    }
    case "gateway": {
      // Vercel AI Gateway picks up AI_GATEWAY_API_KEY automatically.
      requireKey("AI_GATEWAY_API_KEY", "Vercel AI Gateway API key");
      return gateway(name);
    }
    default: {
      throw new Error(`Unknown AI_PROVIDER: ${PROVIDER}`);
    }
  }
}

// Useful for clients that need to know which provider is wired up
// (telemetry, debug pages, etc).
export function getProviderId(): AiProvider {
  return PROVIDER;
}

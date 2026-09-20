import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getImageModelId,
  getModelId,
  getProviderId,
  getProviderOptions,
} from "@/lib/ai/provider";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("model role catalog", () => {
  it("resolves current xAI defaults per role", () => {
    vi.stubEnv("AI_PROVIDER", "xai");
    vi.stubEnv("AI_MODEL_FAST", "");
    vi.stubEnv("AI_MODEL_BULK", "");
    vi.stubEnv("AI_MODEL_VISION", "");
    vi.stubEnv("AI_MODEL_IMAGE", "");

    expect(getProviderId()).toBe("xai");
    expect(getModelId("fast")).toBe("grok-4.3");
    expect(getModelId("bulk")).toBe("grok-4.20-0309-non-reasoning");
    expect(getModelId("vision")).toBe("grok-4.3");
    expect(getImageModelId()).toBe("grok-imagine-image-2.0");
  });

  it("does not put week generation on grok-4.6", () => {
    vi.stubEnv("AI_PROVIDER", "xai");
    vi.stubEnv("AI_MODEL_BULK", "");
    expect(getModelId("bulk")).not.toMatch(/grok-4\.6/);
  });

  it("keeps bulk independent of AI_MODEL_FAST", () => {
    vi.stubEnv("AI_PROVIDER", "xai");
    vi.stubEnv("AI_MODEL_FAST", "grok-4.6");
    vi.stubEnv("AI_MODEL_BULK", "");

    expect(getModelId("fast")).toBe("grok-4.6");
    expect(getModelId("bulk")).toBe("grok-4.20-0309-non-reasoning");
  });

  it("honours per-role env overrides", () => {
    vi.stubEnv("AI_PROVIDER", "xai");
    vi.stubEnv("AI_MODEL_BULK", "grok-4.3");
    vi.stubEnv("AI_MODEL_VISION", "grok-4.3");
    vi.stubEnv("AI_MODEL_IMAGE", "grok-imagine-image");

    expect(getModelId("bulk")).toBe("grok-4.3");
    expect(getModelId("vision")).toBe("grok-4.3");
    expect(getImageModelId()).toBe("grok-imagine-image");
  });

  it("uses gateway-prefixed slugs when AI_PROVIDER=gateway", () => {
    vi.stubEnv("AI_PROVIDER", "gateway");
    vi.stubEnv("AI_MODEL_FAST", "");
    vi.stubEnv("AI_MODEL_BULK", "");
    vi.stubEnv("AI_MODEL_VISION", "");
    vi.stubEnv("AI_MODEL_IMAGE", "");

    expect(getModelId("fast")).toBe("xai/grok-4.3");
    expect(getModelId("bulk")).toBe("xai/grok-4.20-0309-non-reasoning");
    expect(getImageModelId()).toBe("xai/grok-imagine-image-2.0");
  });
});

describe("getProviderOptions", () => {
  it("sends xAI search mode off when disableSearch is set", () => {
    vi.stubEnv("AI_PROVIDER", "xai");
    expect(getProviderOptions({ disableSearch: true })).toEqual({
      xai: { searchParameters: { mode: "off" } },
    });
  });

  it("keeps xAI auto search when search is enabled", () => {
    vi.stubEnv("AI_PROVIDER", "xai");
    vi.stubEnv("AI_DISABLE_SEARCH", "");
    expect(getProviderOptions()).toEqual({
      xai: { searchParameters: { mode: "auto", returnCitations: true } },
    });
  });
});

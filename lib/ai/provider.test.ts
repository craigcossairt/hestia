import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getImageModelId,
  getModelId,
  getProviderId,
  getProviderOptions,
  isReasoningBulkSlug,
  isRetiredBulkSlug,
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
    expect(getModelId("bulk")).toBe("grok-4.3");
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
    expect(getModelId("bulk")).toBe("grok-4.3");
  });

  it("honours per-role env overrides that are still live", () => {
    vi.stubEnv("AI_PROVIDER", "xai");
    vi.stubEnv("AI_MODEL_BULK", "grok-3");
    vi.stubEnv("AI_MODEL_VISION", "grok-4.3");
    vi.stubEnv("AI_MODEL_IMAGE", "grok-imagine-image");

    expect(getModelId("bulk")).toBe("grok-3");
    expect(getModelId("vision")).toBe("grok-4.3");
    expect(getImageModelId()).toBe("grok-imagine-image");
  });

  it("remaps the grok-4.20 non-reasoning family onto grok-4.3", () => {
    vi.stubEnv("AI_PROVIDER", "xai");
    vi.stubEnv("AI_MODEL_BULK", "grok-4.20-non-reasoning");
    expect(getModelId("bulk")).toBe("grok-4.3");
    vi.stubEnv("AI_MODEL_BULK", "grok-4.20-0309-non-reasoning");
    expect(getModelId("bulk")).toBe("grok-4.3");
    vi.stubEnv("AI_PROVIDER", "gateway");
    vi.stubEnv("AI_MODEL_BULK", "xai/grok-4.20-non-reasoning");
    expect(getModelId("bulk")).toBe("spacexai/grok-4.3");
  });

  it("remaps retired 4.1-fast / 4-fast non-reasoning env onto grok-4.3", () => {
    vi.stubEnv("AI_PROVIDER", "xai");
    vi.stubEnv("AI_MODEL_BULK", "grok-4.1-fast-non-reasoning");
    expect(getModelId("bulk")).toBe("grok-4.3");
    vi.stubEnv("AI_MODEL_BULK", "grok-4-1-fast-non-reasoning");
    expect(getModelId("bulk")).toBe("grok-4.3");
    vi.stubEnv("AI_MODEL_BULK", "grok-4-fast-non-reasoning");
    expect(getModelId("bulk")).toBe("grok-4.3");
  });

  it("remaps reasoning env overrides on bulk so week gen cannot stall on grok-4.6", () => {
    vi.stubEnv("AI_PROVIDER", "xai");
    vi.stubEnv("AI_MODEL_BULK", "grok-4-fast-reasoning");
    expect(getModelId("bulk")).toBe("grok-4.3");
    vi.stubEnv("AI_MODEL_BULK", "grok-4.6");
    expect(getModelId("bulk")).toBe("grok-4.3");
    vi.stubEnv("AI_MODEL_BULK", "grok-4.3");
    expect(getModelId("bulk")).toBe("grok-4.3");
  });

  it("uses gateway-prefixed slugs when AI_PROVIDER=gateway", () => {
    vi.stubEnv("AI_PROVIDER", "gateway");
    vi.stubEnv("AI_MODEL_FAST", "");
    vi.stubEnv("AI_MODEL_BULK", "");
    vi.stubEnv("AI_MODEL_VISION", "");
    vi.stubEnv("AI_MODEL_IMAGE", "");

    expect(getModelId("fast")).toBe("xai/grok-4.3");
    expect(getModelId("bulk")).toBe("spacexai/grok-4.3");
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

  it("adds reasoningEffort none on the xAI bulk path without dropping search-off", () => {
    vi.stubEnv("AI_PROVIDER", "xai");
    expect(
      getProviderOptions({ disableSearch: true, reasoningEffort: "none" }),
    ).toEqual({
      xai: {
        searchParameters: { mode: "off" },
        reasoningEffort: "none",
      },
    });
  });

  it("forwards reasoningEffort on gateway so spacexai/grok-4.3 can skip thinking", () => {
    vi.stubEnv("AI_PROVIDER", "gateway");
    expect(
      getProviderOptions({ disableSearch: true, reasoningEffort: "none" }),
    ).toEqual({
      xai: { reasoningEffort: "none" },
    });
  });

  it("does not send reasoningEffort on recipe-style search-off calls", () => {
    vi.stubEnv("AI_PROVIDER", "xai");
    expect(getProviderOptions({ disableSearch: true })).toEqual({
      xai: { searchParameters: { mode: "off" } },
    });
  });
});

describe("isReasoningBulkSlug", () => {
  it("treats grok-4.3 / grok-4.6 as reasoning, not the 4.1-fast non-reasoning slug", () => {
    expect(isReasoningBulkSlug("grok-4.3")).toBe(true);
    expect(isReasoningBulkSlug("grok-4.6")).toBe(true);
    expect(isReasoningBulkSlug("grok-4.1-fast-non-reasoning")).toBe(false);
    expect(isReasoningBulkSlug("grok-4.20-non-reasoning")).toBe(false);
    expect(isReasoningBulkSlug("xai/grok-4-fast-reasoning")).toBe(true);
  });
});

describe("isRetiredBulkSlug", () => {
  it("matches the grok-4.20 non-reasoning family, including gateway prefixes", () => {
    expect(isRetiredBulkSlug("grok-4.20-non-reasoning")).toBe(true);
    expect(isRetiredBulkSlug("grok-4.20-0309-non-reasoning")).toBe(true);
    expect(isRetiredBulkSlug("xai/grok-4.20-non-reasoning")).toBe(true);
    expect(isRetiredBulkSlug("grok-4.20-0309-reasoning")).toBe(false);
  });

  it("matches retired 4.1-fast / 4-fast non-reasoning ids", () => {
    expect(isRetiredBulkSlug("grok-4.1-fast-non-reasoning")).toBe(true);
    expect(isRetiredBulkSlug("grok-4-1-fast-non-reasoning")).toBe(true);
    expect(isRetiredBulkSlug("grok-4-fast-non-reasoning")).toBe(true);
    expect(isRetiredBulkSlug("spacexai/grok-4.1-fast-non-reasoning")).toBe(true);
    expect(isRetiredBulkSlug("grok-4.3")).toBe(false);
  });
});

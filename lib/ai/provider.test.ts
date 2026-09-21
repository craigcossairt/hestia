import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getImageModelId,
  getModel,
  getModelId,
  getProviderId,
  getProviderOptions,
  isReasoningBulkSlug,
  isRetiredBulkSlug,
} from "@/lib/ai/provider";

afterEach(() => {
  vi.unstubAllEnvs();
});

function stubXai() {
  vi.stubEnv("AI_PROVIDER", "xai");
  vi.stubEnv("XAI_API_KEY", "xai-test");
  vi.stubEnv("AI_XAI_DIRECT", "");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("AI_GATEWAY_API_KEY", "");
  vi.stubEnv("VERCEL_OIDC_TOKEN", "");
  vi.stubEnv("AI_MODEL_FAST", "");
  vi.stubEnv("AI_MODEL_BULK", "");
  vi.stubEnv("AI_MODEL_VISION", "");
  vi.stubEnv("AI_MODEL_IMAGE", "");
}

function stubGateway() {
  vi.stubEnv("AI_PROVIDER", "gateway");
  vi.stubEnv("XAI_API_KEY", "");
  vi.stubEnv("AI_XAI_DIRECT", "");
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("AI_GATEWAY_API_KEY", "vck_test");
  vi.stubEnv("AI_MODEL_FAST", "");
  vi.stubEnv("AI_MODEL_BULK", "");
  vi.stubEnv("AI_MODEL_VISION", "");
  vi.stubEnv("AI_MODEL_IMAGE", "");
}

describe("model role catalog", () => {
  it("resolves current xAI-direct defaults per role", () => {
    stubXai();

    expect(getProviderId()).toBe("xai");
    expect(getModelId("fast")).toBe("grok-4.3");
    expect(getModelId("bulk")).toBe("grok-4.3");
    expect(getModelId("vision")).toBe("grok-4.3");
    expect(getImageModelId()).toBe("grok-imagine-image-2.0");
  });

  it("does not put week generation on grok-4.6", () => {
    stubXai();
    expect(getModelId("bulk")).not.toMatch(/grok-4\.6/);
  });

  it("keeps bulk independent of AI_MODEL_FAST", () => {
    stubXai();
    vi.stubEnv("AI_MODEL_FAST", "grok-4.6");

    expect(getModelId("fast")).toBe("grok-4.6");
    expect(getModelId("bulk")).toBe("grok-4.3");
  });

  it("honours per-role env overrides that are still live", () => {
    stubXai();
    vi.stubEnv("AI_MODEL_BULK", "grok-3");
    vi.stubEnv("AI_MODEL_VISION", "grok-4.3");
    vi.stubEnv("AI_MODEL_IMAGE", "grok-imagine-image");

    expect(getModelId("bulk")).toBe("grok-3");
    expect(getModelId("vision")).toBe("grok-4.3");
    expect(getImageModelId()).toBe("grok-imagine-image");
  });

  it("remaps the grok-4.20 non-reasoning family onto grok-4.3", () => {
    stubXai();
    vi.stubEnv("AI_MODEL_BULK", "grok-4.20-non-reasoning");
    expect(getModelId("bulk")).toBe("grok-4.3");
    vi.stubEnv("AI_MODEL_BULK", "grok-4.20-0309-non-reasoning");
    expect(getModelId("bulk")).toBe("grok-4.3");
    stubGateway();
    vi.stubEnv("AI_MODEL_BULK", "xai/grok-4.20-non-reasoning");
    expect(getModelId("bulk")).toBe("spacexai/grok-4.3");
  });

  it("remaps grok-4.6 and retired 4.1-fast env onto grok-4.3", () => {
    stubXai();
    vi.stubEnv("AI_MODEL_BULK", "grok-4.6");
    expect(getModelId("bulk")).toBe("grok-4.3");
    vi.stubEnv("AI_MODEL_BULK", "grok-4.1-fast-non-reasoning");
    expect(getModelId("bulk")).toBe("grok-4.3");
    vi.stubEnv("AI_MODEL_BULK", "grok-4-fast-reasoning");
    expect(getModelId("bulk")).toBe("grok-4.3");
  });

  it("uses spacexai/ Gateway ids, not xai/", () => {
    stubGateway();

    expect(getProviderId()).toBe("gateway");
    expect(getModelId("fast")).toBe("spacexai/grok-4.3");
    expect(getModelId("bulk")).toBe("spacexai/grok-4.3");
    expect(getImageModelId()).toBe("spacexai/grok-imagine-image-2.0");
  });

  it("strips leftover spacexai/ prefixes on direct xAI", () => {
    stubXai();
    vi.stubEnv("AI_MODEL_FAST", "spacexai/grok-4.3");
    expect(getModelId("fast")).toBe("grok-4.3");
  });

  it("rewrites leftover xai/ env prefixes to spacexai/ on Gateway", () => {
    stubGateway();
    vi.stubEnv("AI_MODEL_FAST", "xai/grok-4.3");
    expect(getModelId("fast")).toBe("spacexai/grok-4.3");
  });
});

describe("provider selection", () => {
  it("stays on xAI with XAI_API_KEY even on Vercel", () => {
    vi.stubEnv("AI_PROVIDER", "xai");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("AI_GATEWAY_API_KEY", "vck_test");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "oidc-test");
    expect(getProviderId()).toBe("xai");
    expect(getModelId("bulk")).toBe("grok-4.3");
  });

  it("defaults to xAI when AI_PROVIDER is unset, including on Vercel", () => {
    vi.stubEnv("AI_PROVIDER", "");
    vi.stubEnv("XAI_API_KEY", "xai-test");
    vi.stubEnv("VERCEL", "1");
    expect(getProviderId()).toBe("xai");
    expect(getModelId("bulk")).toBe("grok-4.3");
  });

  it("uses the Responses API on direct xAI", () => {
    stubXai();
    const model = getModel("bulk");
    expect(typeof model).not.toBe("string");
    if (typeof model === "string") return;
    expect(model.provider).toBe("xai.responses");
  });

  it("uses Gateway only when AI_PROVIDER=gateway and XAI_API_KEY is unset", () => {
    stubGateway();
    expect(getProviderId()).toBe("gateway");
    expect(getModelId("bulk")).toBe("spacexai/grok-4.3");
  });

  it("ignores leftover AI_PROVIDER=gateway when XAI_API_KEY is set", () => {
    vi.stubEnv("AI_PROVIDER", "gateway");
    vi.stubEnv("XAI_API_KEY", "xai-test");
    vi.stubEnv("VERCEL", "1");
    expect(getProviderId()).toBe("xai");
    expect(getModelId("bulk")).toBe("grok-4.3");
  });
});

describe("getProviderOptions", () => {
  it("does not send deprecated searchParameters on direct xAI", () => {
    stubXai();
    expect(getProviderOptions({ disableSearch: true })).toEqual({});
  });

  it("forwards reasoningEffort none on direct xAI without searchParameters", () => {
    stubXai();
    expect(
      getProviderOptions({
        disableSearch: true,
        reasoningEffort: "none",
        modelId: "grok-4.3",
      }),
    ).toEqual({
      xai: { reasoningEffort: "none" },
    });
  });

  it("forwards search-off and reasoningEffort none on Gateway", () => {
    stubGateway();
    expect(
      getProviderOptions({
        disableSearch: true,
        reasoningEffort: "none",
        modelId: "spacexai/grok-4.3",
      }),
    ).toEqual({
      xai: {
        searchParameters: { mode: "off" },
        reasoningEffort: "none",
      },
      gateway: { only: ["xai"] },
    });
  });

  it("does not pin gateway.only for non-SpaceXAI Gateway overrides", () => {
    stubGateway();
    expect(
      getProviderOptions({
        disableSearch: true,
        modelId: "openai/gpt-4o-mini",
      }),
    ).toEqual({
      xai: { searchParameters: { mode: "off" } },
    });
  });
});

describe("isReasoningBulkSlug", () => {
  it("treats grok-4.3 / grok-4.6 as reasoning", () => {
    expect(isReasoningBulkSlug("grok-4.3")).toBe(true);
    expect(isReasoningBulkSlug("grok-4.6")).toBe(true);
    expect(isReasoningBulkSlug("grok-4.1-fast-non-reasoning")).toBe(false);
    expect(isReasoningBulkSlug("spacexai/grok-4-fast-reasoning")).toBe(true);
  });
});

describe("isRetiredBulkSlug", () => {
  it("matches the grok-4.20 non-reasoning family and 4.1-fast ids", () => {
    expect(isRetiredBulkSlug("grok-4.20-non-reasoning")).toBe(true);
    expect(isRetiredBulkSlug("xai/grok-4.20-non-reasoning")).toBe(true);
    expect(isRetiredBulkSlug("grok-4.1-fast-non-reasoning")).toBe(true);
    expect(isRetiredBulkSlug("grok-4.3")).toBe(false);
    expect(isRetiredBulkSlug("grok-4.6")).toBe(false);
  });
});

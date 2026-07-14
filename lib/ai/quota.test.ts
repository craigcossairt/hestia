import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  _getDailyLimitForTests,
  _shouldFailClosedForTests,
  assertAiQuota,
  checkAiQuota,
} from "@/lib/ai/quota";

function mockSupabase(rpcImpl: () => { data: unknown; error: unknown }) {
  return {
    rpc: vi.fn(async () => rpcImpl()),
  } as unknown as SupabaseClient;
}

describe("quota helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("honours AI_QUOTA_FAIL_CLOSED overrides", () => {
    vi.stubEnv("AI_QUOTA_FAIL_CLOSED", "true");
    expect(_shouldFailClosedForTests()).toBe(true);
    vi.stubEnv("AI_QUOTA_FAIL_CLOSED", "false");
    expect(_shouldFailClosedForTests()).toBe(false);
  });

  it("defaults to fail-closed in production", () => {
    vi.stubEnv("AI_QUOTA_FAIL_CLOSED", "");
    delete process.env.AI_QUOTA_FAIL_CLOSED;
    vi.stubEnv("NODE_ENV", "production");
    expect(_shouldFailClosedForTests()).toBe(true);
    vi.stubEnv("NODE_ENV", "development");
    expect(_shouldFailClosedForTests()).toBe(false);
  });

  it("parses AI_DAILY_LIMIT_PER_USER", () => {
    vi.stubEnv("AI_DAILY_LIMIT_PER_USER", "25");
    expect(_getDailyLimitForTests()).toBe(25);
  });

  it("fails closed on RPC error in production", async () => {
    vi.stubEnv("AI_QUOTA_FAIL_CLOSED", "true");
    vi.stubEnv("AI_DAILY_LIMIT_PER_USER", "100");
    const supabase = mockSupabase(() => ({
      data: null,
      error: { message: "boom" },
    }));
    const result = await checkAiQuota(supabase, "user-1");
    expect(result.ok).toBe(false);
    expect(result.response?.status).toBe(503);
  });

  it("fails open on RPC error when explicitly configured", async () => {
    vi.stubEnv("AI_QUOTA_FAIL_CLOSED", "false");
    const supabase = mockSupabase(() => ({
      data: null,
      error: { message: "boom" },
    }));
    const result = await checkAiQuota(supabase, "user-1");
    expect(result.ok).toBe(true);
  });

  it("denies when used exceeds limit", async () => {
    vi.stubEnv("AI_DAILY_LIMIT_PER_USER", "10");
    const supabase = mockSupabase(() => ({ data: 11, error: null }));
    const result = await checkAiQuota(supabase, "user-1");
    expect(result.ok).toBe(false);
    expect(result.used).toBe(11);
    expect(result.limit).toBe(10);
    expect(result.response?.status).toBe(429);
  });

  it("allows when used equals the limit", async () => {
    vi.stubEnv("AI_DAILY_LIMIT_PER_USER", "10");
    const supabase = mockSupabase(() => ({ data: 10, error: null }));
    const result = await checkAiQuota(supabase, "user-1");
    expect(result.ok).toBe(true);
    expect(result.used).toBe(10);
  });

  it("maps assertAiQuota errors without a Response", async () => {
    vi.stubEnv("AI_QUOTA_FAIL_CLOSED", "true");
    const supabase = mockSupabase(() => ({
      data: null,
      error: { message: "boom" },
    }));
    const result = await assertAiQuota(supabase, "user-1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/unavailable/i);
    }
  });
});

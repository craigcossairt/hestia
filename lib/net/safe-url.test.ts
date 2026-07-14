import { describe, expect, it } from "vitest";
import {
  assertPublicHttpUrl,
  assertSafeFetchUrl,
  normalizeHostname,
  sanitizeReturnPath,
} from "@/lib/net/safe-url";

describe("normalizeHostname", () => {
  it("strips IPv6 brackets", () => {
    expect(normalizeHostname("[::1]")).toBe("::1");
    expect(normalizeHostname("[fd00::1]")).toBe("fd00::1");
  });

  it("leaves plain hosts alone", () => {
    expect(normalizeHostname("example.com")).toBe("example.com");
    expect(normalizeHostname("127.0.0.1")).toBe("127.0.0.1");
  });
});

describe("assertPublicHttpUrl", () => {
  it("accepts public https URLs", () => {
    const r = assertPublicHttpUrl("https://example.com/recipe");
    expect(r.ok).toBe(true);
  });

  it("rejects localhost and private IPs", () => {
    expect(assertPublicHttpUrl("http://127.0.0.1/").ok).toBe(false);
    expect(assertPublicHttpUrl("http://10.0.0.5/x").ok).toBe(false);
    expect(assertPublicHttpUrl("http://192.168.1.1/").ok).toBe(false);
    expect(assertPublicHttpUrl("http://169.254.169.254/latest").ok).toBe(
      false,
    );
    expect(assertPublicHttpUrl("http://localhost/").ok).toBe(false);
  });

  it("rejects bracketed private IPv6 literals", () => {
    expect(assertPublicHttpUrl("http://[::1]/").ok).toBe(false);
    expect(assertPublicHttpUrl("http://[fd00::1]/").ok).toBe(false);
    expect(assertPublicHttpUrl("http://[fe80::1]/").ok).toBe(false);
  });

  it("rejects non-http schemes and credentials", () => {
    expect(assertPublicHttpUrl("file:///etc/passwd").ok).toBe(false);
    expect(assertPublicHttpUrl("https://user:pass@example.com/").ok).toBe(
      false,
    );
  });
});

describe("assertSafeFetchUrl", () => {
  it("rejects private IPs after the DNS/IP check path", async () => {
    const r = await assertSafeFetchUrl("http://127.0.0.1/");
    expect(r.ok).toBe(false);
  });

  it("rejects bracketed loopback before DNS", async () => {
    const r = await assertSafeFetchUrl("http://[::1]/");
    expect(r.ok).toBe(false);
  });

  it("accepts a public hostname that resolves publicly", async () => {
    const r = await assertSafeFetchUrl("https://example.com/");
    expect(r.ok).toBe(true);
  });
});

describe("sanitizeReturnPath", () => {
  it("allows relative same-origin paths", () => {
    expect(sanitizeReturnPath("/shop")).toBe("/shop");
    expect(sanitizeReturnPath("/me?tab=kroger")).toBe("/me?tab=kroger");
  });

  it("blocks open redirects", () => {
    expect(sanitizeReturnPath("https://evil.example")).toBe("/shop");
    expect(sanitizeReturnPath("//evil.example")).toBe("/shop");
    expect(sanitizeReturnPath("\\evil")).toBe("/shop");
    expect(sanitizeReturnPath(null)).toBe("/shop");
  });
});

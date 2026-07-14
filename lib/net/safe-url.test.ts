import { describe, expect, it } from "vitest";
import {
  assertPublicHttpUrl,
  sanitizeReturnPath,
} from "@/lib/net/safe-url";

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

  it("rejects non-http schemes and credentials", () => {
    expect(assertPublicHttpUrl("file:///etc/passwd").ok).toBe(false);
    expect(assertPublicHttpUrl("https://user:pass@example.com/").ok).toBe(
      false,
    );
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

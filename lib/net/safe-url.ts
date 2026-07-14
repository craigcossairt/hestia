// SSRF guard for server-side fetches of user-supplied URLs.
// Blocks private / link-local / metadata ranges and non-http(s) schemes.

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
]);

function isPrivateOrReservedIpv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true; // unparseable → treat as blocked
  }
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  return false;
}

function isPrivateOrReservedIp(ip: string): boolean {
  if (isIP(ip) === 4) return isPrivateOrReservedIpv4(ip);

  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA
  if (lower.startsWith("fe80")) return true; // link-local
  if (lower.startsWith("::ffff:")) {
    const mapped = lower.slice("::ffff:".length);
    if (isIP(mapped) === 4) return isPrivateOrReservedIpv4(mapped);
  }
  return false;
}

export type SafeUrlResult =
  | { ok: true; url: URL }
  | { ok: false; error: string };

/** Parse + scheme/host checks (no DNS). Use before any fetch of user URLs. */
export function assertPublicHttpUrl(raw: string): SafeUrlResult {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "Invalid URL." };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Only http(s) URLs are allowed." };
  }

  // Prefer HTTPS for outbound fetches; allow http only for non-local hosts
  // that already passed IP checks (some recipe sites still redirect http→https).
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || BLOCKED_HOSTNAMES.has(host)) {
    return { ok: false, error: "That host is not allowed." };
  }

  if (host === "0.0.0.0" || host.endsWith(".localhost") || host.endsWith(".local")) {
    return { ok: false, error: "That host is not allowed." };
  }

  const ipKind = isIP(host);
  if (ipKind && isPrivateOrReservedIp(host)) {
    return { ok: false, error: "That host is not allowed." };
  }

  // Block credentialed URLs and obvious open-proxy forms.
  if (url.username || url.password) {
    return { ok: false, error: "URLs with credentials are not allowed." };
  }

  return { ok: true, url };
}

/** Resolve DNS and reject if any address is private/reserved. */
export async function assertResolvesToPublicIp(url: URL): Promise<SafeUrlResult> {
  const host = url.hostname;
  if (isIP(host)) {
    return isPrivateOrReservedIp(host)
      ? { ok: false, error: "That host is not allowed." }
      : { ok: true, url };
  }

  try {
    const records = await lookup(host, { all: true, verbatim: true });
    if (!records.length) {
      return { ok: false, error: "Couldn't resolve that host." };
    }
    for (const rec of records) {
      if (isPrivateOrReservedIp(rec.address)) {
        return { ok: false, error: "That host is not allowed." };
      }
    }
  } catch {
    return { ok: false, error: "Couldn't resolve that host." };
  }

  return { ok: true, url };
}

export async function assertSafeFetchUrl(raw: string): Promise<SafeUrlResult> {
  const parsed = assertPublicHttpUrl(raw);
  if (!parsed.ok) return parsed;
  return assertResolvesToPublicIp(parsed.url);
}

/** Same-origin relative path for OAuth return cookies (blocks open redirects). */
export function sanitizeReturnPath(
  raw: string | null | undefined,
  fallback = "/shop",
): string {
  if (!raw) return fallback;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/")) return fallback;
  if (trimmed.startsWith("//")) return fallback;
  if (trimmed.includes("://")) return fallback;
  if (trimmed.includes("\\")) return fallback;
  // Disallow control chars / newlines that can break Location headers.
  if (/[\0-\x1f\x7f]/.test(trimmed)) return fallback;
  return trimmed;
}

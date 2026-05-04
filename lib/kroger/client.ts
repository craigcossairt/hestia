// Kroger Public API client.
//
// Auth: OAuth2 client_credentials. Tokens last 30 minutes, so we cache
// them in process memory. Two scopes are used:
//   - locations: no scope required (public data)
//   - products: scope=product.compact (compact response with pricing)
//
// Docs: https://developer.kroger.com/reference/api/public/

const KROGER_BASE = "https://api.kroger.com/v1";
const TOKEN_URL = `${KROGER_BASE}/connect/oauth2/token`;

// Tokens by scope. Empty string = no scope. Each entry caches the
// resolved access_token + its absolute expiry (epoch ms).
const tokenCache = new Map<string, { token: string; expiresAt: number }>();
// Coalesce concurrent token requests for the same scope so we don't
// burn duplicate auth round-trips when /shop fans out 30 product
// queries in parallel.
const tokenInflight = new Map<string, Promise<string | null>>();

function getCreds(): { id: string; secret: string } | null {
  const id = process.env.KROGER_CLIENT_ID?.trim();
  const secret = process.env.KROGER_CLIENT_SECRET?.trim();
  if (!id || !secret) return null;
  return { id, secret };
}

export function isKrogerConfigured(): boolean {
  return getCreds() !== null;
}

async function fetchToken(scope: string): Promise<string | null> {
  const creds = getCreds();
  if (!creds) return null;
  const basic = Buffer.from(`${creds.id}:${creds.secret}`).toString("base64");
  const body = new URLSearchParams({ grant_type: "client_credentials" });
  if (scope) body.set("scope", scope);

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) {
    // Don't cache failures.
    return null;
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) return null;
  // expires_in is seconds. Refresh 60s early so a long request doesn't
  // straddle expiry.
  const ttlMs = ((json.expires_in ?? 1800) - 60) * 1000;
  tokenCache.set(scope, {
    token: json.access_token,
    expiresAt: Date.now() + ttlMs,
  });
  return json.access_token;
}

async function getToken(scope: string): Promise<string | null> {
  const cached = tokenCache.get(scope);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const inflight = tokenInflight.get(scope);
  if (inflight) return inflight;

  const promise = fetchToken(scope).finally(() => {
    tokenInflight.delete(scope);
  });
  tokenInflight.set(scope, promise);
  return promise;
}

// Authenticated fetch helper. Returns null on auth/network failure so
// callers can degrade gracefully (a missing Kroger price isn't a fatal
// error — the AI estimate still shows).
export async function krogerFetch<T>(args: {
  path: string; // e.g. "/locations" — leading slash, no host
  query?: Record<string, string | number | undefined>;
  scope: string; // "" for public endpoints, "product.compact" for products
}): Promise<T | null> {
  const token = await getToken(args.scope);
  if (!token) return null;

  const url = new URL(`${KROGER_BASE}${args.path}`);
  if (args.query) {
    for (const [k, v] of Object.entries(args.query)) {
      if (v == null) continue;
      url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) {
    // 401 is most likely an expired token race — invalidate and retry once.
    if (res.status === 401) {
      tokenCache.delete(args.scope);
      const fresh = await getToken(args.scope);
      if (!fresh) return null;
      const retry = await fetch(url, {
        headers: {
          Authorization: `Bearer ${fresh}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(8_000),
      });
      if (!retry.ok) return null;
      return (await retry.json()) as T;
    }
    return null;
  }
  return (await res.json()) as T;
}

// Test-only seam.
export function _resetKrogerCache(): void {
  tokenCache.clear();
  tokenInflight.clear();
}

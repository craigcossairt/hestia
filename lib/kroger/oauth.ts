// Kroger user-level OAuth (Authorization Code grant).
//
// Phase 1 (lib/kroger/client.ts) uses client_credentials — server-only,
// no user. Phase 2 needs the actual Kroger shopper to consent so we
// can write to their cart. That's the standard auth-code dance:
//   1. Send the user to Kroger's /authorize URL with our client_id and
//      a state token (CSRF).
//   2. Kroger redirects back to /api/kroger/oauth/callback?code=...
//      after consent.
//   3. We exchange the code for { access_token, refresh_token } and
//      persist them on the user's profile row.
//   4. When making cart calls, ensureValidUserToken() refreshes the
//      access token if it's within 60s of expiry (refresh tokens last
//      ~6 months).

import type { SupabaseClient } from "@supabase/supabase-js";

const KROGER_BASE = "https://api.kroger.com/v1";
const AUTHORIZE_URL = `${KROGER_BASE}/connect/oauth2/authorize`;
const TOKEN_URL = `${KROGER_BASE}/connect/oauth2/token`;

// Scopes our app needs:
//   - cart.basic:write — add items to the shopper's cart
//   - profile.compact — pull the shopper's basic profile so we can
//     display "connected as …"
export const REQUIRED_SCOPES = "cart.basic:write profile.compact";

interface KrogerCreds {
  id: string;
  secret: string;
}

function getCreds(): KrogerCreds | null {
  const id = process.env.KROGER_CLIENT_ID?.trim();
  const secret = process.env.KROGER_CLIENT_SECRET?.trim();
  if (!id || !secret) return null;
  return { id, secret };
}

// Build the absolute redirect URI for the callback. Derived from the
// incoming request's origin so it works on whatever URL the app is
// actually deployed to (vs trusting NEXT_PUBLIC_APP_URL to be set
// correctly in every environment). Kroger requires the URI we send
// during /authorize and /token exchange to match each other AND to
// match one of the Redirect URIs registered in the Kroger app config.
//
// Vercel's edge proxy puts the canonical external host into
// req.nextUrl.origin, so this is correct in production, preview
// deployments, and local dev.
export function getRedirectUriFromRequest(req: { nextUrl: URL }): string {
  return `${req.nextUrl.origin}/api/kroger/oauth/callback`;
}

// Build the URL we send the user to to start the consent flow. The
// caller passes the redirect URI it intends to use so we can echo the
// exact same value back during /token exchange — Kroger validates
// they match.
export function buildAuthorizeUrl(state: string, redirectUri: string): string | null {
  const creds = getCreds();
  if (!creds) return null;
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", creds.id);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", REQUIRED_SCOPES);
  url.searchParams.set("state", state);
  return url.toString();
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number; // seconds
  token_type: string;
  scope?: string;
}

async function postToken(body: URLSearchParams): Promise<TokenResponse | null> {
  const creds = getCreds();
  if (!creds) return null;
  const basic = Buffer.from(`${creds.id}:${creds.secret}`).toString("base64");
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
  if (!res.ok) return null;
  return (await res.json()) as TokenResponse;
}

// Step 3: exchange the authorisation code for an initial token pair.
// `redirectUri` MUST be byte-identical to the one passed in during
// /authorize — Kroger rejects mismatches with "invalid_grant".
export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
): Promise<TokenResponse | null> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  return postToken(body);
}

async function refreshTokens(refreshToken: string): Promise<TokenResponse | null> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  return postToken(body);
}

// Persist a fresh token pair onto the user's profile. Used by both the
// initial callback (with refresh_token from auth-code grant) and by
// ensureValidUserToken() after a refresh.
export async function persistUserTokens(args: {
  supabase: SupabaseClient;
  userId: string;
  tokens: TokenResponse;
  krogerUserId?: string | null;
}): Promise<void> {
  const expiresAt = new Date(Date.now() + (args.tokens.expires_in - 60) * 1000);
  const patch: Record<string, unknown> = {
    kroger_access_token: args.tokens.access_token,
    kroger_token_expires_at: expiresAt.toISOString(),
    updated_at: new Date().toISOString(),
  };
  // Refresh-token responses don't always include a new refresh_token —
  // when they do, rotate; when they don't, keep the old one in place.
  if (args.tokens.refresh_token) {
    patch.kroger_refresh_token = args.tokens.refresh_token;
  }
  if (args.krogerUserId !== undefined) {
    patch.kroger_user_id = args.krogerUserId;
  }
  await args.supabase.from("profiles").update(patch).eq("id", args.userId);
}

export interface UserKrogerSession {
  accessToken: string;
  expiresAt: Date;
  refreshToken: string | null;
  krogerUserId: string | null;
}

// Read the user's stored Kroger session from the profile.
export async function getUserKrogerSession(args: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<UserKrogerSession | null> {
  const { data } = await args.supabase
    .from("profiles")
    .select(
      "kroger_access_token, kroger_refresh_token, kroger_token_expires_at, kroger_user_id",
    )
    .eq("id", args.userId)
    .maybeSingle();
  if (!data?.kroger_access_token || !data.kroger_token_expires_at) return null;
  return {
    accessToken: data.kroger_access_token as string,
    expiresAt: new Date(data.kroger_token_expires_at as string),
    refreshToken: (data.kroger_refresh_token as string | null) ?? null,
    krogerUserId: (data.kroger_user_id as string | null) ?? null,
  };
}

// Returns a valid access token, refreshing if needed. Returns null if
// the user has never connected Kroger or the refresh has expired (in
// which case the user must re-consent).
export async function ensureValidUserToken(args: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<string | null> {
  const session = await getUserKrogerSession(args);
  if (!session) return null;
  // Buffer the expiry by 30s so a long request doesn't straddle the
  // boundary.
  if (session.expiresAt.getTime() - Date.now() > 30_000) {
    return session.accessToken;
  }
  if (!session.refreshToken) return null;
  const refreshed = await refreshTokens(session.refreshToken);
  if (!refreshed) return null;
  await persistUserTokens({
    supabase: args.supabase,
    userId: args.userId,
    tokens: refreshed,
  });
  return refreshed.access_token;
}

// Clear the connection. Called when revoking from /me, or when a
// refresh fails permanently and we want the user to re-auth.
export async function clearUserKrogerSession(args: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<void> {
  await args.supabase
    .from("profiles")
    .update({
      kroger_access_token: null,
      kroger_refresh_token: null,
      kroger_token_expires_at: null,
      kroger_user_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.userId);
}

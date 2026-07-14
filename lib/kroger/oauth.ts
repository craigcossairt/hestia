// Kroger user-level OAuth (Authorization Code grant).
//
// Token columns on profiles are revoked from authenticated/anon (see
// migration 0023). All token read/write goes through the service-role
// admin client. The caller's userId is always taken from a verified
// session — never from the request body.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

const KROGER_BASE = "https://api.kroger.com/v1";
const AUTHORIZE_URL = `${KROGER_BASE}/connect/oauth2/authorize`;
const TOKEN_URL = `${KROGER_BASE}/connect/oauth2/token`;

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

function tokensAdmin(): SupabaseClient {
  return createAdminClient();
}

export function getRedirectUriFromRequest(req: { nextUrl: URL }): string {
  return `${req.nextUrl.origin}/api/kroger/oauth/callback`;
}

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
  expires_in: number;
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

export async function persistUserTokens(args: {
  /** Unused — tokens always go through service role. Kept for call-site stability. */
  supabase?: SupabaseClient;
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
  if (args.tokens.refresh_token) {
    patch.kroger_refresh_token = args.tokens.refresh_token;
  }
  if (args.krogerUserId !== undefined) {
    patch.kroger_user_id = args.krogerUserId;
  }
  await tokensAdmin().from("profiles").update(patch).eq("id", args.userId);
}

export interface UserKrogerSession {
  accessToken: string;
  expiresAt: Date;
  refreshToken: string | null;
  krogerUserId: string | null;
}

export async function getUserKrogerSession(args: {
  supabase?: SupabaseClient;
  userId: string;
}): Promise<UserKrogerSession | null> {
  const { data } = await tokensAdmin()
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

export async function ensureValidUserToken(args: {
  supabase?: SupabaseClient;
  userId: string;
}): Promise<string | null> {
  const session = await getUserKrogerSession(args);
  if (!session) return null;
  if (session.expiresAt.getTime() - Date.now() > 30_000) {
    return session.accessToken;
  }
  if (!session.refreshToken) return null;
  const refreshed = await refreshTokens(session.refreshToken);
  if (!refreshed) return null;
  await persistUserTokens({
    userId: args.userId,
    tokens: refreshed,
  });
  return refreshed.access_token;
}

export async function clearUserKrogerSession(args: {
  supabase?: SupabaseClient;
  userId: string;
}): Promise<void> {
  await tokensAdmin()
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

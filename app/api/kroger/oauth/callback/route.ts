// Kroger OAuth callback.
// GET /api/kroger/oauth/callback?code=...&state=...
//
// Verifies the state cookie matches, exchanges the code for tokens,
// persists them on the user's profile, then redirects back to
// whatever return path was set when the flow started.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  exchangeCodeForTokens,
  getRedirectUriFromRequest,
  persistUserTokens,
} from "@/lib/kroger/oauth";

const STATE_COOKIE = "kroger_oauth_state";
const RETURN_COOKIE = "kroger_oauth_return";
const REDIRECT_COOKIE = "kroger_oauth_redirect";

function clearCookies(res: NextResponse) {
  res.cookies.delete(STATE_COOKIE);
  res.cookies.delete(RETURN_COOKIE);
  res.cookies.delete(REDIRECT_COOKIE);
  return res;
}

function errorRedirect(req: NextRequest, returnPath: string, reason: string) {
  const url = new URL(returnPath, req.url);
  url.searchParams.set("kroger", "error");
  url.searchParams.set("reason", reason);
  return clearCookies(NextResponse.redirect(url));
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");
  const returnPath = req.cookies.get(RETURN_COOKIE)?.value || "/shop";
  const expectedState = req.cookies.get(STATE_COOKIE)?.value;

  // Kroger sends ?error=access_denied when the user cancels.
  if (error) return errorRedirect(req, returnPath, error);
  if (!code || !state) return errorRedirect(req, returnPath, "missing-params");
  if (!expectedState || state !== expectedState) {
    return errorRedirect(req, returnPath, "state-mismatch");
  }

  // Use the same redirect URI that was sent during /authorize. Falls
  // back to deriving from this request if the cookie is missing
  // (cookie expired or sameSite blocked) — same-host requests will
  // produce the same value anyway.
  const redirectUri =
    req.cookies.get(REDIRECT_COOKIE)?.value || getRedirectUriFromRequest(req);
  const tokens = await exchangeCodeForTokens(code, redirectUri);
  if (!tokens) return errorRedirect(req, returnPath, "exchange-failed");

  // Best-effort: pull the Kroger profile id for display ("connected as
  // ...") if the token includes profile.compact scope. Failures here
  // don't block the flow — connection works either way.
  let krogerUserId: string | null = null;
  try {
    const profileRes = await fetch(
      "https://api.kroger.com/v1/identity/profile",
      {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (profileRes.ok) {
      const json = (await profileRes.json()) as {
        data?: { id?: string };
      };
      krogerUserId = json.data?.id ?? null;
    }
  } catch {
    // ignore — we'll just have no display id
  }

  await persistUserTokens({
    supabase,
    userId: user.id,
    tokens,
    krogerUserId,
  });

  const successUrl = new URL(returnPath, req.url);
  successUrl.searchParams.set("kroger", "connected");
  return clearCookies(NextResponse.redirect(successUrl));
}

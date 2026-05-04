// Initiate Kroger user OAuth.
// GET /api/kroger/oauth/start?return=/shop
//
// Sets a CSRF state cookie + a return-path cookie, then redirects to
// Kroger's authorise URL. The callback handler reads both cookies on
// the round-trip back.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buildAuthorizeUrl,
  getRedirectUriFromRequest,
} from "@/lib/kroger/oauth";
import { isKrogerConfigured } from "@/lib/kroger/client";
import crypto from "crypto";

const STATE_COOKIE = "kroger_oauth_state";
const RETURN_COOKIE = "kroger_oauth_return";
// Persist the exact redirect URI we sent during /authorize so the
// callback can echo the byte-identical value back during /token
// exchange. Kroger validates these match.
const REDIRECT_COOKIE = "kroger_oauth_redirect";

export async function GET(req: NextRequest) {
  // Require an authenticated Hestia user — we don't allow anonymous
  // OAuth flows since the resulting tokens get bound to a profile row.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (!isKrogerConfigured()) {
    return NextResponse.json(
      { error: "Kroger isn't configured on the server." },
      { status: 503 },
    );
  }

  const state = crypto.randomBytes(24).toString("hex");
  const returnPath = req.nextUrl.searchParams.get("return") || "/shop";
  const redirectUri = getRedirectUriFromRequest(req);
  const url = buildAuthorizeUrl(state, redirectUri);
  if (!url) {
    return NextResponse.json(
      { error: "Failed to build authorize URL." },
      { status: 500 },
    );
  }

  const res = NextResponse.redirect(url);
  // 10-minute window for the user to complete consent. Cookies are
  // httpOnly + same-site=lax so the callback can read them across
  // the cross-site redirect from Kroger.
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 10 * 60,
    path: "/",
  };
  res.cookies.set(STATE_COOKIE, state, cookieOpts);
  res.cookies.set(RETURN_COOKIE, returnPath, cookieOpts);
  res.cookies.set(REDIRECT_COOKIE, redirectUri, cookieOpts);
  return res;
}

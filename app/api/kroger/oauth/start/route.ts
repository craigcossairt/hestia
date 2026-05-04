// Initiate Kroger user OAuth.
// GET /api/kroger/oauth/start?return=/shop
//
// Sets a CSRF state cookie + a return-path cookie, then redirects to
// Kroger's authorise URL. The callback handler reads both cookies on
// the round-trip back.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildAuthorizeUrl } from "@/lib/kroger/oauth";
import { isKrogerConfigured } from "@/lib/kroger/client";
import crypto from "crypto";

const STATE_COOKIE = "kroger_oauth_state";
const RETURN_COOKIE = "kroger_oauth_return";

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
  const url = buildAuthorizeUrl(state);
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
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 10 * 60,
    path: "/",
  });
  res.cookies.set(RETURN_COOKIE, returnPath, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 10 * 60,
    path: "/",
  });
  return res;
}

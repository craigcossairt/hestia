import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Supabase calls back to /auth/callback?code=... after the magic link is clicked.
// Exchange the code for a session, then route to onboarding or today.
//
// IMPORTANT: we must attach session cookies directly to the redirect response.
// Using the cookies() helper here doesn't reliably propagate auth cookies
// onto a NextResponse.redirect() in App Router — the cookies get set on the
// "ambient" response, not the explicit redirect we return. This loses the
// session and the user bounces back to /login.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  // Build the response up front so the Supabase client can attach cookies to it.
  const response = NextResponse.redirect(`${origin}/today`);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`,
    );
  }

  // Decide final destination: /onboard for first-timers, /today for returning users.
  // We mutate the existing response's Location header so the cookies stick.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarded_at")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile?.onboarded_at) {
      response.headers.set("location", `${origin}/onboard`);
    }
  }
  return response;
}

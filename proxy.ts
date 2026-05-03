import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const PUBLIC_PATHS = ["/", "/login", "/auth"];
const DEV_PATHS = ["/dev"];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return true;
  }
  if (DEV_PATHS.some((p) => pathname.startsWith(p))) {
    return true;
  }
  return false;
}

const TODAY_DEMO_PATHS = ["/today", "/dev"];

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  // No Supabase configured? Allow public pages + Today (demo mode); redirect
  // other authenticated routes home.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    if (
      isPublic(pathname) ||
      TODAY_DEMO_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
    ) {
      return NextResponse.next({ request });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  const { response, user } = await updateSession(request);

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && (pathname === "/login" || pathname === "/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/today";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest|icons|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|js)$).*)",
  ],
};

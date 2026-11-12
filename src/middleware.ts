import { NextResponse, type NextRequest } from "next/server";
import { authMode, SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

/**
 * Every page and API route requires a valid session cookie, except /login and /api/auth/*
 * (excluded by the matcher). Pages redirect to /login; API routes answer 401 JSON.
 */
export async function middleware(req: NextRequest) {
  const mode = authMode();
  if (mode === "open") return NextResponse.next();

  const isApi = req.nextUrl.pathname.startsWith("/api/");
  if (mode === "locked" && (await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value))) {
    return NextResponse.next();
  }
  if (isApi) {
    return NextResponse.json({ error: mode === "misconfigured" ? "auth_not_configured" : "unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Skip Next.js internals, static files, the login page and the login/logout API.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|login|api/auth/).*)"],
};

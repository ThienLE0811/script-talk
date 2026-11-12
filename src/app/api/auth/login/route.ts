import { NextResponse } from "next/server";
import {
  authMode,
  checkAccessCode,
  createSessionToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE_S,
} from "@/lib/auth/session";

export const runtime = "nodejs";

const FAILED_ATTEMPT_DELAY_MS = 800;

/** POST { code } → sets the session cookie when the access code is right. */
export async function POST(req: Request) {
  const mode = authMode();
  if (mode === "open") return Response.json({ ok: true });
  if (mode === "misconfigured") return Response.json({ error: "auth_not_configured" }, { status: 503 });

  const body = await req.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code.slice(0, 200) : "";
  if (!code || !(await checkAccessCode(code))) {
    // Slow down guessing. A long random code is still the real protection.
    await new Promise((r) => setTimeout(r, FAILED_ATTEMPT_DELAY_MS));
    return Response.json({ error: "wrong_code" }, { status: 401 });
  }

  const token = await createSessionToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
  return res;
}

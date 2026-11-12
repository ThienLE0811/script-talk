/**
 * Single-user access-code auth. Edge- and Node-safe (Web Crypto only), so it runs in middleware.
 *
 * - APP_ACCESS_CODE: the code typed on /login.
 * - AUTH_SECRET (optional): key for signing the session cookie. Defaults to the access code,
 *   so changing the code also signs everyone out.
 * - Without APP_ACCESS_CODE the app is open in development but locked in production, so a
 *   deployment can never be left public by accident.
 */

export const SESSION_COOKIE = "st_session";
export const SESSION_MAX_AGE_S = 180 * 24 * 60 * 60;

export type AuthMode = "open" | "locked" | "misconfigured";

export function authMode(): AuthMode {
  if (process.env.APP_ACCESS_CODE) return "locked";
  return process.env.NODE_ENV === "production" ? "misconfigured" : "open";
}

const enc = new TextEncoder();

function base64url(bytes: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(s: string): Uint8Array<ArrayBuffer> | null {
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    const out = new Uint8Array(new ArrayBuffer(bin.length));
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function hmacKey(): Promise<CryptoKey | null> {
  const secret = process.env.AUTH_SECRET || process.env.APP_ACCESS_CODE;
  if (!secret) return null;
  return crypto.subtle.importKey("raw", enc.encode(`scripttalk-session:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

/** Token format: `<expiresAtMs>.<base64url HMAC of expiresAtMs>`. */
export async function createSessionToken(now = Date.now()): Promise<string | null> {
  const key = await hmacKey();
  if (!key) return null;
  const exp = String(now + SESSION_MAX_AGE_S * 1000);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(exp));
  return `${exp}.${base64url(sig)}`;
}

export async function verifySessionToken(token: string | undefined, now = Date.now()): Promise<boolean> {
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < now) return false;
  const key = await hmacKey();
  const sigBytes = fromBase64url(sig);
  if (!key || !sigBytes) return false;
  return crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(exp)); // constant-time
}

/** Constant-time comparison of the submitted code with APP_ACCESS_CODE (compares HMACs). */
export async function checkAccessCode(input: string): Promise<boolean> {
  const code = process.env.APP_ACCESS_CODE;
  const key = await hmacKey();
  if (!code || !key) return false;
  const [a, b] = await Promise.all([
    crypto.subtle.sign("HMAC", key, enc.encode(`code:${input}`)),
    crypto.subtle.sign("HMAC", key, enc.encode(`code:${code}`)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

/**
 * Only allow redirects to paths on this site after login. Parsing with the URL parser (the same
 * rules the browser uses) catches tricks like "//evil.com", "/\evil.com" or "/\t/evil.com",
 * which browsers turn into another origin.
 */
export function safeNextPath(next: unknown): string {
  if (typeof next !== "string" || !next.startsWith("/")) return "/";
  try {
    const base = "http://scripttalk.invalid";
    const url = new URL(next, base);
    if (url.origin !== base) return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}

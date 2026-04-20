import { NextResponse } from "next/server";
import { clearRateLimitEntry, getRateLimitStatus, registerRateLimitHit } from "@/shared/lib/server/api-request-security";
import { SESSION_COOKIE, SESSION_TTL_MS, clearExpiredSessions, parseCookieHeader } from "@/shared/lib/server/auth";
import type { DatabaseClient } from "@/shared/lib/server/database-client";
import type { QueryAdapter } from "@/shared/lib/server/query-adapter";

const AUTH_RATE_LIMIT_POLICY = {
  windowMs: 60_000,
  maxAttempts: 10,
} as const;

type AuthRateLimitEntry = { count: number; resetAt: number };
type AuthRateLimitGlobal = typeof globalThis & {
  __mumurAuthRateLimit?: Map<string, AuthRateLimitEntry>;
};
type CookieCapableRequest = Request & {
  cookies?: {
    get?: (name: string) => { value?: string } | undefined;
  };
};

const globalRef = globalThis as AuthRateLimitGlobal;

if (!globalRef.__mumurAuthRateLimit) {
  globalRef.__mumurAuthRateLimit = new Map<string, AuthRateLimitEntry>();
}

const authRateLimit = globalRef.__mumurAuthRateLimit;

export function getAuthRateLimitStatus(_request: CookieCapableRequest, action: string, identifier: unknown) {
  return getRateLimitStatus(authRateLimit, action, identifier, AUTH_RATE_LIMIT_POLICY);
}

export function registerAuthRateLimitFailure(_request: CookieCapableRequest, action: string, identifier: unknown) {
  registerRateLimitHit(authRateLimit, action, identifier, AUTH_RATE_LIMIT_POLICY);
}

export function clearAuthRateLimit(_request: CookieCapableRequest, action: string, identifier: unknown) {
  clearRateLimitEntry(authRateLimit, action, identifier);
}

export function clearAuthRateLimitForTests() {
  authRateLimit.clear();
}

export function getSessionToken(request: CookieCapableRequest) {
  const tokenFromRequest = request.cookies?.get?.(SESSION_COOKIE)?.value;
  if (tokenFromRequest) {
    return tokenFromRequest;
  }
  const parsed = parseCookieHeader(request.headers.get("cookie") || "") as Record<string, string | undefined>;
  return parsed[SESSION_COOKIE] || null;
}

export function authContext(db: DatabaseClient, queries: QueryAdapter, request: CookieCapableRequest) {
  clearExpiredSessions(queries);
  const token = getSessionToken(request);
  if (!token) {
    return null;
  }

  const session = db
    .prepare(
      "SELECT s.id, s.user_id, s.team_id, u.name, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?"
    )
    .get(token, Date.now()) as { id: string; user_id: number; team_id: number; name: string; email: string } | undefined;

  if (!session) {
    return null;
  }

  return {
    session: { id: session.id, userId: session.user_id, teamId: session.team_id },
    user: { id: session.user_id, name: session.name, email: session.email }
  };
}

function shouldUseSecureCookie(request: CookieCapableRequest) {
  if (process.env.NODE_ENV !== "production") {
    return false;
  }

  const isLocalHost = (hostname: string) => ["127.0.0.1", "localhost", "[::1]", "::1", "0.0.0.0"].includes(hostname.toLowerCase());

  try {
    const url = new URL(request.url);
    const hostHeader = String(request.headers.get("host") || "").split(":")[0]?.trim() || "";
    const effectiveHostname = hostHeader || url.hostname;
    return !isLocalHost(effectiveHostname) && !isLocalHost(url.hostname);
  } catch {
    const hostHeader = String(request.headers.get("host") || "").split(":")[0]?.trim() || "";
    return hostHeader ? !isLocalHost(hostHeader) : true;
  }
}

function getSessionCookieSameSite() {
  return process.env.NODE_ENV === "production" ? "strict" : "lax";
}

function getSessionCookieOptions(request: CookieCapableRequest, expiresAt: number) {
  return {
    httpOnly: true,
    sameSite: getSessionCookieSameSite(),
    secure: shouldUseSecureCookie(request),
    expires: new Date(expiresAt),
    maxAge: Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)),
    path: "/",
  } as const;
}

export function withSessionCookie(request: CookieCapableRequest, response: NextResponse, token: string, expiresAt: number) {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    ...getSessionCookieOptions(request, expiresAt),
  });
  return response;
}

export function clearSessionCookie(request: CookieCapableRequest, response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    ...getSessionCookieOptions(request, Date.now() - SESSION_TTL_MS),
  });
  return response;
}

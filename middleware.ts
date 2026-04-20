import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function applySecurityHeaders(request: NextRequest, response: NextResponse) {
  const isDevelopment = process.env.NODE_ENV !== "production";
  const scriptSrc = isDevelopment ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self' 'unsafe-inline'";
  const csp = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' ws: wss: https:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");

  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-DNS-Prefetch-Control", "off");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");

  if (!isDevelopment && request.nextUrl.protocol === "https:") {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  return response;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get("mumur_session")?.value || request.cookies.get("session_token")?.value);

  if (pathname === "/" && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return applySecurityHeaders(request, NextResponse.redirect(url));
  }

  return applySecurityHeaders(request, NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};

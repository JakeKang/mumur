import { NextResponse } from "next/server";

import { reportServerIssue } from "@/shared/lib/observability";

const JSON_REQUIRED_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1", "0.0.0.0"]);
const ALLOWED_MUTATION_FETCH_SITES = new Set(["same-origin", "same-site"]);

type RateLimitEntry = { count: number; resetAt: number };

export type RateLimitPolicy = {
  windowMs: number;
  maxAttempts: number;
};

const DEFAULT_MUTATION_RATE_LIMIT_POLICY: RateLimitPolicy = {
  windowMs: 60_000,
  maxAttempts: 6,
};

const MUTATION_RATE_LIMIT_POLICIES = {
  "auth-profile-update": { windowMs: 60_000, maxAttempts: 5 },
  "block-upload": { windowMs: 60_000, maxAttempts: 4 },
  "comment-create": { windowMs: 60_000, maxAttempts: 6 },
  "comment-delete": { windowMs: 60_000, maxAttempts: 8 },
  "comment-update": { windowMs: 60_000, maxAttempts: 8 },
  "notification-preferences": { windowMs: 60_000, maxAttempts: 8 },
  reaction: { windowMs: 60_000, maxAttempts: 12 },
  "webhook-update": { windowMs: 60_000, maxAttempts: 4 },
  "workspace-view-create": { windowMs: 60_000, maxAttempts: 8 },
} satisfies Record<string, RateLimitPolicy>;

const globalRef = globalThis as typeof globalThis & {
  __mumurMutationRateLimit?: Map<string, RateLimitEntry>;
};

if (!globalRef.__mumurMutationRateLimit) {
  globalRef.__mumurMutationRateLimit = new Map();
}

const mutationRateLimit = globalRef.__mumurMutationRateLimit;

export class RequestValidationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function normalizeRateLimitIdentifier(identifier: unknown) {
  const normalized = String(identifier ?? "").trim().toLowerCase();
  return normalized || "anonymous";
}

function createRateLimitKey(action: string, identifier: unknown) {
  return `${action}:${normalizeRateLimitIdentifier(identifier)}`;
}

export function getRateLimitStatus(store: Map<string, RateLimitEntry>, action: string, identifier: unknown, policy: RateLimitPolicy) {
  const now = Date.now();
  const key = createRateLimitKey(action, identifier);
  const current = store.get(key);
  if (!current || current.resetAt <= now) {
    return { allowed: true, retryAfterSeconds: Math.ceil(policy.windowMs / 1000) };
  }
  if (current.count >= policy.maxAttempts) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  }
  return { allowed: true, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
}

export function registerRateLimitHit(store: Map<string, RateLimitEntry>, action: string, identifier: unknown, policy: RateLimitPolicy) {
  const now = Date.now();
  const key = createRateLimitKey(action, identifier);
  const current = store.get(key);
  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + policy.windowMs });
    return;
  }
  current.count += 1;
  store.set(key, current);
}

export function clearRateLimitEntry(store: Map<string, RateLimitEntry>, action: string, identifier: unknown) {
  store.delete(createRateLimitKey(action, identifier));
}

export function clearRequestSecurityRateLimitsForTests() {
  mutationRateLimit.clear();
}

export async function readJsonBody(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new RequestValidationError("application/json 요청 본문이 필요합니다", 415);
  }
  try {
    return await request.json();
  } catch {
    throw new RequestValidationError("유효한 JSON 본문이 필요합니다", 400);
  }
}

function getRequestOrigin(request: Request) {
  try {
    const url = new URL(request.url);
    const hostHeader = String(request.headers.get("host") || "").trim();
    return hostHeader ? `${url.protocol}//${hostHeader}` : url.origin;
  } catch {
    return "";
  }
}

function isLoopbackHost(hostname: string) {
  return LOOPBACK_HOSTS.has(hostname.toLowerCase());
}

function isLoopbackRequest(request: Request) {
  try {
    if (isLoopbackHost(new URL(request.url).hostname)) {
      return true;
    }
  } catch {
    // fall through to host header check
  }

  const hostHeader = String(request.headers.get("host") || "").split(":")[0]?.trim() || "";
  return hostHeader ? isLoopbackHost(hostHeader) : false;
}

function hasExpectedReferer(referer: string, expectedOrigin: string) {
  try {
    return new URL(referer).origin === expectedOrigin;
  } catch {
    return false;
  }
}

export function ensureMutationOrigin(request: Request, method: string) {
  if (!JSON_REQUIRED_METHODS.has(method)) {
    return;
  }

  const expectedOrigin = getRequestOrigin(request);
  if (!expectedOrigin) {
    return;
  }

  const origin = String(request.headers.get("origin") || "").trim();
  const referer = String(request.headers.get("referer") || "").trim();
  const fetchSite = String(request.headers.get("sec-fetch-site") || "").trim().toLowerCase();

  if (fetchSite && !ALLOWED_MUTATION_FETCH_SITES.has(fetchSite)) {
    throw new RequestValidationError("허용되지 않은 요청 출처입니다", 403);
  }

  if (origin) {
    if (origin !== expectedOrigin) {
      throw new RequestValidationError("허용되지 않은 요청 출처입니다", 403);
    }
    return;
  }

  if (referer) {
    if (!hasExpectedReferer(referer, expectedOrigin)) {
      throw new RequestValidationError("허용되지 않은 요청 출처입니다", 403);
    }
    return;
  }

  if (fetchSite) {
    return;
  }

  if (isLoopbackRequest(request)) {
    return;
  }

  throw new RequestValidationError("허용되지 않은 요청 출처입니다", 403);
}

function getMutationRateLimitPolicy(action: string) {
  return MUTATION_RATE_LIMIT_POLICIES[action as keyof typeof MUTATION_RATE_LIMIT_POLICIES] || DEFAULT_MUTATION_RATE_LIMIT_POLICY;
}

export function enforceMutationRateLimit(_request: Request, action: string, identifier: unknown) {
  const policy = getMutationRateLimitPolicy(action);
  const rateLimit = getRateLimitStatus(mutationRateLimit, action, identifier, policy);
  if (!rateLimit.allowed) {
    let path = "";
    try {
      path = new URL(_request.url).pathname;
    } catch {
      // ignore
    }
    reportServerIssue("api-request-security", "mutation rate limit rejected", {
      action,
      method: _request.method,
      path,
      retryAfterSeconds: rateLimit.retryAfterSeconds
    });
    return NextResponse.json({ error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." }, {
      status: 429,
      headers: { "Retry-After": String(rateLimit.retryAfterSeconds) }
    });
  }
  registerRateLimitHit(mutationRateLimit, action, identifier, policy);
  return null;
}

import { beforeEach, describe, expect, it } from "vitest";
import {
  clearAuthRateLimit,
  clearAuthRateLimitForTests,
  getAuthRateLimitStatus,
  registerAuthRateLimitFailure,
} from "@/shared/lib/server/api-session";

describe("api-session auth rate limit", () => {
  beforeEach(() => {
    clearAuthRateLimitForTests();
  });

  it("does not trust spoofed forwarding headers when grouping auth failures", () => {
    const firstRequest = new Request("https://app.mumur.test/api/auth/login", {
      headers: { "x-forwarded-for": "1.1.1.1", "x-real-ip": "1.1.1.1" },
    });
    const secondRequest = new Request("https://app.mumur.test/api/auth/login", {
      headers: { "x-forwarded-for": "9.9.9.9", "x-real-ip": "9.9.9.9" },
    });

    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect(getAuthRateLimitStatus(firstRequest, "login", "localtester@mumur.local").allowed).toBe(true);
      registerAuthRateLimitFailure(firstRequest, "login", "localtester@mumur.local");
    }

    const blocked = getAuthRateLimitStatus(secondRequest, "login", "localtester@mumur.local");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("clears auth rate limits by action and identifier", () => {
    const request = new Request("https://app.mumur.test/api/auth/login");

    registerAuthRateLimitFailure(request, "login", "localtester@mumur.local");
    clearAuthRateLimit(request, "login", "localtester@mumur.local");

    expect(getAuthRateLimitStatus(request, "login", "localtester@mumur.local").allowed).toBe(true);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import {
  RequestValidationError,
  clearRequestSecurityRateLimitsForTests,
  enforceMutationRateLimit,
  ensureMutationOrigin,
  readJsonBody,
} from "@/shared/lib/server/api-request-security";

describe("api-request-security", () => {
  beforeEach(() => {
    clearRequestSecurityRateLimitsForTests();
  });

  it("rejects malformed json bodies explicitly", async () => {
    const request = new Request("http://127.0.0.1/api/ideas/1/comments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{invalid-json",
    });

    await expect(readJsonBody(request)).rejects.toMatchObject({
      message: "유효한 JSON 본문이 필요합니다",
      status: 400,
    });
  });

  it("rejects protected mutations from foreign origins", () => {
    const request = new Request("https://app.mumur.test/api/ideas/1/comments", {
      method: "POST",
      headers: { origin: "https://evil.example" },
    });

    expect(() => ensureMutationOrigin(request, "POST")).toThrow(RequestValidationError);
  });

  it("rejects originless non-local mutation requests", () => {
    const request = new Request("https://app.mumur.test/api/ideas/1/comments", {
      method: "POST",
    });

    expect(() => ensureMutationOrigin(request, "POST")).toThrow(RequestValidationError);
  });

  it("allows originless loopback mutation requests for local tooling", () => {
    const request = new Request("http://127.0.0.1/api/ideas/1/comments", {
      method: "POST",
    });

    expect(() => ensureMutationOrigin(request, "POST")).not.toThrow();
  });

  it("applies explicit thresholds to protected mutation families", () => {
    const request = new Request("http://127.0.0.1/api/test", { method: "POST" });
    const cases = [
      { action: "auth-profile-update", allowedAttempts: 5 },
      { action: "comment-create", allowedAttempts: 6 },
      { action: "reaction", allowedAttempts: 12 },
      { action: "block-upload", allowedAttempts: 4 },
      { action: "webhook-update", allowedAttempts: 4 },
    ] as const;

    for (const testCase of cases) {
      const identifier = `${testCase.action}:tester`;
      for (let attempt = 0; attempt < testCase.allowedAttempts; attempt += 1) {
        expect(enforceMutationRateLimit(request, testCase.action, identifier)).toBeNull();
      }

      const blocked = enforceMutationRateLimit(request, testCase.action, identifier);
      expect(blocked?.status).toBe(429);
      expect(blocked?.headers.get("retry-after")).toBeTruthy();

      clearRequestSecurityRateLimitsForTests();
    }
  });
});

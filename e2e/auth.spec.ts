import { expect, test } from "@playwright/test";
import { loginAsLocalTester } from "./helpers";

function expectSecurityHeaders(headers: Record<string, string>) {
  expect(headers["content-security-policy"]).toContain("default-src 'self'");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-dns-prefetch-control"]).toBe("off");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toBe("camera=(), microphone=(), geolocation=()");
  expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
  expect(headers["cross-origin-resource-policy"]).toBe("same-origin");
}

test("invalid login shows error", async ({ page }) => {
  const res = await page.request.post("/api/auth/login", {
    data: { email: "localtester@mumur.local", password: "wrong-password" },
  });
  expect(res.status()).toBe(401);
  const body = await res.json();
  expect(String(body?.error || "")).toContain("이메일 또는 비밀번호가 올바르지 않습니다");
});

test("local tester can login and logout", async ({ page }) => {
  await loginAsLocalTester(page);
  const logoutRes = await page.request.post("/api/auth/logout");
  expect(logoutRes.ok()).toBeTruthy();
  await page.goto("/");
  await expect(page.getByPlaceholder("이메일")).toBeVisible();
});

test("login helper keeps local tester session precondition stable", async ({ page }) => {
  await loginAsLocalTester(page);
  const meRes = await page.request.get("/api/auth/me");
  expect(meRes.ok()).toBeTruthy();

  const logoutRes = await page.request.post("/api/auth/logout");
  expect(logoutRes.ok()).toBeTruthy();
  await expect.poll(async () => {
    const meAfterLogout = await page.request.get("/api/auth/me");
    return meAfterLogout.status();
  }).toBe(401);

  await loginAsLocalTester(page);
  const meAfterReloginRes = await page.request.get("/api/auth/me");
  expect(meAfterReloginRes.ok()).toBeTruthy();
});

test("security headers are emitted on authenticated and unauthenticated app/api responses", async ({ page }) => {
  const loginRes = await page.request.get("/login");
  expect(loginRes.ok()).toBeTruthy();
  expectSecurityHeaders(loginRes.headers());

  const healthRes = await page.request.get("/api/health");
  expect(healthRes.ok()).toBeTruthy();
  expectSecurityHeaders(healthRes.headers());

  await loginAsLocalTester(page);

  const appRes = await page.request.get("/");
  expect(appRes.ok()).toBeTruthy();
  expectSecurityHeaders(appRes.headers());

  const meRes = await page.request.get("/api/auth/me");
  expect(meRes.ok()).toBeTruthy();
  expectSecurityHeaders(meRes.headers());
});

test("session cookie uses hardened production defaults without breaking local http auth", async ({ page }) => {
  const loginRes = await page.request.post("/api/auth/login", {
    data: { email: "localtester@mumur.local", password: "mumur1234!" },
  });

  expect(loginRes.ok()).toBeTruthy();
  const setCookie = loginRes.headers()["set-cookie"] || "";
  expect(setCookie).toContain("mumur_session=");
  expect(setCookie).toContain("HttpOnly");
  expect(setCookie).toContain("Path=/");
  expect(setCookie).toContain("SameSite=strict");
  expect(setCookie).not.toContain("Secure");
});

test("weak password registration is rejected", async ({ page }) => {
  const email = `weak-${Date.now()}@mumur.local`;
  const res = await page.request.post("/api/auth/register", {
    data: {
      name: "Weak Password",
      email,
      password: "weak123",
      teamName: "Weak Workspace",
    },
  });

  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(String(body?.error || "")).toContain("10자 이상");
});

test("weak password change is rejected", async ({ page }) => {
  await loginAsLocalTester(page);

  const res = await page.request.patch("/api/auth/me", {
    data: {
      currentPassword: "mumur1234!",
      newPassword: "weak123",
    },
  });

  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(String(body?.error || "")).toContain("새 비밀번호");
  expect(String(body?.error || "")).toContain("10자 이상");
});

import { expect, test } from "@playwright/test";
import { loginAsLocalTester } from "./helpers";

test("workspace can be created via API and appears in sidebar", async ({ page }) => {
  await loginAsLocalTester(page);

  const res = await page.request.post("/api/workspaces", {
    data: { teamName: "E2E Workspace", icon: "🚀", color: "#0ea5e9" },
  });
  expect(res.ok()).toBeTruthy();

  await page.reload();
  await expect(page.getByText("E2E Workspace").first()).toBeVisible();
});

test("sidebar shows main navigation items", async ({ page }) => {
  await loginAsLocalTester(page);

  await expect(page.getByRole("button", { name: "대시보드" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "아이디어 목록" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "팀 관리" }).first()).toBeVisible();
  await expect(page.getByText("워크스페이스")).toBeVisible();
});

test("mobile hamburger menu is present at mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await loginAsLocalTester(page);

  const hamburger = page.locator("button[aria-label='메뉴 열기']");
  await expect(hamburger).toBeVisible();
  await hamburger.click();
  await page.waitForTimeout(400);

  await expect(page.getByRole("button", { name: "대시보드" }).first()).toBeVisible();
});

test("navigate to team management page", async ({ page }) => {
  await loginAsLocalTester(page);

  await page.getByRole("button", { name: "팀 관리" }).first().click();
  await expect(page.getByRole("heading", { name: "팀 관리" })).toBeVisible();
});

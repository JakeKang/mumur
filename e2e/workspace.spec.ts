import { expect, test } from "@playwright/test";
import { loginAsLocalTester } from "./helpers";

test("workspace can be created and appears in sidebar", async ({ page }) => {
  await loginAsLocalTester(page);
  const workspaceName = `E2E Workspace ${Date.now()}`;

  await page.getByRole("button", { name: "새 워크스페이스", exact: true }).click();
  await page.getByPlaceholder("워크스페이스 이름").fill(workspaceName);
  await page.getByRole("button", { name: "저장" }).click();

  const workspaceButton = page.getByRole("button", { name: workspaceName });
  await expect(workspaceButton.first()).toBeVisible({ timeout: 10000 });
});

test("sidebar shows main navigation items", async ({ page }) => {
  await loginAsLocalTester(page);

  await expect(page.getByRole("button", { name: "대시보드" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "전체 아이디어" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "팀 관리" }).first()).toBeVisible();
  await expect(page.getByText("워크스페이스", { exact: true })).toBeVisible();
});

test("mobile hamburger menu is present at mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await loginAsLocalTester(page);

  const hamburger = page.locator("button[aria-label='메뉴 열기']");
  await expect(hamburger).toBeVisible();
  await hamburger.click();

  await expect(page.getByRole("button", { name: "대시보드" }).first()).toBeVisible();
});

test("navigate to team management page", async ({ page }) => {
  await loginAsLocalTester(page);

  await page.getByRole("button", { name: "팀 관리" }).first().click();
  await expect(page.getByRole("heading", { name: "팀 관리" })).toBeVisible();
});

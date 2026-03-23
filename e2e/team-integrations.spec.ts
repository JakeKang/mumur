import { expect, test } from "@playwright/test";
import { loginAsLocalTester } from "./helpers";

test("admin can invite member from team page", async ({ page }) => {
  await loginAsLocalTester(page);

  await page.getByRole("button", { name: "팀 관리" }).first().click();
  await expect(page.getByRole("heading", { name: "팀 관리" })).toBeVisible();

  const inviteEmail = `playwright-member-${Date.now()}@mumur.local`;
  await page.getByPlaceholder("초대할 이메일").fill(inviteEmail);
  await page.getByRole("button", { name: "+ 멤버 초대" }).click();
  await expect(page.getByText(inviteEmail)).toBeVisible();
});

test("integration panel updates webhook", async ({ page }) => {
  await loginAsLocalTester(page);

  await page.getByRole("button", { name: "팀 관리" }).first().click();
  await expect(page.getByRole("heading", { name: "팀 관리" })).toBeVisible();
  await page.getByRole("button", { name: "웹훅 설정 열기" }).click();
  await expect(page.getByRole("button", { name: "저장" })).toBeVisible();

  const webhookUrl = "https://hooks.slack.com/services/T000/B000/XYZ";
  await page.getByPlaceholder("https://...").fill(webhookUrl);
  await page.getByRole("button", { name: "저장" }).click();
  await expect(page.getByText(webhookUrl)).toBeVisible();
});

import { expect, Page } from "@playwright/test";

export async function loginAsLocalTester(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible();
  const loginForm = page.locator("form").first();
  await page.getByPlaceholder("이메일").fill("localtester@mumur.local");
  await page.getByPlaceholder("비밀번호").fill("mumur1234!");
  await loginForm.getByRole("button", { name: "로그인" }).click();
  await expect(page.getByRole("button", { name: "로그아웃" })).toBeVisible();
}

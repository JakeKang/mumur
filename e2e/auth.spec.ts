import { expect, test } from "@playwright/test";

test("invalid login shows error", async ({ page }) => {
  await page.goto("/");
  const loginForm = page.locator("form").first();
  await page.getByPlaceholder("이메일").fill("localtester@mumur.local");
  await page.getByPlaceholder("비밀번호").fill("wrong-password");
  await loginForm.getByRole("button", { name: "로그인" }).click();
  await expect(page.getByText("이메일 또는 비밀번호가 올바르지 않습니다")).toBeVisible();
});

test("local tester can login and logout", async ({ page }) => {
  await page.goto("/");
  const loginForm = page.locator("form").first();
  await page.getByPlaceholder("이메일").fill("localtester@mumur.local");
  await page.getByPlaceholder("비밀번호").fill("mumur1234!");
  await loginForm.getByRole("button", { name: "로그인" }).click();

  await expect(page.getByRole("button", { name: "로그아웃" })).toBeVisible();
  await page.getByRole("button", { name: "로그아웃" }).click();
  await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible();
});

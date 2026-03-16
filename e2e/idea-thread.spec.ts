import { expect, test } from "@playwright/test";
import { loginAsLocalTester } from "./helpers";

test("create idea, add comment, and create thread", async ({ page }) => {
  await loginAsLocalTester(page);

  const ideaTitle = `E2E Idea ${Date.now()}`;
  const createResponse = await page.request.post("/api/ideas", {
    data: {
      title: ideaTitle,
      category: "qa",
      status: "seed",
      blocks: [{ id: `b-${Date.now()}`, type: "text", content: "e2e", checked: false }]
    }
  });
  expect(createResponse.ok()).toBeTruthy();
  const createBody = await createResponse.json();
  await page.goto(`/?idea=${createBody.idea.id}`);

  await expect(page.getByRole("heading", { name: ideaTitle })).toBeVisible();
  await page.getByRole("button", { name: "협업" }).click();

  const commentDraft = `e2e comment ${Date.now()}`;
  await page.getByLabel("댓글 입력").fill(commentDraft);
  await page.getByRole("button", { name: "등록" }).first().click();
  await expect(page.getByText(commentDraft)).toBeVisible();

  const threadTitle = `e2e thread ${Date.now()}`;
  await page.getByRole("button", { name: "스레드 패널 열기" }).click();
  await page.getByPlaceholder("제목").fill(threadTitle);
  await page.getByPlaceholder("설명").fill("thread from playwright e2e");
  await page.getByRole("button", { name: "스레드 생성" }).click();
  await expect(page.getByText(`현재 선택: ${threadTitle}`)).toBeVisible();
});

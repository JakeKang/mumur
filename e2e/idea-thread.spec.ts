import { expect, test } from "@playwright/test";
import { loginAsLocalTester, createIdeaViaApi, navigateToIdea } from "./helpers";

test("editor loads with idea title and blocks editable", async ({ page }) => {
  await loginAsLocalTester(page);

  const ideaTitle = `E2E 에디터 ${Date.now()}`;
  const idea = await createIdeaViaApi(page, ideaTitle);
  await navigateToIdea(page, idea.id);

  const titleInput = page.locator("textarea").first();
  await expect(titleInput).toHaveValue(ideaTitle);

  const editorArea = page.locator('[aria-label="블록 에디터"]');
  await expect(editorArea).toBeVisible();
  await editorArea.click();
  await page.keyboard.type("블록 편집 테스트");
  await expect(page.locator("textarea").nth(1)).toBeVisible();
});

test("comment can be added via collab tab", async ({ page }) => {
  await loginAsLocalTester(page);

  const ideaTitle = `E2E 댓글 ${Date.now()}`;
  const idea = await createIdeaViaApi(page, ideaTitle);
  await navigateToIdea(page, idea.id);

  await page.getByRole("button", { name: "협업" }).click();

  const commentDraft = `e2e comment ${Date.now()}`;
  await page.getByLabel("댓글 입력").fill(commentDraft);
  await page.getByRole("button", { name: "등록" }).first().click();
  await expect(page.getByText(commentDraft)).toBeVisible();
});

test("thread can be created via collab tab", async ({ page }) => {
  await loginAsLocalTester(page);

  const ideaTitle = `E2E 스레드 ${Date.now()}`;
  const idea = await createIdeaViaApi(page, ideaTitle);
  await navigateToIdea(page, idea.id);

  await page.getByRole("button", { name: "협업" }).click();
  await page.getByRole("button", { name: "스레드 패널 열기" }).click();

  const threadTitle = `e2e thread ${Date.now()}`;
  await page.getByPlaceholder("제목").fill(threadTitle);
  await page.getByPlaceholder("설명").fill("playwright e2e");
  await page.getByRole("button", { name: "스레드 생성" }).click();
  await expect(page.getByText(`현재 선택: ${threadTitle}`)).toBeVisible();
});

test("idea title can be updated via editor", async ({ page }) => {
  await loginAsLocalTester(page);

  const ideaTitle = `E2E 제목변경 ${Date.now()}`;
  const idea = await createIdeaViaApi(page, ideaTitle);
  await navigateToIdea(page, idea.id);

  const titleInput = page.locator("textarea").first();
  await titleInput.click();
  await titleInput.selectText();
  const newTitle = `수정된 제목 ${Date.now()}`;
  await titleInput.fill(newTitle);
  await page.waitForTimeout(1200);

  await expect(titleInput).toHaveValue(newTitle);
});

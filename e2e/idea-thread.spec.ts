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
  await expect(page.getByText("e2e 초기 내용")).toBeVisible();
});

test("comment can be added from editor workspace", async ({ page }) => {
  await loginAsLocalTester(page);

  const ideaTitle = `E2E 댓글 ${Date.now()}`;
  const idea = await createIdeaViaApi(page, ideaTitle);
  await navigateToIdea(page, idea.id);

  const commentInput = page.getByLabel("댓글 입력");
  await expect(commentInput).toBeVisible();

  const commentDraft = `e2e comment ${Date.now()}`;
  await commentInput.fill(commentDraft);
  const commentForm = page.locator("form").filter({ has: commentInput }).first();
  await commentForm.getByRole("button", { name: "등록" }).click();
  await expect(page.getByText(commentDraft)).toBeVisible();
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

  await expect(titleInput).toHaveValue(newTitle);
});

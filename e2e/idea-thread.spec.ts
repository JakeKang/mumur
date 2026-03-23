import { expect, test, type Page } from "@playwright/test";
import { loginAsLocalTester, createIdeaViaApi, navigateToIdea } from "./helpers";

async function openCollabTab(page: Page) {
  const tabGroup = page.locator("div").filter({ has: page.getByRole("button", { name: /문서\/타임라인/ }) }).first();
  await tabGroup.getByRole("button", { name: /협업/ }).click();
  await expect(page.getByLabel("댓글 입력")).toBeVisible();
}

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

test("comment can be added via collab tab", async ({ page }) => {
  await loginAsLocalTester(page);

  const ideaTitle = `E2E 댓글 ${Date.now()}`;
  const idea = await createIdeaViaApi(page, ideaTitle);
  await navigateToIdea(page, idea.id);

  await openCollabTab(page);

  const commentDraft = `e2e comment ${Date.now()}`;
  const commentInput = page.getByLabel("댓글 입력");
  await commentInput.fill(commentDraft);
  const commentForm = page.locator("form").filter({ has: commentInput }).first();
  await commentForm.getByRole("button", { name: "등록" }).click();
  await expect(page.getByText(commentDraft)).toBeVisible();
});

test("thread can be created via collab tab", async ({ page }) => {
  await loginAsLocalTester(page);

  const ideaTitle = `E2E 스레드 ${Date.now()}`;
  const idea = await createIdeaViaApi(page, ideaTitle);
  await navigateToIdea(page, idea.id);

  await openCollabTab(page);
  const threadSection = page.locator("section").filter({ hasText: "토론 스레드" }).first();
  await expect(threadSection).toBeVisible();
  await threadSection.getByRole("button", { name: "스레드 패널 열기" }).click();

  const threadTitle = `e2e thread ${Date.now()}`;
  const threadDrawer = page.locator("section").filter({ hasText: "스레드 생성" }).first();
  await expect(threadDrawer).toBeVisible();
  await threadDrawer.getByPlaceholder("제목").fill(threadTitle);
  await threadDrawer.getByPlaceholder("설명").fill("playwright e2e");
  await threadDrawer.getByRole("button", { name: "스레드 생성" }).click();
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

  await expect(titleInput).toHaveValue(newTitle);
});

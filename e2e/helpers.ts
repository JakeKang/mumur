import { expect, Page } from "@playwright/test";

export async function loginAsLocalTester(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible();
  const loginForm = page.locator("form").first();
  await page.getByPlaceholder("이메일").fill("localtester@mumur.local");
  await page.getByPlaceholder("비밀번호").fill("mumur1234!");
  await loginForm.getByRole("button", { name: "로그인" }).click();
  await expect(page.getByRole("button", { name: "로그아웃" })).toBeVisible();

  const workspacesRes = await page.request.get("/api/workspaces");
  expect(workspacesRes.ok()).toBeTruthy();
  const workspacesBody = await workspacesRes.json();
  const editableWorkspace = Array.isArray(workspacesBody?.workspaces)
    ? workspacesBody.workspaces.find((workspace: { id: number; role?: string | null }) => workspace?.role && workspace.role !== "viewer")
    : null;

  if (editableWorkspace?.id) {
    const switchRes = await page.request.post("/api/workspaces/switch", {
      data: { teamId: Number(editableWorkspace.id) },
    });
    expect(switchRes.ok()).toBeTruthy();
    await page.goto("/");
    await expect(page.getByRole("button", { name: "로그아웃" })).toBeVisible();
  }
}

export async function createIdeaViaApi(page: Page, title: string) {
  const res = await page.request.post("/api/ideas", {
    data: {
      title,
      category: "qa",
      status: "seed",
      blocks: [{ id: `b-${Date.now()}`, type: "paragraph", content: "e2e 초기 내용", checked: false }],
    },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return body.idea as { id: number };
}

export async function navigateToIdea(page: Page, ideaId: number) {
  await page.goto(`/?idea=${ideaId}`);
  await expect(page.locator("textarea").first()).toBeVisible({ timeout: 10000 });
}

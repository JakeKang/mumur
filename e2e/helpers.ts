import { expect, Page } from "@playwright/test";

const LOCAL_TESTER = {
  name: "Local Tester",
  email: "localtester@mumur.local",
  password: "mumur1234!",
  teamName: "Local Tester Workspace"
};

async function applySessionCookieFromResponse(page: Page, response: { headers(): Record<string, string> }) {
  const setCookie = response.headers()["set-cookie"] || "";
  const sessionPair = setCookie.split(",").find((part) => part.includes("mumur_session=")) || setCookie;
  const nameValue = sessionPair.split(";", 1)[0] || "";
  const [name, ...valueParts] = nameValue.split("=");
  const value = valueParts.join("=");

  if (!name || !value) {
    return;
  }

  await page.context().addCookies([
    {
      name,
      value,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax"
    }
  ]);
}

async function ensureLocalTesterSession(page: Page) {
  const loginRes = await page.request.post("/api/auth/login", {
    data: { email: LOCAL_TESTER.email, password: LOCAL_TESTER.password }
  });

  if (loginRes.ok()) {
    await applySessionCookieFromResponse(page, loginRes);
    return;
  }

  expect(loginRes.status(), "unexpected login bootstrap status").toBe(401);

  const registerRes = await page.request.post("/api/auth/register", {
    data: {
      name: LOCAL_TESTER.name,
      email: LOCAL_TESTER.email,
      password: LOCAL_TESTER.password,
      teamName: LOCAL_TESTER.teamName
    }
  });

  expect([201, 409]).toContain(registerRes.status());

  if (registerRes.status() === 409) {
    const retryLoginRes = await page.request.post("/api/auth/login", {
      data: { email: LOCAL_TESTER.email, password: LOCAL_TESTER.password }
    });
    expect(retryLoginRes.ok()).toBeTruthy();
    await applySessionCookieFromResponse(page, retryLoginRes);
    return;
  }

  await applySessionCookieFromResponse(page, registerRes);
}

export async function loginAsLocalTester(page: Page) {
  await ensureLocalTesterSession(page);
  await page.goto("/");

  const meBeforeUiLogin = await page.request.get("/api/auth/me");
  if (!meBeforeUiLogin.ok() && await page.getByPlaceholder("이메일").isVisible()) {
    const loginForm = page.locator("form").first();
    await page.getByPlaceholder("이메일").fill(LOCAL_TESTER.email);
    await page.getByPlaceholder("비밀번호").fill(LOCAL_TESTER.password);
    await loginForm.getByRole("button", { name: "로그인" }).click();
  }

  await expect.poll(async () => {
    const meRes = await page.request.get("/api/auth/me");
    return meRes.status();
  }).toBe(200);

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
    await expect.poll(async () => {
      const meRes = await page.request.get("/api/auth/me");
      return meRes.status();
    }).toBe(200);
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
  return body.idea as { id: number; teamId: number; title: string };
}

export async function navigateToIdea(page: Page, ideaId: number) {
  await page.goto(`/?idea=${ideaId}`);
  await expect(page.locator("textarea").first()).toBeVisible({ timeout: 10000 });
}

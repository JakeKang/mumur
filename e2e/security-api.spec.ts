import { expect, test } from "@playwright/test";
import { createIdeaViaApi, loginAsLocalTester } from "./helpers";

async function applySessionCookieFromResponse(page: { context(): { addCookies(cookies: any[]): Promise<void> } }, response: { headers(): Record<string, string> }) {
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
      sameSite: "Lax",
    },
  ]);
}

test("malformed JSON is rejected on protected comment mutation", async ({ page }) => {
  await loginAsLocalTester(page);
  const idea = await createIdeaViaApi(page, `Security malformed ${Date.now()}`);
  await page.goto(`/?idea=${idea.id}`);

  const result = await page.evaluate(async ({ ideaId }) => {
    const response = await fetch(`/api/ideas/${ideaId}/comments`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: "{invalid-json",
    });
    return {
      status: response.status,
      body: await response.json(),
    };
  }, { ideaId: idea.id });

  expect(result.status).toBe(400);
  const body = result.body;
  expect(String(body?.error || "")).toContain("유효한 JSON");
});

test("cross-origin protected mutation is rejected", async ({ page }) => {
  await loginAsLocalTester(page);
  const idea = await createIdeaViaApi(page, `Security origin ${Date.now()}`);

  const response = await page.request.post(`/api/ideas/${idea.id}/comments`, {
    headers: { origin: "https://evil.example" },
    data: {
      content: "blocked cross-origin mutation",
      blockId: "",
    },
  });

  expect(response.status()).toBe(403);
  const body = await response.json();
  expect(String(body?.error || "")).toContain("허용되지 않은 요청 출처");
});

test("comment mutation rate limit returns 429 after threshold", async ({ page }) => {
  await loginAsLocalTester(page);
  const idea = await createIdeaViaApi(page, `Security rate limit ${Date.now()}`);

  for (let idx = 0; idx < 6; idx += 1) {
    const response = await page.request.post(`/api/ideas/${idea.id}/comments`, {
      data: {
        content: `rate limited comment ${idx}`,
        blockId: "",
      },
    });
    expect(response.ok()).toBeTruthy();
  }

  const blocked = await page.request.post(`/api/ideas/${idea.id}/comments`, {
    data: {
      content: "rate limited comment blocked",
      blockId: "",
    },
  });

  expect(blocked.status()).toBe(429);
  expect(blocked.headers()["retry-after"]).toBeTruthy();
});

test("reaction mutation rate limit returns 429 after threshold", async ({ page }) => {
  await loginAsLocalTester(page);
  const idea = await createIdeaViaApi(page, `Security reaction limit ${Date.now()}`);

  for (let idx = 0; idx < 12; idx += 1) {
    const response = await page.request.post(`/api/ideas/${idea.id}/reactions`, {
      data: {
        emoji: `reaction-${idx}`,
        targetType: "idea",
        targetId: "",
      },
    });
    expect(response.ok()).toBeTruthy();
  }

  const blocked = await page.request.post(`/api/ideas/${idea.id}/reactions`, {
    data: {
      emoji: "reaction-blocked",
      targetType: "idea",
      targetId: "",
    },
  });

  expect(blocked.status()).toBe(429);
  expect(blocked.headers()["retry-after"]).toBeTruthy();
});

test("webhook save rejects localhost/private targets", async ({ page }) => {
  await loginAsLocalTester(page);

  const response = await page.request.put("/api/integrations/webhooks/slack", {
    data: {
      webhookUrl: "https://localhost/hook",
      enabled: true,
    },
  });

  expect(response.status()).toBe(400);
  const body = await response.json();
  expect(String(body?.error || "")).toContain("유효하지 않은 웹훅 URL");
});

test("upload rejects unsupported file extension", async ({ page }) => {
  await loginAsLocalTester(page);
  const idea = await createIdeaViaApi(page, `Security upload ${Date.now()}`);
  const detailRes = await page.request.get(`/api/ideas/${idea.id}`);
  expect(detailRes.ok()).toBeTruthy();
  const detailBody = await detailRes.json();
  const firstBlockId = String(detailBody?.idea?.blocks?.[0]?.id || "");
  const baseUpdatedAt = Number(detailBody?.idea?.updatedAt || 0);
  expect(firstBlockId).toBeTruthy();
  expect(baseUpdatedAt).toBeGreaterThan(0);

  const result = await page.evaluate(async ({ ideaId, blockId, updatedAt }) => {
    const form = new FormData();
    form.append("baseUpdatedAt", String(updatedAt));
    const file = new File(["malware"], "payload.exe", { type: "application/octet-stream" });
    form.append("file", file);
    const response = await fetch(`/api/ideas/${ideaId}/blocks/${blockId}/file`, {
      method: "POST",
      credentials: "include",
      body: form,
    });
    return {
      status: response.status,
      body: await response.json(),
    };
  }, { ideaId: idea.id, blockId: firstBlockId, updatedAt: baseUpdatedAt });

  expect(result.status).toBe(415);
  expect(String(result.body?.error || "")).toContain("확장자");
});

test("upload rejects MIME spoofing and does not corrupt persisted blocks", async ({ page }) => {
  await loginAsLocalTester(page);
  const idea = await createIdeaViaApi(page, `Security upload spoof ${Date.now()}`);
  const detailRes = await page.request.get(`/api/ideas/${idea.id}`);
  expect(detailRes.ok()).toBeTruthy();
  const detailBody = await detailRes.json();
  const blocksBefore = Array.isArray(detailBody?.idea?.blocks) ? detailBody.idea.blocks : [];
  const firstBlockId = String(blocksBefore?.[0]?.id || "");
  const baseUpdatedAt = Number(detailBody?.idea?.updatedAt || 0);
  expect(firstBlockId).toBeTruthy();
  expect(baseUpdatedAt).toBeGreaterThan(0);
  expect(String(blocksBefore?.[0]?.type || "")).toBeTruthy();

  const response = await page.request.post(`/api/ideas/${idea.id}/blocks/${firstBlockId}/file`, {
    multipart: {
      baseUpdatedAt: String(baseUpdatedAt),
      file: {
        name: "payload.png",
        mimeType: "text/html",
        buffer: Buffer.from("<!doctype html><html><body>not-an-image</body></html>"),
      },
    },
  });

  expect(response.status()).toBe(415);
  const body = await response.json();
  expect(String(body?.error || "")).toContain("보안");

  const afterRes = await page.request.get(`/api/ideas/${idea.id}`);
  expect(afterRes.ok()).toBeTruthy();
  const afterBody = await afterRes.json();
  const blocksAfter = Array.isArray(afterBody?.idea?.blocks) ? afterBody.idea.blocks : [];
  expect(String(blocksAfter?.[0]?.id || "")).toBe(firstBlockId);
  expect(afterBody?.idea?.updatedAt).toBe(baseUpdatedAt);
  expect(blocksAfter?.[0]?.type).toBe(blocksBefore?.[0]?.type);
  expect(blocksAfter?.[0]?.content).toBe(blocksBefore?.[0]?.content);
});

test("upload mutation rate limit returns 429 after threshold", async ({ page }) => {
  await loginAsLocalTester(page);
  const idea = await createIdeaViaApi(page, `Security upload limit ${Date.now()}`);
  const detailRes = await page.request.get(`/api/ideas/${idea.id}`);
  expect(detailRes.ok()).toBeTruthy();
  const detailBody = await detailRes.json();
  const firstBlockId = String(detailBody?.idea?.blocks?.[0]?.id || "");
  const baseUpdatedAt = Number(detailBody?.idea?.updatedAt || 0);
  expect(firstBlockId).toBeTruthy();
  expect(baseUpdatedAt).toBeGreaterThan(0);

  for (let idx = 0; idx < 4; idx += 1) {
    const response = await page.request.post(`/api/ideas/${idea.id}/blocks/${firstBlockId}/file`, {
      multipart: {
        baseUpdatedAt: String(baseUpdatedAt),
        file: {
          name: `payload-${idx}.exe`,
          mimeType: "application/octet-stream",
          buffer: Buffer.from("malware"),
        },
      },
    });
    expect(response.status()).toBe(415);
    const body = await response.json();
    expect(String(body?.error || "")).toContain("확장자");
  }

  const blocked = await page.request.post(`/api/ideas/${idea.id}/blocks/${firstBlockId}/file`, {
    multipart: {
      baseUpdatedAt: String(baseUpdatedAt),
      file: {
        name: "payload-blocked.exe",
        mimeType: "application/octet-stream",
        buffer: Buffer.from("malware"),
      },
    },
  });

  expect(blocked.status()).toBe(429);
  expect(blocked.headers()["retry-after"]).toBeTruthy();
});

test("workspace views enforce explicit role checks for GET/POST", async ({ page, browser }) => {
  await loginAsLocalTester(page);
  const ownerMeRes = await page.request.get("/api/auth/me");
  expect(ownerMeRes.ok()).toBeTruthy();
  const ownerMe = await ownerMeRes.json();
  const ownerWorkspaceId = Number(ownerMe?.workspace?.id || 0);
  expect(ownerWorkspaceId).toBeGreaterThan(0);

  const viewerContext = await browser.newContext();
  const viewerPage = await viewerContext.newPage();
  const viewerEmail = `viewer-${Date.now()}@mumur.local`;
  const viewerPassword = "mumur1234!";

  const registerRes = await viewerPage.request.post("/api/auth/register", {
    data: {
      name: "Viewer",
      email: viewerEmail,
      password: viewerPassword,
      teamName: `Viewer Team ${Date.now()}`,
    },
  });
  expect(registerRes.status()).toBe(201);
  await applySessionCookieFromResponse(viewerPage, registerRes);

  const viewerMeRes = await viewerPage.request.get("/api/auth/me");
  expect(viewerMeRes.ok()).toBeTruthy();
  const viewerMe = await viewerMeRes.json();
  const viewerUserId = Number(viewerMe?.user?.id || 0);
  expect(viewerUserId).toBeGreaterThan(0);

  const inviteRes = await page.request.post("/api/workspace/invitations", {
    data: {
      email: viewerEmail,
      role: "viewer",
    },
  });
  expect(inviteRes.status()).toBe(201);
  const inviteBody = await inviteRes.json();
  const invitationId = Number(inviteBody?.invitation?.id || 0);
  expect(invitationId).toBeGreaterThan(0);

  const acceptRes = await viewerPage.request.post(`/api/workspace/invitations/${invitationId}/accept`);
  expect(acceptRes.ok()).toBeTruthy();

  const switchRes = await viewerPage.request.post("/api/workspaces/switch", {
    data: { teamId: ownerWorkspaceId },
  });
  expect(switchRes.ok()).toBeTruthy();

  const canRead = await viewerPage.request.get("/api/workspace/views");
  expect(canRead.ok()).toBeTruthy();

  const cannotWrite = await viewerPage.request.post("/api/workspace/views", {
    data: { name: `Viewer View ${Date.now()}`, config: {} },
  });
  expect(cannotWrite.status()).toBe(403);

  const removeRes = await page.request.delete(`/api/workspace/members/${viewerUserId}`);
  expect(removeRes.ok()).toBeTruthy();

  const cannotRead = await viewerPage.request.get("/api/workspace/views");
  expect(cannotRead.status()).toBe(403);

  await viewerContext.close();
});

import { expect, test, type Page } from "@playwright/test";
import WebSocket from "ws";
import * as Y from "yjs";
import { loginAsLocalTester, createIdeaViaApi, navigateToIdea } from "./helpers";
import { getCursorLineLabel, shouldApplyIncomingRemoteSnapshot } from "@/features/ideas/components/editor/BlockEditor";
import { rebaseIdeaDraftConservatively } from "@/features/ideas/utils/conservative-idea-rebase";
import type { Idea } from "@/shared/types";

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
      sameSite: "Lax",
    },
  ]);
}

async function registerInvitedMember(page: Page, suffix: string) {
  const member = {
    name: `Presence Member ${suffix}`,
    email: `presence-member-${suffix}@mumur.local`,
    password: "mumur1234!",
    teamName: `Presence Workspace ${suffix}`,
  };

  const registerRes = await page.request.post("/api/auth/register", {
    data: member,
  });
  expect([201, 409]).toContain(registerRes.status());

  if (registerRes.ok()) {
    await applySessionCookieFromResponse(page, registerRes);
  } else {
    const loginRes = await page.request.post("/api/auth/login", {
      data: { email: member.email, password: member.password },
    });
    expect(loginRes.ok()).toBeTruthy();
    await applySessionCookieFromResponse(page, loginRes);
  }

  await page.goto("/");
  return member;
}

async function inviteMemberToIdeaWorkspace(adminPage: Page, email: string) {
  const inviteRes = await adminPage.request.post("/api/workspace/invitations", {
    data: { email, role: "editor" },
  });
  expect(inviteRes.ok()).toBeTruthy();
  const inviteBody = await inviteRes.json();
  return Number(inviteBody?.invitation?.id);
}

async function acceptInvitationAndSwitchWorkspace(page: Page, invitationId: number) {
  const acceptRes = await page.request.post(`/api/workspace/invitations/${invitationId}/accept`);
  expect(acceptRes.ok()).toBeTruthy();
  const acceptBody = await acceptRes.json();
  const workspaceId = Number(acceptBody?.workspace?.id);
  expect(workspaceId).toBeGreaterThan(0);

  const switchRes = await page.request.post("/api/workspaces/switch", {
    data: { teamId: workspaceId },
  });
  expect(switchRes.ok()).toBeTruthy();
  await page.goto("/");
}

async function sessionCookieHeader(page: Page) {
  const cookies = await page.context().cookies();
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

function ideaRoomWsUrl(ideaId: number) {
  return `ws://127.0.0.1:3100/ws/ideas/${ideaId}`;
}

function waitForRoomBootstrap(ws: WebSocket, timeoutMs = 7000) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("timed out waiting for room bootstrap"));
    }, timeoutMs);

    const onMessage = (raw: WebSocket.RawData) => {
      try {
        const parsed = JSON.parse(String(raw || "{}")) as Record<string, unknown>;
        if (parsed.event !== "collab.bootstrap") {
          return;
        }
        cleanup();
        resolve(parsed);
      } catch (error) {
        cleanup();
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const onClose = () => {
      cleanup();
      reject(new Error("websocket closed before bootstrap completed"));
    };

    const cleanup = () => {
      clearTimeout(timeout);
      ws.off("message", onMessage);
      ws.off("error", onError);
      ws.off("close", onClose);
    };

    ws.on("message", onMessage);
    ws.on("error", onError);
    ws.on("close", onClose);
  });
}

function waitForSocketEvent(ws: WebSocket, predicate: (payload: Record<string, unknown>) => boolean, timeoutMs = 7000) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("timed out waiting for websocket message"));
    }, timeoutMs);

    const onMessage = (raw: WebSocket.RawData) => {
      try {
        const parsed = JSON.parse(String(raw || "{}")) as Record<string, unknown>;
        if (!predicate(parsed)) {
          return;
        }
        cleanup();
        resolve(parsed);
      } catch (error) {
        cleanup();
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const onClose = () => {
      cleanup();
      reject(new Error("websocket closed before expected message"));
    };

    const cleanup = () => {
      clearTimeout(timeout);
      ws.off("message", onMessage);
      ws.off("error", onError);
      ws.off("close", onClose);
    };

    ws.on("message", onMessage);
    ws.on("error", onError);
    ws.on("close", onClose);
  });
}

async function connectIdeaRoom(page: Page, ideaId: number) {
  const cookie = await sessionCookieHeader(page);
  const ws = new WebSocket(ideaRoomWsUrl(ideaId), {
    headers: { Cookie: cookie },
  });
  const bootstrap = await waitForRoomBootstrap(ws);
  const doc = new Y.Doc();
  Y.applyUpdate(doc, Buffer.from(String((bootstrap.payload as { update?: string } | undefined)?.update || ""), "base64"));
  return { ws, doc };
}

function replaceYText(text: Y.Text, value: string) {
  if (text.length > 0) {
    text.delete(0, text.length);
  }
  if (value) {
    text.insert(0, value);
  }
}

function mutateFirstBlock(doc: Y.Doc, mutate: (blockMap: Y.Map<unknown>) => void) {
  mutateBlockAt(doc, 0, mutate);
}

function mutateBlockAt(doc: Y.Doc, index: number, mutate: (blockMap: Y.Map<unknown>) => void) {
  const blocksArray = doc.getArray<Y.Map<unknown>>("idea:blocks");
  const blockMap = blocksArray.get(index);
  if (!blockMap) {
    throw new Error(`missing collaboration block at index ${index}`);
  }
  doc.transact(() => {
    mutate(blockMap);
  });
}

function publishCollabUpdate(ws: WebSocket, doc: Y.Doc) {
  const update = Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64");
  ws.send(JSON.stringify({ event: "collab.update", payload: { update } }));
}

function readCollabSnapshot(doc: Y.Doc) {
  const blocksArray = doc.getArray<Y.Map<unknown>>("idea:blocks");
  return {
    title: doc.getText("idea:title").toString(),
    blocks: blocksArray.toArray().map((block) => {
      const content = block.get("content");
      return {
        id: String(block.get("id") || ""),
        type: String(block.get("type") || "paragraph"),
        content: content instanceof Y.Text ? content.toString() : String(content || ""),
        checked: Boolean(block.get("checked")),
      };
    }),
  };
}

function buildIdeaForRebase(overrides: Partial<Idea>): Idea {
  return {
    id: 1,
    workspaceId: 1,
    teamId: 1,
    authorId: 1,
    title: "base-title",
    category: "qa",
    status: "seed",
    blocks: [
      { id: "b-1", type: "paragraph", content: "base-1", checked: false },
      { id: "b-2", type: "paragraph", content: "base-2", checked: false },
    ],
    createdAt: 1,
    updatedAt: 100,
    ...overrides,
  };
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

test("comment can be added from editor workspace", async ({ page }) => {
  await loginAsLocalTester(page);

  const ideaTitle = `E2E 댓글 ${Date.now()}`;
  const idea = await createIdeaViaApi(page, ideaTitle);
  await navigateToIdea(page, idea.id);

  await page.getByRole("button", { name: "문서 댓글 스레드 열기" }).click();

  const commentInput = page.getByLabel("문서 댓글 입력");
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

test("offline autosave keeps a recoverable local draft and queued sync entry", async ({ page }) => {
  await loginAsLocalTester(page);

  const ideaTitle = `E2E offline draft ${Date.now()}`;
  const idea = await createIdeaViaApi(page, ideaTitle);
  await navigateToIdea(page, idea.id);

  const titleInput = page.locator("textarea").first();
  const offlineTitle = `오프라인 드래프트 ${Date.now()}`;

  await page.context().setOffline(true);
  await titleInput.click();
  await titleInput.fill(offlineTitle);
  await page.waitForTimeout(2500);

  const stored = await page.evaluate((ideaId) => {
    const draftRaw = window.localStorage.getItem(`mumur.ideaDraft.${ideaId}`);
    const queueRaw = window.localStorage.getItem("mumur.ideaSyncQueue");
    return {
      draft: draftRaw ? JSON.parse(draftRaw) : null,
      queue: queueRaw ? JSON.parse(queueRaw) : [],
    };
  }, idea.id);

  expect(stored.draft?.payload?.title).toBe(offlineTitle);
  expect(stored.queue).toEqual(expect.arrayContaining([
    expect.objectContaining({
      ideaId: idea.id,
      payload: expect.objectContaining({ title: offlineTitle }),
      mode: expect.any(String),
    })
  ]));

  await page.context().setOffline(false);
});

test("collab provider reconnect rehydrates server state without duplicating blocks", async ({ page }) => {
  test.skip(process.env.NEXT_PUBLIC_ENABLE_IDEA_COLLAB !== "true", "collab feature flag disabled");

  await loginAsLocalTester(page);

  const ideaTitle = `E2E collab provider reconnect ${Date.now()}`;
  const blocks = [
    { id: `b-a-${Date.now()}`, type: "paragraph", content: "base-a", checked: false },
    { id: `b-b-${Date.now()}`, type: "paragraph", content: "base-b", checked: false },
  ];
  const createRes = await page.request.post("/api/ideas", {
    data: {
      title: ideaTitle,
      category: "qa",
      status: "seed",
      blocks,
    },
  });
  expect(createRes.ok()).toBeTruthy();
  const createBody = await createRes.json();
  const idea = createBody.idea as { id: number };

  await navigateToIdea(page, idea.id);

  const cookie = await sessionCookieHeader(page);
  const remoteRoom = new WebSocket(ideaRoomWsUrl(idea.id), {
    headers: { Cookie: cookie },
  });

  try {
    const bootstrap = await waitForRoomBootstrap(remoteRoom);
    const remoteDoc = new Y.Doc();
    Y.applyUpdate(remoteDoc, Buffer.from(String((bootstrap.payload as { update?: string } | undefined)?.update || ""), "base64"));

    await page.context().setOffline(true);

    const reconnectTitle = `reconnected title ${Date.now()}`;
    const reconnectBlock = `reconnected block ${Date.now()}`;
    const titleText = remoteDoc.getText("idea:title");
    titleText.delete(0, titleText.length);
    titleText.insert(0, reconnectTitle);
    mutateBlockAt(remoteDoc, 1, (blockMap) => {
      const content = blockMap.get("content");
      if (!(content instanceof Y.Text)) {
        throw new Error("expected Y.Text block content");
      }
      replaceYText(content, reconnectBlock);
    });
    publishCollabUpdate(remoteRoom, remoteDoc);

    await page.context().setOffline(false);

    const titleInput = page.locator("textarea").first();
    const blockRegion = page.getByRole("region", { name: "블록 에디터" });
    const blockParagraphs = blockRegion.locator("p");
    await expect(titleInput).toHaveValue(reconnectTitle, { timeout: 15000 });
    await expect(blockParagraphs).toHaveCount(2);
    await expect(blockParagraphs).toHaveText(["base-a", reconnectBlock]);
    await expect(blockRegion.getByText("base-a", { exact: true })).toHaveCount(1);
    await expect(blockRegion.getByText(reconnectBlock, { exact: true })).toHaveCount(1);
  } finally {
    remoteRoom.close();
    await page.context().setOffline(false);
  }
});

test("collab reconnect converges offline edits without duplicate replay", async ({ browser }) => {
  test.skip(process.env.NEXT_PUBLIC_ENABLE_IDEA_COLLAB !== "true", "collab feature flag disabled");

  const onlineContext = await browser.newContext();
  const offlineContext = await browser.newContext();
  const onlinePage = await onlineContext.newPage();
  const offlinePage = await offlineContext.newPage();

  try {
    await loginAsLocalTester(onlinePage);
    await loginAsLocalTester(offlinePage);

    const ideaTitle = `E2E collab reconnect ${Date.now()}`;
    const blocks = [
      { id: `b-a-${Date.now()}`, type: "paragraph", content: "base-a", checked: false },
      { id: `b-b-${Date.now()}`, type: "paragraph", content: "base-b", checked: false },
    ];
    const createRes = await onlinePage.request.post("/api/ideas", {
      data: {
        title: ideaTitle,
        category: "qa",
        status: "seed",
        blocks,
      },
    });
    expect(createRes.ok()).toBeTruthy();
    const createBody = await createRes.json();
    const idea = createBody.idea as { id: number };

    await navigateToIdea(onlinePage, idea.id);
    await navigateToIdea(offlinePage, idea.id);
    await onlinePage.waitForTimeout(2500);
    await offlinePage.waitForTimeout(2500);

    const onlineRoom = await connectIdeaRoom(onlinePage, idea.id);
    const offlineRoom = await connectIdeaRoom(offlinePage, idea.id);
    const offlineCookie = await sessionCookieHeader(offlinePage);
    let reconnectSocket: WebSocket | null = null;

    try {
      await offlineContext.setOffline(true);
      offlineRoom.ws.close();

      mutateFirstBlock(offlineRoom.doc, (blockMap) => {
        const content = blockMap.get("content");
        if (!(content instanceof Y.Text)) {
          throw new Error("expected Y.Text block content");
        }
        replaceYText(content, "offline edit");
      });

      mutateBlockAt(onlineRoom.doc, 1, (blockMap) => {
        const content = blockMap.get("content");
        if (!(content instanceof Y.Text)) {
          throw new Error("expected Y.Text block content");
        }
        replaceYText(content, "remote edit");
      });
      publishCollabUpdate(onlineRoom.ws, onlineRoom.doc);

      await offlineContext.setOffline(false);
      reconnectSocket = new WebSocket(ideaRoomWsUrl(idea.id), {
        headers: { Cookie: offlineCookie },
      });
      const reconnectBootstrap = await waitForRoomBootstrap(reconnectSocket);
      Y.applyUpdate(offlineRoom.doc, Buffer.from(String((reconnectBootstrap.payload as { update?: string } | undefined)?.update || ""), "base64"));

      publishCollabUpdate(reconnectSocket, offlineRoom.doc);
      publishCollabUpdate(reconnectSocket, offlineRoom.doc);

      const firstReplay = await waitForSocketEvent(onlineRoom.ws, (payload) => payload.event === "collab.update");
      const secondReplay = await waitForSocketEvent(onlineRoom.ws, (payload) => payload.event === "collab.update");
      Y.applyUpdate(onlineRoom.doc, Buffer.from(String((firstReplay.payload as { update?: string } | undefined)?.update || ""), "base64"));
      Y.applyUpdate(onlineRoom.doc, Buffer.from(String((secondReplay.payload as { update?: string } | undefined)?.update || ""), "base64"));

      const expectedSnapshot = {
        title: ideaTitle,
        blocks: [
          { id: blocks[0].id, type: "paragraph", content: "offline edit", checked: false },
          { id: blocks[1].id, type: "paragraph", content: "remote edit", checked: false },
        ],
      };

      expect(readCollabSnapshot(offlineRoom.doc)).toEqual(expectedSnapshot);
      expect(readCollabSnapshot(onlineRoom.doc)).toEqual(expectedSnapshot);

      const verifier = await connectIdeaRoom(onlinePage, idea.id);
      try {
        expect(readCollabSnapshot(verifier.doc)).toEqual(expectedSnapshot);
      } finally {
        verifier.ws.close();
      }
    } finally {
      reconnectSocket?.close();
      onlineRoom.ws.close();
      if (offlineRoom.ws.readyState === WebSocket.OPEN || offlineRoom.ws.readyState === WebSocket.CONNECTING) {
        offlineRoom.ws.close();
      }
      await offlineContext.setOffline(false);
    }
  } finally {
    await onlineContext.close();
    await offlineContext.close();
  }
});

test("new collaborative blocks accept live block comments and mentions without refresh", async ({ browser }) => {
  test.skip(process.env.NEXT_PUBLIC_ENABLE_IDEA_COLLAB !== "true", "collab feature flag disabled");
  test.setTimeout(120000);

  const adminContext = await browser.newContext();
  const memberContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  const memberPage = await memberContext.newPage();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    await loginAsLocalTester(adminPage);
    const member = await registerInvitedMember(memberPage, suffix);

    const idea = await createIdeaViaApi(adminPage, `E2E live block comment ${suffix}`);
    const invitationId = await inviteMemberToIdeaWorkspace(adminPage, member.email);
    await acceptInvitationAndSwitchWorkspace(memberPage, invitationId);

    const markNotificationsRead = await adminPage.request.post("/api/notifications/read-all");
    expect(markNotificationsRead.ok()).toBeTruthy();
    const resetNotificationPreferences = await adminPage.request.put("/api/notifications/preferences", {
      data: { mutedTypes: [] },
    });
    expect(resetNotificationPreferences.ok()).toBeTruthy();

    await navigateToIdea(adminPage, idea.id);
    await navigateToIdea(memberPage, idea.id);
    await adminPage.waitForTimeout(2500);
    await memberPage.waitForTimeout(2500);

    const newBlockText = `새 협업 블록 ${suffix}`;
    await memberPage.getByRole("button", { name: "새 블록 추가" }).click();
    const memberBlockTextarea = memberPage.locator('[aria-label="블록 에디터"] textarea').last();
    await expect(memberBlockTextarea).toBeVisible();
    await memberBlockTextarea.fill(newBlockText);

    const memberLastBlockRow = memberPage.locator('[data-block-editor] section').last();
    await memberLastBlockRow.hover();
    await memberLastBlockRow.getByRole("button", { name: "블록 댓글" }).click();

    const blockCommentInput = memberPage.getByLabel("블록 댓글 입력");
    await expect(blockCommentInput).toBeVisible({ timeout: 10000 });
    await blockCommentInput.fill("@local");
    await expect(memberPage.getByRole("listbox", { name: "블록 댓글 멘션 후보" })).toBeVisible({ timeout: 10000 });
    await memberPage.getByRole("option", { name: /Local Tester.*localtester@mumur\.local/i }).click();

    const blockCommentText = `블록 댓글 멘션 ${suffix}`;
    await memberPage.keyboard.type(blockCommentText);
    const memberBlockCommentForm = memberPage.locator("form").filter({ has: blockCommentInput }).first();
    await memberBlockCommentForm.getByRole("button", { name: "등록" }).click();

    await expect(memberPage.getByText(blockCommentText)).toBeVisible({ timeout: 10000 });

    await expect.poll(async () => {
      const commentsRes = await adminPage.request.get(`/api/ideas/${idea.id}/comments`);
      expect(commentsRes.ok()).toBeTruthy();
      const commentsBody = await commentsRes.json();
      const comments = Array.isArray(commentsBody?.comments) ? commentsBody.comments : [];
      return comments.some((comment: { blockId?: string | null; content?: string | null }) => {
        const content = String(comment?.content || "");
        return Boolean(comment?.blockId) && content.includes(blockCommentText) && /@localtester/i.test(content);
      });
    }, { timeout: 10000 }).toBe(true);
  } finally {
    await adminContext.close();
    await memberContext.close();
  }
});

test("global comments, reactions, and timeline stay live across collaborators", async ({ browser }) => {
  test.skip(process.env.NEXT_PUBLIC_ENABLE_IDEA_COLLAB !== "true", "collab feature flag disabled");
  test.setTimeout(120000);

  const adminContext = await browser.newContext();
  const memberContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  const memberPage = await memberContext.newPage();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    await loginAsLocalTester(adminPage);
    const member = await registerInvitedMember(memberPage, suffix);

    const idea = await createIdeaViaApi(adminPage, `E2E live thread ${suffix}`);
    const invitationId = await inviteMemberToIdeaWorkspace(adminPage, member.email);
    await acceptInvitationAndSwitchWorkspace(memberPage, invitationId);

    await navigateToIdea(adminPage, idea.id);
    await navigateToIdea(memberPage, idea.id);
    await adminPage.waitForTimeout(2500);
    await memberPage.waitForTimeout(2500);

    await adminPage.getByRole("button", { name: "문서 댓글 스레드 열기" }).click();
    await memberPage.getByRole("button", { name: "문서 댓글 스레드 열기" }).click();

    const memberCommentInput = memberPage.getByLabel("문서 댓글 입력");
    const commentText = `글로벌 실시간 댓글 ${suffix}`;
    await memberCommentInput.fill(commentText);
    const memberCommentForm = memberPage.locator("form").filter({ has: memberCommentInput }).first();
    await memberCommentForm.getByRole("button", { name: "등록" }).click();

    const memberThreadPanel = memberPage.locator("#global-comment-thread-panel");
    const adminThreadPanel = adminPage.locator("#global-comment-thread-panel");
    await expect(memberThreadPanel.getByText(commentText)).toBeVisible({ timeout: 10000 });
    await expect(adminThreadPanel.getByText(commentText)).toBeVisible({ timeout: 10000 });

    await adminPage.waitForFunction((text) => {
      const panel = document.querySelector("#global-comment-thread-panel");
      return Boolean(panel && (panel.textContent || "").includes(String(text || "")));
    }, commentText, { timeout: 10000 });
    await expect(adminPage.getByText(commentText)).toBeVisible({ timeout: 10000 });
    await expect(memberThreadPanel.getByRole("button", { name: /👍 0/ }).first()).toBeVisible({ timeout: 10000 });

    await memberThreadPanel.getByRole("button", { name: /👍 0/ }).first().click();
    await expect(memberThreadPanel.getByRole("button", { name: /👍 1/ }).first()).toBeVisible({ timeout: 10000 });

    await expect.poll(async () => {
      const timelineRes = await adminPage.request.get(`/api/ideas/${idea.id}/timeline`);
      expect(timelineRes.ok()).toBeTruthy();
      const timelineBody = await timelineRes.json();
      const events = Array.isArray(timelineBody?.timeline) ? timelineBody.timeline : [];
      return events
        .map((event: { type?: string | null }) => String(event?.type || ""))
        .filter((type: string) => type === "comment.created" || type === "reaction.added")
        .sort();
    }, { timeout: 10000 }).toEqual(["comment.created", "reaction.added"]);
  } finally {
    await adminContext.close();
    await memberContext.close();
  }
});

test("presence typing and leave feedback update live in the idea editor", async ({ browser }) => {
  test.skip(process.env.NEXT_PUBLIC_ENABLE_IDEA_COLLAB !== "true", "collab feature flag disabled");
  test.setTimeout(120000);

  const adminContext = await browser.newContext();
  const memberContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  const memberPage = await memberContext.newPage();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let memberContextClosed = false;

  try {
    await loginAsLocalTester(adminPage);
    const member = await registerInvitedMember(memberPage, suffix);

    const idea = await createIdeaViaApi(adminPage, `E2E presence typing ${suffix}`);
    const invitationId = await inviteMemberToIdeaWorkspace(adminPage, member.email);
    await acceptInvitationAndSwitchWorkspace(memberPage, invitationId);

    await navigateToIdea(adminPage, idea.id);
    const detailRes = await adminPage.request.get(`/api/ideas/${idea.id}`);
    expect(detailRes.ok()).toBeTruthy();
    const detailBody = await detailRes.json();
    const blockId = String(detailBody?.idea?.blocks?.[0]?.id || "");
    expect(blockId).toBeTruthy();

    const typingPresenceRes = await memberPage.request.post(`/api/ideas/${idea.id}/presence`, {
      data: { blockId, cursorOffset: 0, typing: true },
    });
    expect(typingPresenceRes.ok()).toBeTruthy();
    await expect(adminPage.locator(`[title="${member.name} · 입력 중"]`)).toBeVisible({ timeout: 10000 });

    await memberContext.close();
    memberContextClosed = true;
    await expect(adminPage.locator(`[title="${member.name} · 입력 중"]`)).toHaveCount(0, { timeout: 22000 });
  } finally {
    await adminContext.close();
    if (!memberContextClosed) {
      await memberContext.close();
    }
  }
});

test("presence expires automatically after TTL without manual refresh", async ({ browser }) => {
  test.skip(process.env.NEXT_PUBLIC_ENABLE_IDEA_COLLAB !== "true", "collab feature flag disabled");
  test.setTimeout(120000);

  const adminContext = await browser.newContext();
  const memberContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  const memberPage = await memberContext.newPage();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    await loginAsLocalTester(adminPage);
    const member = await registerInvitedMember(memberPage, suffix);

    const idea = await createIdeaViaApi(adminPage, `E2E presence ttl ${suffix}`);
    const invitationId = await inviteMemberToIdeaWorkspace(adminPage, member.email);
    await acceptInvitationAndSwitchWorkspace(memberPage, invitationId);

    await navigateToIdea(adminPage, idea.id);

    const presenceRes = await memberPage.request.post(`/api/ideas/${idea.id}/presence`, {
      data: {
        blockId: String((await (await adminPage.request.get(`/api/ideas/${idea.id}`)).json())?.idea?.blocks?.[0]?.id || ""),
        cursorOffset: 0,
        typing: false,
      },
    });
    expect(presenceRes.ok()).toBeTruthy();

    await expect(adminPage.locator(`[title="${member.name} · 1줄"]`)).toBeVisible({ timeout: 10000 });
    await expect(adminPage.locator(`[title="${member.name} · 1줄"]`)).toHaveCount(0, { timeout: 22000 });
  } finally {
    await adminContext.close();
    await memberContext.close();
  }
});

test("stale concurrent idea save returns conflict instead of silent overwrite", async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await loginAsLocalTester(pageA);
    await loginAsLocalTester(pageB);

    const ideaTitle = `E2E conflict ${Date.now()}`;
    const idea = await createIdeaViaApi(pageA, ideaTitle);
    const blocks = [{ id: `b-${Date.now()}`, type: "paragraph", content: "base", checked: false }];
    const detailRes = await pageA.request.get(`/api/ideas/${idea.id}`);
    expect(detailRes.ok()).toBeTruthy();
    const detailBody = await detailRes.json();
    const baseUpdatedAt = Number(detailBody?.idea?.updatedAt || 0);

    const firstSave = await pageA.request.put(`/api/ideas/${idea.id}`, {
      data: {
        title: `${ideaTitle} A`,
        category: "qa",
        status: "seed",
        blocks,
        baseUpdatedAt,
      },
    });
    expect(firstSave.ok()).toBeTruthy();

    const secondSave = await pageB.request.put(`/api/ideas/${idea.id}`, {
      data: {
        title: `${ideaTitle} B`,
        category: "qa",
        status: "seed",
        blocks,
        baseUpdatedAt,
      },
    });
    expect(secondSave.status()).toBe(409);
    const conflictBody = await secondSave.json();
    expect(conflictBody?.idea?.title).toBe(`${ideaTitle} A`);

    const latestRes = await pageA.request.get(`/api/ideas/${idea.id}`);
    expect(latestRes.ok()).toBeTruthy();
    const latestBody = await latestRes.json();
    expect(latestBody?.idea?.title).toBe(`${ideaTitle} A`);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test("non-collab degraded 409 can be conservatively rebased and retried", async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await loginAsLocalTester(pageA);
    await loginAsLocalTester(pageB);

    const ideaTitle = `E2E rebase ${Date.now()}`;
    const blocks = [
      { id: `b-a-${Date.now()}`, type: "paragraph", content: "base-a", checked: false },
      { id: `b-b-${Date.now()}`, type: "paragraph", content: "base-b", checked: false },
    ];
    const createRes = await pageA.request.post("/api/ideas", {
      data: {
        title: ideaTitle,
        category: "qa",
        status: "seed",
        blocks,
      },
    });
    expect(createRes.ok()).toBeTruthy();
    const createBody = await createRes.json();
    const idea = createBody.idea as { id: number };

    const detailRes = await pageA.request.get(`/api/ideas/${idea.id}`);
    expect(detailRes.ok()).toBeTruthy();
    const detailBody = await detailRes.json();
    const baseUpdatedAt = Number(detailBody?.idea?.updatedAt || 0);
    expect(baseUpdatedAt).toBeGreaterThan(0);

    const aBlocks = [
      { ...blocks[0], content: "A edits block-a" },
      blocks[1],
    ];
    const firstSave = await pageA.request.put(`/api/ideas/${idea.id}`, {
      data: {
        title: ideaTitle,
        category: "qa",
        status: "seed",
        blocks: aBlocks,
        baseUpdatedAt,
      },
    });
    expect(firstSave.ok()).toBeTruthy();

    const bBlocks = [
      blocks[0],
      { ...blocks[1], content: "B edits block-b" },
    ];
    const staleSave = await pageB.request.put(`/api/ideas/${idea.id}`, {
      data: {
        title: ideaTitle,
        category: "qa",
        status: "seed",
        blocks: bBlocks,
        baseUpdatedAt,
      },
    });
    expect(staleSave.status()).toBe(409);
    const conflictBody = await staleSave.json();
    const latestIdea = conflictBody?.idea as Idea | null;
    expect(latestIdea?.blocks?.[0]?.content).toBe("A edits block-a");

    const rebased = latestIdea
      ? rebaseIdeaDraftConservatively(
          {
            title: ideaTitle,
            category: "qa",
            status: "seed",
            priority: "low",
            blocks,
            updatedAt: baseUpdatedAt,
          },
          {
            title: ideaTitle,
            category: "qa",
            status: "seed",
            priority: "low",
            blocks: bBlocks,
          },
          latestIdea
        )
      : null;

    expect(rebased).not.toBeNull();

    const retrySave = await pageB.request.put(`/api/ideas/${idea.id}`, {
      data: rebased,
    });
    expect(retrySave.ok()).toBeTruthy();

    const latestRes = await pageA.request.get(`/api/ideas/${idea.id}`);
    expect(latestRes.ok()).toBeTruthy();
    const latestBody = await latestRes.json();
    const latestBlocks = Array.isArray(latestBody?.idea?.blocks) ? latestBody.idea.blocks : [];
    expect(latestBlocks.find((block: { id: string }) => block.id === blocks[0].id)?.content).toBe("A edits block-a");
    expect(latestBlocks.find((block: { id: string }) => block.id === blocks[1].id)?.content).toBe("B edits block-b");
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test("reaction toggle API is conflict-safe under duplicate concurrent requests", async ({ page }) => {
  await loginAsLocalTester(page);

  const ideaTitle = `E2E reaction race ${Date.now()}`;
  const idea = await createIdeaViaApi(page, ideaTitle);
  const endpoint = `/api/ideas/${idea.id}/reactions`;
  const payload = { emoji: "👍", targetType: "idea", targetId: "" };

  const responses = await Promise.all([
    page.request.post(endpoint, { data: payload }),
    page.request.post(endpoint, { data: payload })
  ]);

  responses.forEach((res) => {
    expect(res.status()).toBeLessThan(500);
  });

  const reactionRes = await page.request.get(`${endpoint}?targetType=idea`);
  expect(reactionRes.ok()).toBeTruthy();
  const reactionBody = await reactionRes.json();
  const thumbCount = Number(
    (Array.isArray(reactionBody?.reactions)
      ? reactionBody.reactions.find((entry: { emoji?: string; count?: number }) => entry?.emoji === "👍")?.count
      : 0) ?? 0
  );

  expect(thumbCount).toBeLessThanOrEqual(1);
});

test("remote cursor label reports line metadata", async () => {
  expect(getCursorLineLabel("첫째 줄\n둘째 줄\n셋째 줄", 0)).toBe("1줄");
  expect(getCursorLineLabel("첫째 줄\n둘째 줄\n셋째 줄", 8)).toBe("2줄");
  expect(getCursorLineLabel("첫째 줄\n둘째 줄\n셋째 줄", 100)).toBe("3줄");
  expect(getCursorLineLabel("", null)).toBe("작업 중");
});

test("collab update does not break Korean IME composition in the active block", async ({ page }) => {
  test.skip(process.env.NEXT_PUBLIC_ENABLE_IDEA_COLLAB !== "true", "collab feature flag disabled");

  await loginAsLocalTester(page);
  const idea = await createIdeaViaApi(page, `E2E collab ime ${Date.now()}`);
  await navigateToIdea(page, idea.id);
  await page.waitForTimeout(2500);

  const { ws, doc } = await connectIdeaRoom(page, idea.id);
  await page.getByText("e2e 초기 내용").click();
  const blockTextarea = page.locator('[aria-label="블록 에디터"] textarea').first();
  await expect(blockTextarea).toBeVisible();
  const baseValue = await blockTextarea.inputValue();

  try {
    await blockTextarea.click();
    await blockTextarea.evaluate((element, value) => {
      const textarea = element as HTMLTextAreaElement;
      const descriptor = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value");
      textarea.focus();
      textarea.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "ㅎ" }));
      descriptor?.set?.call(textarea, value);
      textarea.dispatchEvent(new InputEvent("input", { bubbles: true, data: "ㅎ", inputType: "insertCompositionText" }));
    }, `${baseValue}ㅎ`);

    mutateFirstBlock(doc, (blockMap) => {
      const content = blockMap.get("content");
      if (!(content instanceof Y.Text)) {
        throw new Error("expected Y.Text block content");
      }
      replaceYText(content, `협업 변경 ${Date.now()}`);
    });
    publishCollabUpdate(ws, doc);

    await page.waitForTimeout(250);

    await blockTextarea.evaluate((element, value) => {
      const textarea = element as HTMLTextAreaElement;
      const descriptor = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value");
      descriptor?.set?.call(textarea, value);
      textarea.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "한" }));
      textarea.dispatchEvent(new InputEvent("input", { bubbles: true, data: "한", inputType: "insertText" }));
    }, `${baseValue}한`);

    await expect(blockTextarea).toHaveValue(`${baseValue}한`);
    const selection = await blockTextarea.evaluate((element) => {
      const textarea = element as HTMLTextAreaElement;
      return {
        start: textarea.selectionStart,
        end: textarea.selectionEnd,
      };
    });
    expect(selection.start).toBe(selection.end);
    expect(selection.start).toBe(`${baseValue}한`.length);
  } finally {
    ws.close();
  }
});

test("collab patch does not yank the active caret during local typing", async ({ page }) => {
  test.skip(process.env.NEXT_PUBLIC_ENABLE_IDEA_COLLAB !== "true", "collab feature flag disabled");

  await loginAsLocalTester(page);
  const idea = await createIdeaViaApi(page, `E2E collab caret ${Date.now()}`);
  await navigateToIdea(page, idea.id);
  await page.waitForTimeout(2500);

  const { ws, doc } = await connectIdeaRoom(page, idea.id);
  await page.getByText("e2e 초기 내용").click();
  const blockTextarea = page.locator('[aria-label="블록 에디터"] textarea').first();
  await expect(blockTextarea).toBeVisible();
  const baseValue = await blockTextarea.inputValue();
  const expectedValue = `${baseValue.slice(0, 1)}A${baseValue.slice(1)}`;

  try {
    await blockTextarea.click();
    await blockTextarea.evaluate((element) => {
      const textarea = element as HTMLTextAreaElement;
      textarea.focus();
      textarea.setSelectionRange(1, 1, "none");
    });

    mutateFirstBlock(doc, (blockMap) => {
      const content = blockMap.get("content");
      if (!(content instanceof Y.Text)) {
        throw new Error("expected Y.Text block content");
      }
      replaceYText(content, `${baseValue} remote`);
    });
    publishCollabUpdate(ws, doc);

    await page.waitForTimeout(250);
    await page.keyboard.insertText("A");

    await expect(blockTextarea).toHaveValue(expectedValue);
    const selectionStart = await blockTextarea.evaluate((element) => (element as HTMLTextAreaElement).selectionStart);
    expect(selectionStart).toBe(2);
  } finally {
    ws.close();
  }
});

test("file block collaborative updates keep upload state rendering intact", async ({ page }) => {
  test.skip(process.env.NEXT_PUBLIC_ENABLE_IDEA_COLLAB !== "true", "collab feature flag disabled");

  await loginAsLocalTester(page);
  const idea = await createIdeaViaApi(page, `E2E collab file ${Date.now()}`);
  await navigateToIdea(page, idea.id);
  await page.waitForTimeout(2500);

  const { ws, doc } = await connectIdeaRoom(page, idea.id);

  try {
    mutateFirstBlock(doc, (blockMap) => {
      blockMap.set("type", "file");
      const content = blockMap.get("content");
      if (!(content instanceof Y.Text)) {
        throw new Error("expected Y.Text block content");
      }
      replaceYText(content, JSON.stringify({
        name: "shared-spec.pdf",
        size: 4096,
        type: "application/pdf",
        status: "uploading",
      }));
    });
    publishCollabUpdate(ws, doc);

    await expect(page.getByText("shared-spec.pdf")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("업로드 중...")).toBeVisible({ timeout: 10000 });

    mutateFirstBlock(doc, (blockMap) => {
      const content = blockMap.get("content");
      if (!(content instanceof Y.Text)) {
        throw new Error("expected Y.Text block content");
      }
      replaceYText(content, JSON.stringify({
        name: "shared-spec.pdf",
        size: 4096,
        type: "application/pdf",
        status: "failed",
      }));
    });
    publishCollabUpdate(ws, doc);

    await expect(page.getByText("업로드 실패")).toBeVisible();

    mutateFirstBlock(doc, (blockMap) => {
      const content = blockMap.get("content");
      if (!(content instanceof Y.Text)) {
        throw new Error("expected Y.Text block content");
      }
      replaceYText(content, JSON.stringify({
        name: "shared-spec.pdf",
        size: 4096,
        type: "application/pdf",
        status: "uploaded",
        filePath: "/uploads/shared-spec.pdf",
      }));
    });
    publishCollabUpdate(ws, doc);

    await expect(page.getByRole("link", { name: "파일 열기" })).toBeVisible();
    await expect(page.getByRole("link", { name: "다운로드" })).toBeVisible();
  } finally {
    ws.close();
  }
});

test("editor remote sync guard keeps diverged unsaved draft intact", async () => {
  expect(
    shouldApplyIncomingRemoteSnapshot({
      status: "dirty",
      localEditVersion: 3,
      lastSaveVersion: 2,
      currentSnapshot: "local-dirty",
      incomingSnapshot: "remote-next"
    })
  ).toBe(false);

  expect(
    shouldApplyIncomingRemoteSnapshot({
      status: "saved",
      localEditVersion: 3,
      lastSaveVersion: 2,
      currentSnapshot: "local-diverged",
      incomingSnapshot: "remote-diverged"
    })
  ).toBe(false);

  expect(
    shouldApplyIncomingRemoteSnapshot({
      status: "saved",
      localEditVersion: 3,
      lastSaveVersion: 2,
      currentSnapshot: "saved-v2",
      incomingSnapshot: "saved-v2"
    })
  ).toBe(true);
});

test("conservative rebase merges disjoint block edits", () => {
  const base = {
    title: "base-title",
    category: "qa",
    status: "seed" as const,
    priority: "low" as const,
    blocks: [
      { id: "b-1", type: "paragraph", content: "base-1", checked: false },
      { id: "b-2", type: "paragraph", content: "base-2", checked: false },
    ],
    updatedAt: 100,
  };

  const localDraft = {
    title: "base-title",
    category: "qa",
    status: "seed" as const,
    priority: "low" as const,
    blocks: [
      { id: "b-1", type: "paragraph", content: "local-1", checked: false },
      { id: "b-2", type: "paragraph", content: "base-2", checked: false },
    ],
  };

  const latest = buildIdeaForRebase({
    updatedAt: 200,
    blocks: [
      { id: "b-1", type: "paragraph", content: "base-1", checked: false },
      { id: "b-2", type: "paragraph", content: "server-2", checked: false },
    ],
  });

  const rebased = rebaseIdeaDraftConservatively(base, localDraft, latest);
  expect(rebased).not.toBeNull();
  expect(rebased?.baseUpdatedAt).toBe(200);
  expect(rebased?.blocks).toEqual([
    { id: "b-1", type: "paragraph", content: "local-1", checked: false },
    { id: "b-2", type: "paragraph", content: "server-2", checked: false },
  ]);
});

test("conservative rebase rejects same-block concurrent edits", () => {
  const base = {
    title: "base-title",
    category: "qa",
    status: "seed" as const,
    priority: "low" as const,
    blocks: [{ id: "b-1", type: "paragraph", content: "base", checked: false }],
    updatedAt: 100,
  };

  const localDraft = {
    title: "base-title",
    category: "qa",
    status: "seed" as const,
    priority: "low" as const,
    blocks: [{ id: "b-1", type: "paragraph", content: "local edit", checked: false }],
  };

  const latest = buildIdeaForRebase({
    updatedAt: 200,
    blocks: [{ id: "b-1", type: "paragraph", content: "server edit", checked: false }],
  });

  expect(rebaseIdeaDraftConservatively(base, localDraft, latest)).toBeNull();
});

test("conservative rebase rejects structural block changes", () => {
  const base = {
    title: "base-title",
    category: "qa",
    status: "seed" as const,
    priority: "low" as const,
    blocks: [{ id: "b-1", type: "paragraph", content: "base", checked: false }],
    updatedAt: 100,
  };

  const localDraft = {
    title: "base-title",
    category: "qa",
    status: "seed" as const,
    priority: "low" as const,
    blocks: [
      { id: "b-1", type: "paragraph", content: "base", checked: false },
      { id: "b-2", type: "paragraph", content: "added", checked: false },
    ],
  };

  const latest = buildIdeaForRebase({ updatedAt: 200 });
  expect(rebaseIdeaDraftConservatively(base, localDraft, latest)).toBeNull();
});

test("conservative rebase rejects when title changes on both sides", () => {
  const base = {
    title: "base-title",
    category: "qa",
    status: "seed" as const,
    priority: "low" as const,
    blocks: [
      { id: "b-1", type: "paragraph", content: "base-1", checked: false },
      { id: "b-2", type: "paragraph", content: "base-2", checked: false },
    ],
    updatedAt: 100,
  };

  const localDraft = {
    title: "local-title",
    category: "qa",
    status: "seed" as const,
    priority: "low" as const,
    blocks: [
      { id: "b-1", type: "paragraph", content: "local-1", checked: false },
      { id: "b-2", type: "paragraph", content: "base-2", checked: false },
    ],
  };

  const latest = buildIdeaForRebase({
    title: "server-title",
    updatedAt: 200,
    blocks: [
      { id: "b-1", type: "paragraph", content: "base-1", checked: false },
      { id: "b-2", type: "paragraph", content: "server-2", checked: false },
    ],
  });

  expect(rebaseIdeaDraftConservatively(base, localDraft, latest)).toBeNull();
});

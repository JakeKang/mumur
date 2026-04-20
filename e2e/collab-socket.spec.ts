import { expect, test, type Page } from "@playwright/test";
import WebSocket from "ws";
import * as Y from "yjs";
import { createIdeaViaApi, loginAsLocalTester } from "./helpers";

async function sessionCookieHeader(page: Page) {
  const cookies = await page.context().cookies();
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

function wsUrl(ideaId: number) {
  return `ws://127.0.0.1:3100/ws/ideas/${ideaId}`;
}

function workbenchWsUrl() {
  return "ws://127.0.0.1:3100/ws";
}

function waitForMessage(ws: WebSocket, predicate: (payload: Record<string, unknown>) => boolean, timeoutMs = 7000) {
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

function waitForRoomBootstrap(ws: WebSocket, timeoutMs = 7000) {
  return new Promise<{ connected: Record<string, unknown>; bootstrap: Record<string, unknown> }>((resolve, reject) => {
    let connected: Record<string, unknown> | null = null;
    let bootstrap: Record<string, unknown> | null = null;
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("timed out waiting for room bootstrap"));
    }, timeoutMs);

    const onMessage = (raw: WebSocket.RawData) => {
      try {
        const parsed = JSON.parse(String(raw || "{}")) as Record<string, unknown>;
        if (parsed.event === "collab.connected") {
          connected = parsed;
        }
        if (parsed.event === "collab.bootstrap") {
          bootstrap = parsed;
        }
        if (connected && bootstrap) {
          cleanup();
          resolve({ connected, bootstrap });
        }
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

test("authorized session can connect to idea collaboration room", async ({ page }) => {
  await loginAsLocalTester(page);
  const idea = await createIdeaViaApi(page, `E2E collab socket ${Date.now()}`);
  const cookie = await sessionCookieHeader(page);

  const ws = new WebSocket(wsUrl(idea.id), {
    headers: { Cookie: cookie },
  });

  const { connected, bootstrap } = await waitForRoomBootstrap(ws);

  expect(connected.event).toBe("collab.connected");
  expect(connected.payload).toMatchObject({ ok: true, ideaId: idea.id });
  expect((bootstrap.payload as { update?: string } | undefined)?.update).toBeTruthy();

  ws.close();
});

test("authorized clients receive broadcast collaboration updates", async ({ page }) => {
  test.skip(process.env.NEXT_PUBLIC_ENABLE_IDEA_COLLAB !== "true", "collab feature flag disabled");

  await loginAsLocalTester(page);
  const idea = await createIdeaViaApi(page, `E2E collab broadcast ${Date.now()}`);
  const cookie = await sessionCookieHeader(page);

  const sender = new WebSocket(wsUrl(idea.id), { headers: { Cookie: cookie } });
  const receiver = new WebSocket(wsUrl(idea.id), { headers: { Cookie: cookie } });

  const { bootstrap: senderBootstrap } = await waitForRoomBootstrap(sender);
  const { bootstrap: receiverBootstrap } = await waitForRoomBootstrap(receiver);

  const senderDoc = new Y.Doc();
  const receiverDoc = new Y.Doc();
  Y.applyUpdate(senderDoc, Buffer.from(String((senderBootstrap.payload as { update?: string } | undefined)?.update || ""), "base64"));
  Y.applyUpdate(receiverDoc, Buffer.from(String((receiverBootstrap.payload as { update?: string } | undefined)?.update || ""), "base64"));

  const nextTitle = `collab-updated-title-${Date.now()}`;
  const titleText = senderDoc.getText("idea:title");
  titleText.delete(0, titleText.length);
  titleText.insert(0, nextTitle);

  const update = Buffer.from(Y.encodeStateAsUpdate(senderDoc)).toString("base64");
  sender.send(JSON.stringify({ event: "collab.update", payload: { update } }));

  const broadcast = await waitForMessage(receiver, (payload) => payload.event === "collab.update");
  Y.applyUpdate(receiverDoc, Buffer.from(String((broadcast.payload as { update?: string } | undefined)?.update || ""), "base64"));

  expect(receiverDoc.getText("idea:title").toString()).toBe(nextTitle);

  sender.close();
  receiver.close();
});

test("existing workbench realtime websocket still connects alongside idea rooms", async ({ page }) => {
  await loginAsLocalTester(page);
  const idea = await createIdeaViaApi(page, `E2E collab coexistence ${Date.now()}`);
  const cookie = await sessionCookieHeader(page);

  const roomSocket = new WebSocket(wsUrl(idea.id), { headers: { Cookie: cookie } });
  const workbenchSocket = new WebSocket(workbenchWsUrl(), { headers: { Cookie: cookie } });

  await waitForRoomBootstrap(roomSocket);
  const connected = await waitForMessage(workbenchSocket, (payload) => payload.event === "connected");

  expect(connected.payload).toMatchObject({
    ok: true,
    user: { userId: expect.any(Number), name: expect.any(String) },
  });

  roomSocket.close();
  workbenchSocket.close();
});

test("workbench realtime websocket emits comment events for idea detail subscribers", async ({ page }) => {
  await loginAsLocalTester(page);
  const idea = await createIdeaViaApi(page, `E2E workbench comment event ${Date.now()}`);
  const cookie = await sessionCookieHeader(page);

  const workbenchSocket = new WebSocket(workbenchWsUrl(), { headers: { Cookie: cookie } });
  await waitForMessage(workbenchSocket, (payload) => payload.event === "connected");

  const commentText = `socket comment ${Date.now()}`;
  const commentCreatedPromise = waitForMessage(workbenchSocket, (payload) => payload.event === "comment.created");
  const response = await page.request.post(`/api/ideas/${idea.id}/comments`, {
    data: { content: commentText, blockId: "" },
  });
  expect(response.ok()).toBeTruthy();

  const commentCreated = await commentCreatedPromise;
  expect(commentCreated.payload).toMatchObject({
    ideaId: idea.id,
    actorUserId: expect.any(Number),
  });

  workbenchSocket.close();
});

test("two collaboration clients converge title updates in realtime", async ({ page }) => {
  test.skip(process.env.NEXT_PUBLIC_ENABLE_IDEA_COLLAB !== "true", "collab feature flag disabled");

  await loginAsLocalTester(page);
  const idea = await createIdeaViaApi(page, `E2E collab converge ${Date.now()}`);
  const cookie = await sessionCookieHeader(page);

  const socketA = new WebSocket(wsUrl(idea.id), { headers: { Cookie: cookie } });
  const socketB = new WebSocket(wsUrl(idea.id), { headers: { Cookie: cookie } });

  const { bootstrap: bootstrapA } = await waitForRoomBootstrap(socketA);
  const { bootstrap: bootstrapB } = await waitForRoomBootstrap(socketB);

  const docA = new Y.Doc();
  const docB = new Y.Doc();
  Y.applyUpdate(docA, Buffer.from(String((bootstrapA.payload as { update?: string } | undefined)?.update || ""), "base64"));
  Y.applyUpdate(docB, Buffer.from(String((bootstrapB.payload as { update?: string } | undefined)?.update || ""), "base64"));

  const targetTitle = `realtime-converged-${Date.now()}`;
  const title = docA.getText("idea:title");
  title.delete(0, title.length);
  title.insert(0, targetTitle);

  const update = Buffer.from(Y.encodeStateAsUpdate(docA)).toString("base64");
  socketA.send(JSON.stringify({ event: "collab.update", payload: { update } }));

  const received = await waitForMessage(socketB, (payload) => payload.event === "collab.update");
  Y.applyUpdate(docB, Buffer.from(String((received.payload as { update?: string } | undefined)?.update || ""), "base64"));

  expect(docB.getText("idea:title").toString()).toBe(targetTitle);

  socketA.close();
  socketB.close();
});

test("unauthorized session cannot connect to idea collaboration room", async () => {
  const ws = new WebSocket(wsUrl(1));

  const outcome = await new Promise<string>((resolve) => {
    const timeout = setTimeout(() => resolve("timeout"), 5000);
    ws.on("open", () => {
      clearTimeout(timeout);
      resolve("open");
    });
    ws.on("error", () => {
      clearTimeout(timeout);
      resolve("error");
    });
    ws.on("close", () => {
      clearTimeout(timeout);
      resolve("close");
    });
  });

  expect(outcome).not.toBe("open");
  expect(["error", "close"]).toContain(outcome);
});

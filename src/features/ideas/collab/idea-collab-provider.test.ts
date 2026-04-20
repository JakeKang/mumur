import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { IdeaCollabDoc, encodeCollabUpdate } from "@/features/ideas/collab/idea-collab-doc";
import { getIdeaCollabReconnectDelay, hydrateIdeaCollabDocument } from "@/features/ideas/collab/idea-collab-provider";

describe("idea-collab-provider helpers", () => {
  it("bounds reconnect backoff for repeated websocket retries", () => {
    expect(getIdeaCollabReconnectDelay(0)).toBe(1000);
    expect(getIdeaCollabReconnectDelay(1)).toBe(2000);
    expect(getIdeaCollabReconnectDelay(5)).toBe(30000);
    expect(getIdeaCollabReconnectDelay(20)).toBe(30000);
  });

  it("replaces local draft state from bootstrap snapshots without re-broadcasting hydration updates", () => {
    const document = IdeaCollabDoc.fromSnapshot({
      title: "Local draft",
      blocks: [{ id: "local-1", type: "paragraph", content: "unsynced", checked: false }],
    });
    const suppressSocketBroadcastRef = { current: false };
    const broadcastSuppressionStates: boolean[] = [];

    document.ydoc.on("update", () => {
      broadcastSuppressionStates.push(suppressSocketBroadcastRef.current);
    });

    hydrateIdeaCollabDocument(document, {
      snapshot: {
        title: "Recovered remote draft",
        blocks: [{ id: "remote-1", type: "checklist", content: "authoritative", checked: true }],
      },
    }, suppressSocketBroadcastRef);

    expect(document.getSnapshot()).toEqual({
      title: "Recovered remote draft",
      blocks: [{ id: "remote-1", type: "checklist", content: "authoritative", checked: true }],
    });
    expect(broadcastSuppressionStates.length).toBeGreaterThan(0);
    expect(broadcastSuppressionStates.every(Boolean)).toBe(true);
    expect(suppressSocketBroadcastRef.current).toBe(false);
  });

  it("applies remote websocket updates incrementally during reconnect hydration", () => {
    const baseline = {
      title: "Shared draft",
      blocks: [{ id: "block-1", type: "paragraph", content: "hello", checked: false }],
    };
    const document = IdeaCollabDoc.fromSnapshot(baseline);
    const remoteDocument = IdeaCollabDoc.fromSnapshot({});
    const suppressSocketBroadcastRef = { current: false };
    const updateOrigins: unknown[] = [];

    document.ydoc.on("update", (_update, origin) => {
      updateOrigins.push(origin);
    });

    remoteDocument.applyUpdate(Y.encodeStateAsUpdate(document.ydoc), "remote");
    remoteDocument.editBlockContent("block-1", { index: 5, deleteCount: 0, insert: " world" });

    hydrateIdeaCollabDocument(document, {
      update: encodeCollabUpdate(Y.encodeStateAsUpdate(remoteDocument.ydoc, Y.encodeStateVector(document.ydoc))),
    }, suppressSocketBroadcastRef);

    expect(document.getSnapshot()).toEqual({
      title: "Shared draft",
      blocks: [{ id: "block-1", type: "paragraph", content: "hello world", checked: false }],
    });
    expect(updateOrigins).toContain("remote");
    expect(suppressSocketBroadcastRef.current).toBe(false);
  });
});

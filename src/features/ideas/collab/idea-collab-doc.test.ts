import { describe, expect, it } from "vitest";
import { IdeaCollabDoc } from "@/features/ideas/collab/idea-collab-doc";

describe("IdeaCollabDoc", () => {
  it("serializes checkpoints in the existing idea shape", () => {
    const doc = IdeaCollabDoc.fromSnapshot({
      title: "Draft",
      blocks: [{ id: "b-1", type: "paragraph", content: "hello", checked: false }],
    });

    expect(doc.toCheckpoint()).toEqual({
      title: "Draft",
      blocks: [{ id: "b-1", type: "paragraph", content: "hello", checked: false }],
    });
  });

  it("keeps block identity stable across reorder", () => {
    const doc = IdeaCollabDoc.fromSnapshot({
      title: "Draft",
      blocks: [
        { id: "b-1", type: "paragraph", content: "one", checked: false },
        { id: "b-2", type: "paragraph", content: "two", checked: false },
      ],
    });

    doc.moveBlock("b-1", 1);

    expect(doc.getSnapshot().blocks.map((block) => block.id)).toEqual(["b-2", "b-1"]);
  });

  it("applies same-document remote updates", () => {
    const base = IdeaCollabDoc.fromSnapshot({
      title: "Draft",
      blocks: [{ id: "b-1", type: "paragraph", content: "base", checked: false }],
    });
    const remote = IdeaCollabDoc.fromSnapshot({});

    remote.applyUpdate(base.encodeState());

    remote.updateBlock("b-1", { content: "remote edit" });
    base.applyUpdate(remote.encodeState());

    expect(base.getSnapshot().blocks[0].content).toBe("remote edit");
  });

  it("replays reconnect bootstrap updates without duplicating state", () => {
    const server = IdeaCollabDoc.fromSnapshot({
      title: "Draft",
      blocks: [
        { id: "b-1", type: "paragraph", content: "one", checked: false },
        { id: "b-2", type: "paragraph", content: "two", checked: false },
      ],
    });
    const client = IdeaCollabDoc.fromSnapshot({});

    client.applyUpdate(server.encodeState(), "remote");

    server.setTitle("Draft reconnect");
    server.updateBlock("b-1", { content: "server replay" });
    server.moveBlock("b-2", 0);

    const reconnectPayload = server.encodeState();
    client.applyUpdate(reconnectPayload, "remote");
    client.applyUpdate(reconnectPayload, "remote");

    expect(client.getSnapshot()).toEqual({
      title: "Draft reconnect",
      blocks: [
        { id: "b-2", type: "paragraph", content: "two", checked: false },
        { id: "b-1", type: "paragraph", content: "server replay", checked: false },
      ],
    });
    expect(client.getSnapshot()).toEqual(server.getSnapshot());
  });

  it("replays offline edits after reconnect alongside remote changes", () => {
    const seed = IdeaCollabDoc.fromSnapshot({
      title: "Draft",
      blocks: [
        { id: "b-1", type: "paragraph", content: "one", checked: false },
        { id: "b-2", type: "paragraph", content: "two", checked: false },
      ],
    });
    const server = IdeaCollabDoc.fromSnapshot({});
    const offlineClient = IdeaCollabDoc.fromSnapshot({});

    const initialState = seed.encodeState();
    server.applyUpdate(initialState, "remote");
    offlineClient.applyUpdate(initialState, "remote");

    offlineClient.updateBlock("b-1", { content: "offline edit" });
    server.updateBlock("b-2", { content: "remote edit" });

    server.applyUpdate(offlineClient.encodeState(), "remote");
    offlineClient.applyUpdate(server.encodeState(), "remote");

    expect(server.getSnapshot()).toEqual({
      title: "Draft",
      blocks: [
        { id: "b-1", type: "paragraph", content: "offline edit", checked: false },
        { id: "b-2", type: "paragraph", content: "remote edit", checked: false },
      ],
    });
    expect(offlineClient.getSnapshot()).toEqual(server.getSnapshot());
  });

  it("supports inserting a new block after an existing block", () => {
    const doc = IdeaCollabDoc.fromSnapshot({
      title: "Draft",
      blocks: [{ id: "b-1", type: "paragraph", content: "one", checked: false }],
    });

    doc.insertBlockAfter("b-1", { id: "b-2", type: "paragraph", content: "two", checked: false });

    expect(doc.getSnapshot().blocks.map((block) => block.id)).toEqual(["b-1", "b-2"]);
  });
});

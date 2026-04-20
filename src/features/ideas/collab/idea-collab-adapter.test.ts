import * as Y from "yjs";
import { describe, expect, it } from "vitest";
import { createIdeaCollabAdapter } from "@/features/ideas/collab/idea-collab-adapter";
import { IdeaCollabDoc } from "@/features/ideas/collab/idea-collab-doc";

function createDoc(snapshot: ConstructorParameters<typeof IdeaCollabDoc>[0], clientId: number) {
  const ydoc = new Y.Doc();

  (ydoc as Y.Doc & { clientID: number }).clientID = clientId;

  return new IdeaCollabDoc(snapshot, ydoc);
}

function seedClients(snapshot: ConstructorParameters<typeof IdeaCollabDoc>[0]) {
  const seed = createDoc(snapshot, 100);
  const left = createDoc({}, 1);
  const right = createDoc({}, 2);
  const seedState = seed.encodeState();

  left.applyUpdate(seedState, "remote");
  right.applyUpdate(seedState, "remote");

  return { left, right };
}

function sync(left: IdeaCollabDoc, right: IdeaCollabDoc) {
  const leftState = left.encodeState();
  const rightState = right.encodeState();

  left.applyUpdate(rightState, "remote");
  right.applyUpdate(leftState, "remote");
}

describe("idea-collab-adapter", () => {
  it("wraps deterministic editor-facing operations without exposing Yjs internals", () => {
    const doc = IdeaCollabDoc.fromSnapshot({
      title: "Draft",
      blocks: [
        { id: "b-1", type: "paragraph", content: "alpha", checked: false },
        { id: "b-2", type: "checklist", content: "todo", checked: false },
      ],
    });
    const adapter = createIdeaCollabAdapter(doc);

    adapter.replaceTitle("Team draft");
    adapter.editTitle({ index: 4, insert: " synced" });
    adapter.editBlockContent("b-1", { index: 5, insert: " beta" });
    adapter.setBlockType("b-1", "quote");
    adapter.toggleChecklist("b-2", true);
    adapter.insertBlock("b-1", { id: "b-3", type: "paragraph", content: "middle", checked: false });
    adapter.reorderBlock("b-3", 0);
    adapter.deleteBlock("b-2");

    expect(adapter.getSnapshot()).toEqual({
      title: "Team synced draft",
      blocks: [
        { id: "b-3", type: "paragraph", content: "middle", checked: false },
        { id: "b-1", type: "quote", content: "alpha beta", checked: false },
      ],
    });
    expect(adapter.toCheckpoint()).toEqual({
      title: "Team synced draft",
      blocks: [
        { id: "b-3", type: "paragraph", content: "middle", checked: false },
        { id: "b-1", type: "quote", content: "alpha beta", checked: false },
      ],
    });
  });

  it("converges same-range concurrent block content edits deterministically", () => {
    const { left, right } = seedClients({
      title: "Draft",
      blocks: [{ id: "b-1", type: "paragraph", content: "base", checked: false }],
    });
    const leftAdapter = createIdeaCollabAdapter(left);
    const rightAdapter = createIdeaCollabAdapter(right);

    leftAdapter.editBlockContent("b-1", { index: 2, insert: "L" });
    rightAdapter.editBlockContent("b-1", { index: 2, insert: "R" });
    sync(left, right);

    expect(leftAdapter.getSnapshot()).toEqual(rightAdapter.getSnapshot());
    expect(leftAdapter.getSnapshot().blocks[0].content).toBe("baLRse");
  });

  it("converges same-range concurrent title edits deterministically", () => {
    const { left, right } = seedClients({
      title: "Idea",
      blocks: [{ id: "b-1", type: "paragraph", content: "body", checked: false }],
    });
    const leftAdapter = createIdeaCollabAdapter(left);
    const rightAdapter = createIdeaCollabAdapter(right);

    leftAdapter.editTitle({ index: 2, insert: "A" });
    rightAdapter.editTitle({ index: 2, insert: "B" });
    sync(left, right);

    expect(leftAdapter.getSnapshot()).toEqual(rightAdapter.getSnapshot());
    expect(leftAdapter.getSnapshot().title).toBe("IdABea");
  });
});

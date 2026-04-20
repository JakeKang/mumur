import { describe, expect, it } from "vitest";
import { IdeaCollabDoc } from "@/features/ideas/collab/idea-collab-doc";
import { shouldCreateAutoCheckpoint, toIdeaCollabCheckpoint } from "@/features/ideas/collab/idea-collab-checkpoint";

describe("idea-collab-checkpoint", () => {
  it("converts an idea into collab checkpoint shape", () => {
    expect(
      toIdeaCollabCheckpoint({
        title: "Draft",
        blocks: [{ id: "b-1", type: "paragraph", content: "hello", checked: false }],
        updatedAt: 123,
      }),
    ).toEqual({
      title: "Draft",
      blocks: [{ id: "b-1", type: "paragraph", content: "hello", checked: false }],
      updatedAt: 123,
    });
  });

  it("round trips persisted checkpoints back into a collaboration document", () => {
    const checkpoint = toIdeaCollabCheckpoint({
      title: "Persisted draft",
      blocks: [
        { id: "b-1", type: "paragraph", content: "hello", checked: false },
        { id: "b-2", type: "checklist", content: "todo", checked: true },
      ],
      updatedAt: 456,
    });

    const restored = IdeaCollabDoc.fromSnapshot(checkpoint);

    expect(restored.toCheckpoint()).toEqual({
      title: "Persisted draft",
      blocks: [
        { id: "b-1", type: "paragraph", content: "hello", checked: false },
        { id: "b-2", type: "checklist", content: "todo", checked: true },
      ],
    });
  });

  it("creates periodic auto checkpoints only after interval", () => {
    expect(shouldCreateAutoCheckpoint(undefined, 1000)).toBe(true);
    expect(shouldCreateAutoCheckpoint(1000, 1000 + 60_000)).toBe(false);
    expect(shouldCreateAutoCheckpoint(1000, 1000 + 5 * 60_000)).toBe(true);
  });
});

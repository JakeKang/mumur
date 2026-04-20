import { describe, expect, it } from "vitest";
import { doesIdeaMatchSavePayload, isCollabCheckpointAcknowledged } from "@/modules/workbench/application/hooks/use-offline-sync";
import type { Idea } from "@/shared/types";

const payload = {
  title: "Draft",
  category: "qa",
  status: "seed" as const,
  priority: "medium" as const,
  blocks: [
    { id: "b-1", type: "paragraph", content: "hello", checked: false },
    { id: "b-2", type: "checklist", content: "done", checked: true },
  ],
  baseUpdatedAt: 100,
};

function buildIdea(overrides: Partial<Idea> = {}): Idea {
  return {
    id: 1,
    workspaceId: 1,
    teamId: 1,
    authorId: 1,
    title: payload.title,
    category: payload.category,
    status: payload.status,
    priority: payload.priority,
    blocks: payload.blocks,
    createdAt: 1,
    updatedAt: 100,
    ...overrides,
  };
}

describe("use-offline-sync helpers", () => {
  it("recognizes when a collab checkpoint already acknowledges the queued snapshot", () => {
    expect(isCollabCheckpointAcknowledged(payload, {
      title: payload.title,
      blocks: payload.blocks,
      updatedAt: 200,
    })).toBe(true);

    expect(isCollabCheckpointAcknowledged(payload, {
      title: payload.title,
      blocks: [{ ...payload.blocks[0], content: "server edit" }, payload.blocks[1]],
      updatedAt: 200,
    })).toBe(false);
  });

  it("recognizes when the latest persisted idea already matches a queued legacy payload", () => {
    expect(doesIdeaMatchSavePayload(buildIdea(), payload)).toBe(true);
    expect(doesIdeaMatchSavePayload(buildIdea({ priority: "high" }), payload)).toBe(false);
    expect(doesIdeaMatchSavePayload(buildIdea({ category: "ops" }), payload)).toBe(false);
    expect(doesIdeaMatchSavePayload(buildIdea({ blocks: [{ ...payload.blocks[0], content: "server edit" }, payload.blocks[1]] }), payload)).toBe(false);
  });
});

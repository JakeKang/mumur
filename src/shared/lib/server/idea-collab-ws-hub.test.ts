import { describe, expect, it } from "vitest";
import { IdeaCollabDoc, decodeCollabUpdate, encodeCollabUpdate } from "@/features/ideas/collab/idea-collab-doc";
import {
  applyIdeaCollabUpdate,
  canPublishIdeaCollab,
  ensureIdeaCollabRoom,
  ideaCollabBootstrapPayload,
} from "@/shared/lib/server/idea-collab-ws-hub";

describe("idea-collab-ws-hub", () => {
  it("allows room subscribe roles while limiting publish to editor-capable roles", () => {
    expect(canPublishIdeaCollab("viewer")).toBe(false);
    expect(canPublishIdeaCollab("editor")).toBe(true);
    expect(canPublishIdeaCollab("member")).toBe(true);
    expect(canPublishIdeaCollab("deleter")).toBe(true);
    expect(canPublishIdeaCollab("admin")).toBe(true);
    expect(canPublishIdeaCollab("owner")).toBe(true);
    expect(canPublishIdeaCollab(undefined)).toBe(false);
  });

  it("bootstraps rooms with both live state and authoritative checkpoint metadata", () => {
    const teamId = 7101;
    const ideaId = 8101;

    ensureIdeaCollabRoom(teamId, ideaId, {
      title: "Persisted checkpoint",
      blocks: [{ id: "b-1", type: "paragraph", content: "hello", checked: false }],
      updatedAt: 123456,
    });

    expect(ideaCollabBootstrapPayload(teamId, ideaId)).toEqual({
      update: expect.any(String),
      snapshot: {
        title: "Persisted checkpoint",
        blocks: [{ id: "b-1", type: "paragraph", content: "hello", checked: false }],
      },
      checkpoint: {
        title: "Persisted checkpoint",
        blocks: [{ id: "b-1", type: "paragraph", content: "hello", checked: false }],
        updatedAt: 123456,
      },
    });
  });

  it("keeps the persisted checkpoint authoritative while live room state advances", () => {
    const teamId = 7102;
    const ideaId = 8102;

    ensureIdeaCollabRoom(teamId, ideaId, {
      title: "Persisted checkpoint",
      blocks: [{ id: "b-1", type: "paragraph", content: "hello", checked: false }],
      updatedAt: 654321,
    });

    const bootstrap = ideaCollabBootstrapPayload(teamId, ideaId);
    const clientDoc = IdeaCollabDoc.fromSnapshot({});
    clientDoc.applyUpdate(decodeCollabUpdate(bootstrap.update), "remote");
    clientDoc.setTitle("Live draft title");

    const result = applyIdeaCollabUpdate(teamId, ideaId, encodeCollabUpdate(clientDoc.encodeState()));

    expect(result.snapshot).toEqual({
      title: "Live draft title",
      blocks: [{ id: "b-1", type: "paragraph", content: "hello", checked: false }],
    });
    expect(result.checkpoint).toEqual({
      title: "Persisted checkpoint",
      blocks: [{ id: "b-1", type: "paragraph", content: "hello", checked: false }],
      updatedAt: 654321,
    });
  });
});

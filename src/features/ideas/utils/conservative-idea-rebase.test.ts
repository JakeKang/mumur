import { describe, expect, it } from "vitest";
import { rebaseIdeaDraftConservatively } from "@/features/ideas/utils/conservative-idea-rebase";
import type { Idea } from "@/shared/types";

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

describe("rebaseIdeaDraftConservatively", () => {
  it("merges disjoint block edits", () => {
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
      priority: "medium" as const,
      blocks: [
        { id: "b-1", type: "paragraph", content: "local-1", checked: false },
        { id: "b-2", type: "paragraph", content: "base-2", checked: false },
      ],
    };

    const latest = buildIdeaForRebase({
      updatedAt: 200,
      priority: "low",
      blocks: [
        { id: "b-1", type: "paragraph", content: "base-1", checked: false },
        { id: "b-2", type: "paragraph", content: "server-2", checked: false },
      ],
    });

    expect(rebaseIdeaDraftConservatively(base, localDraft, latest)).toEqual({
      title: "base-title",
      category: "qa",
      status: "seed",
      priority: "medium",
      blocks: [
        { id: "b-1", type: "paragraph", content: "local-1", checked: false },
        { id: "b-2", type: "paragraph", content: "server-2", checked: false },
      ],
      baseUpdatedAt: 200,
    });
  });

  it("rejects same-block concurrent edits", () => {
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

  it("rejects structural block changes", () => {
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

  it("rejects simultaneous title changes", () => {
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
      updatedAt: 200,
      priority: "low",
      title: "server-title",
      blocks: [
        { id: "b-1", type: "paragraph", content: "base-1", checked: false },
        { id: "b-2", type: "paragraph", content: "server-2", checked: false },
      ],
    });

    expect(rebaseIdeaDraftConservatively(base, localDraft, latest)).toBeNull();
  });

  it("rejects simultaneous priority changes that diverge", () => {
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
      priority: "medium" as const,
      blocks: [
        { id: "b-1", type: "paragraph", content: "local-1", checked: false },
        { id: "b-2", type: "paragraph", content: "base-2", checked: false },
      ],
    };

    const latest = buildIdeaForRebase({
      updatedAt: 200,
      priority: "high",
      blocks: [
        { id: "b-1", type: "paragraph", content: "base-1", checked: false },
        { id: "b-2", type: "paragraph", content: "server-2", checked: false },
      ],
    });

    expect(rebaseIdeaDraftConservatively(base, localDraft, latest)).toBeNull();
  });
});

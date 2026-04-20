import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isIdeaCollabEnabled } from "@/features/ideas/collab/idea-collab-config";

describe("idea-collab-config", () => {
  const originalFlag = process.env.NEXT_PUBLIC_ENABLE_IDEA_COLLAB;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_ENABLE_IDEA_COLLAB;
  });

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env.NEXT_PUBLIC_ENABLE_IDEA_COLLAB;
    } else {
      process.env.NEXT_PUBLIC_ENABLE_IDEA_COLLAB = originalFlag;
    }
  });

  it("defaults collaboration flag to disabled", () => {
    expect(isIdeaCollabEnabled()).toBe(false);
  });
});

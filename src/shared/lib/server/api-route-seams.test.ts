import { describe, expect, it, vi } from "vitest";
import {
  inferUploadedBlockType,
  normalizeWorkspaceViewConfig,
  parseStoredDraftPayload,
  parseStoredIdeaBlocks,
  parseStoredJsonObject,
  parseStoredMutedTypes,
  restoreIdeaVersionSnapshot,
  validateUploadedBlockFile,
} from "@/shared/lib/server/api-route-seams";

describe("api-route-seams", () => {
  it("falls back to safe defaults for malformed persisted json", () => {
    expect(parseStoredIdeaBlocks("{bad-json")).toEqual([]);
    expect(parseStoredJsonObject("[]")).toEqual({});
    expect(parseStoredDraftPayload("{bad-json")).toEqual({});
  });

  it("keeps muted type parsing resilient and string-normalized", () => {
    expect(parseStoredMutedTypes('["comment.created", 42]')).toEqual(["comment.created", "42"]);
    expect(parseStoredMutedTypes("{bad-json")).toEqual([]);
  });

  it("normalizes workspace view config to plain objects only", () => {
    expect(normalizeWorkspaceViewConfig({ groupBy: "status" })).toEqual({ groupBy: "status" });
    expect(normalizeWorkspaceViewConfig(["status"])).toEqual({});
    expect(normalizeWorkspaceViewConfig(null)).toEqual({});
  });

  it("keeps upload validation behind named helpers", () => {
    const file = { name: "cover.png", type: "image/png" } as File;

    expect(inferUploadedBlockType("file", file.name, file.type)).toBe("image");
    expect(validateUploadedBlockFile("image", file, Buffer.from("<html>evil</html>"))).toEqual({
      status: 415,
      message: "보안상 허용되지 않는 파일 형식입니다",
    });
  });

  it("wraps version restore persistence in one transaction seam", () => {
    const updateRun = vi.fn();
    const insertRun = vi.fn().mockReturnValue({ lastInsertRowid: 17 });
    const db = {
      prepare: vi.fn((sql: string) => ({ run: sql.startsWith("UPDATE ideas") ? updateRun : insertRun })),
    };
    const queries = {
      withTransaction: vi.fn((fn: () => unknown) => fn()),
      extractInsertId: vi.fn(() => 17),
    };

    expect(
      restoreIdeaVersionSnapshot(db as never, queries as never, {
        ideaId: 9,
        restoredBlocksJson: '[{"id":"b-1"}]',
        restoredLabel: "복원-v1.0",
        createdBy: 3,
        now: 123,
      })
    ).toEqual({ restoredVersionId: 17 });

    expect(queries.withTransaction).toHaveBeenCalledOnce();
    expect(updateRun).toHaveBeenCalledWith('[{"id":"b-1"}]', 123, 9);
    expect(insertRun).toHaveBeenCalledWith(9, "복원-v1.0", '[{"id":"b-1"}]', 3, 123);
  });
});

import type { Block, Idea } from "@/shared/types";

export type IdeaCollabCheckpoint = {
  title: string;
  blocks: Block[];
  updatedAt: number;
};

const AUTO_CHECKPOINT_INTERVAL_MS = 5 * 60 * 1000;

export function toIdeaCollabCheckpoint(idea: Pick<Idea, "title" | "blocks" | "updatedAt">): IdeaCollabCheckpoint {
  return {
    title: String(idea.title || ""),
    blocks: Array.isArray(idea.blocks)
      ? idea.blocks.map((block) => ({
          id: String(block.id || ""),
          type: String(block.type || "paragraph"),
          content: String(block.content || ""),
          checked: Boolean(block.checked),
        }))
      : [],
    updatedAt: Number(idea.updatedAt || 0),
  };
}

export function shouldCreateAutoCheckpoint(lastSnapshotCreatedAt: number | undefined, now: number) {
  return !lastSnapshotCreatedAt || now - lastSnapshotCreatedAt >= AUTO_CHECKPOINT_INTERVAL_MS;
}

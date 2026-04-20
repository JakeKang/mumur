import type { Idea, IdeaStatus } from "@/shared/types";

type IdeaBlock = { id: string; type: string; content: string; checked: boolean };

export type IdeaRebaseSnapshot = {
  title: string;
  category: string;
  status: IdeaStatus;
  priority: "low" | "medium" | "high";
  blocks: IdeaBlock[];
  updatedAt: number;
};

export type IdeaRebaseDraft = {
  title: string;
  category: string;
  status: IdeaStatus;
  priority: "low" | "medium" | "high";
  blocks: IdeaBlock[];
};

export type IdeaRebasePayload = IdeaRebaseDraft & { baseUpdatedAt: number };

function normalizeBlock(block: Partial<IdeaBlock> | null | undefined): IdeaBlock {
  return {
    id: String(block?.id || ""),
    type: String(block?.type || "text"),
    content: String(block?.content || ""),
    checked: Boolean(block?.checked),
  };
}

function normalizeBlocks(blocks: Array<Partial<IdeaBlock> | null | undefined> | null | undefined): IdeaBlock[] {
  return Array.isArray(blocks) ? blocks.map((block) => normalizeBlock(block)) : [];
}

function blockEqual(left: IdeaBlock, right: IdeaBlock): boolean {
  return left.id === right.id
    && left.type === right.type
    && left.content === right.content
    && left.checked === right.checked;
}

function hasStructuralBlockChange(baseBlocks: IdeaBlock[], nextBlocks: IdeaBlock[]): boolean {
  if (baseBlocks.length !== nextBlocks.length) {
    return true;
  }
  for (let index = 0; index < baseBlocks.length; index += 1) {
    if (baseBlocks[index].id !== nextBlocks[index].id) {
      return true;
    }
  }
  return false;
}

function changedBlockIds(baseBlocks: IdeaBlock[], nextBlocks: IdeaBlock[]): Set<string> {
  const nextById = new Map(nextBlocks.map((block) => [block.id, block]));
  const ids = new Set<string>();
  for (const baseBlock of baseBlocks) {
    const nextBlock = nextById.get(baseBlock.id);
    if (!nextBlock) {
      continue;
    }
    if (!blockEqual(baseBlock, nextBlock)) {
      ids.add(baseBlock.id);
    }
  }
  return ids;
}

function intersects(left: Set<string>, right: Set<string>): boolean {
  for (const key of left) {
    if (right.has(key)) {
      return true;
    }
  }
  return false;
}

function toSnapshot(idea: Idea): IdeaRebaseSnapshot {
  return {
    title: String(idea.title || ""),
    category: String(idea.category || ""),
    status: idea.status,
    priority: idea.priority === "high" || idea.priority === "medium" ? idea.priority : "low",
    blocks: normalizeBlocks(idea.blocks),
    updatedAt: Number(idea.updatedAt || 0),
  };
}

export function rebaseIdeaDraftConservatively(
  baseSnapshot: IdeaRebaseSnapshot,
  localDraft: IdeaRebaseDraft,
  latestServerIdea: Idea
): IdeaRebasePayload | null {
  const normalizedBase: IdeaRebaseSnapshot = {
    title: String(baseSnapshot.title || ""),
    category: String(baseSnapshot.category || ""),
    status: baseSnapshot.status,
    priority: baseSnapshot.priority === "high" || baseSnapshot.priority === "medium" ? baseSnapshot.priority : "low",
    blocks: normalizeBlocks(baseSnapshot.blocks),
    updatedAt: Number(baseSnapshot.updatedAt || 0),
  };
  const normalizedLocal: IdeaRebaseDraft = {
    title: String(localDraft.title || ""),
    category: String(localDraft.category || ""),
    status: localDraft.status,
    priority: localDraft.priority === "high" || localDraft.priority === "medium" ? localDraft.priority : "low",
    blocks: normalizeBlocks(localDraft.blocks),
  };
  const normalizedLatest = toSnapshot(latestServerIdea);

  if (!Number.isFinite(normalizedLatest.updatedAt) || normalizedLatest.updatedAt <= 0) {
    return null;
  }

  if (hasStructuralBlockChange(normalizedBase.blocks, normalizedLocal.blocks)) {
    return null;
  }
  if (hasStructuralBlockChange(normalizedBase.blocks, normalizedLatest.blocks)) {
    return null;
  }

  const localTitleChanged = normalizedLocal.title !== normalizedBase.title;
  const latestTitleChanged = normalizedLatest.title !== normalizedBase.title;
  if (localTitleChanged && latestTitleChanged) {
    return null;
  }

  const localChangedIds = changedBlockIds(normalizedBase.blocks, normalizedLocal.blocks);
  const latestChangedIds = changedBlockIds(normalizedBase.blocks, normalizedLatest.blocks);

  if (!localChangedIds.size || !latestChangedIds.size) {
    return null;
  }
  if (intersects(localChangedIds, latestChangedIds)) {
    return null;
  }

  const localCategoryChanged = normalizedLocal.category !== normalizedBase.category;
  const latestCategoryChanged = normalizedLatest.category !== normalizedBase.category;
  if (localCategoryChanged && latestCategoryChanged && normalizedLocal.category !== normalizedLatest.category) {
    return null;
  }

  const localStatusChanged = normalizedLocal.status !== normalizedBase.status;
  const latestStatusChanged = normalizedLatest.status !== normalizedBase.status;
  if (localStatusChanged && latestStatusChanged && normalizedLocal.status !== normalizedLatest.status) {
    return null;
  }

  const localPriorityChanged = normalizedLocal.priority !== normalizedBase.priority;
  const latestPriorityChanged = normalizedLatest.priority !== normalizedBase.priority;
  if (localPriorityChanged && latestPriorityChanged && normalizedLocal.priority !== normalizedLatest.priority) {
    return null;
  }

  const mergedBlocks = normalizedLatest.blocks.map((serverBlock) => {
    if (!localChangedIds.has(serverBlock.id)) {
      return serverBlock;
    }
    const localBlock = normalizedLocal.blocks.find((block) => block.id === serverBlock.id);
    return localBlock || serverBlock;
  });

  return {
    title: localTitleChanged ? normalizedLocal.title : normalizedLatest.title,
    category: localCategoryChanged ? normalizedLocal.category : normalizedLatest.category,
    status: localStatusChanged ? normalizedLocal.status : normalizedLatest.status,
    priority: localPriorityChanged ? normalizedLocal.priority : normalizedLatest.priority,
    blocks: mergedBlocks,
    baseUpdatedAt: normalizedLatest.updatedAt,
  };
}

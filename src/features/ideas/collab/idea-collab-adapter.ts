import type { Block } from "@/shared/types";

export type IdeaCollabBlock = {
  id: string;
  type: string;
  content: string;
  checked: boolean;
};

export type IdeaCollabSnapshot = {
  title: string;
  blocks: IdeaCollabBlock[];
};

export type IdeaCollabCheckpointSnapshot = Pick<IdeaCollabSnapshot, "title" | "blocks">;

export type IdeaCollabTextEdit = {
  index: number;
  deleteCount?: number;
  insert?: string;
};

export type IdeaCollabBlockInput = {
  id: string;
  type?: string;
  content?: string;
  checked?: boolean;
};

type IdeaCollabAdapterDocumentSource = {
  getSnapshot(): IdeaCollabSnapshot;
  toCheckpoint(): IdeaCollabCheckpointSnapshot;
  setTitle(title: string): void;
  editTitle(edit: IdeaCollabTextEdit): void;
  insertBlockAfter(afterBlockId: string | null, block: Partial<Block>): void;
  deleteBlock(blockId: string): void;
  moveBlock(blockId: string, targetIndex: number): void;
  setBlockType(blockId: string, type: string): void;
  editBlockContent(blockId: string, edit: IdeaCollabTextEdit): void;
  toggleChecklist(blockId: string, checked: boolean): void;
  replaceBlocks(blocks: Array<Partial<Block>>): void;
};

export interface IdeaCollabAdapter {
  getSnapshot(): IdeaCollabSnapshot;
  toCheckpoint(): IdeaCollabCheckpointSnapshot;
  replaceTitle(title: string): void;
  editTitle(edit: IdeaCollabTextEdit): void;
  insertBlock(afterBlockId: string | null, block: IdeaCollabBlockInput): void;
  deleteBlock(blockId: string): void;
  reorderBlock(blockId: string, targetIndex: number): void;
  setBlockType(blockId: string, type: string): void;
  editBlockContent(blockId: string, edit: IdeaCollabTextEdit): void;
  toggleChecklist(blockId: string, checked: boolean): void;
  replaceBlocks(blocks: IdeaCollabBlockInput[]): void;
}

export function createIdeaCollabAdapter(document: IdeaCollabAdapterDocumentSource): IdeaCollabAdapter {
  return {
    getSnapshot: () => document.getSnapshot(),
    toCheckpoint: () => document.toCheckpoint(),
    replaceTitle: (title) => document.setTitle(title),
    editTitle: (edit) => document.editTitle(edit),
    insertBlock: (afterBlockId, block) => document.insertBlockAfter(afterBlockId, block),
    deleteBlock: (blockId) => document.deleteBlock(blockId),
    reorderBlock: (blockId, targetIndex) => document.moveBlock(blockId, targetIndex),
    setBlockType: (blockId, type) => document.setBlockType(blockId, type),
    editBlockContent: (blockId, edit) => document.editBlockContent(blockId, edit),
    toggleChecklist: (blockId, checked) => document.toggleChecklist(blockId, checked),
    replaceBlocks: (blocks) => document.replaceBlocks(blocks),
  };
}

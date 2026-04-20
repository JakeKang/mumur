import * as Y from "yjs";
import type { Block } from "@/shared/types";
import type {
  IdeaCollabBlock,
  IdeaCollabCheckpointSnapshot,
  IdeaCollabSnapshot,
  IdeaCollabTextEdit,
} from "@/features/ideas/collab/idea-collab-adapter";

export type {
  IdeaCollabBlock,
  IdeaCollabCheckpointSnapshot,
  IdeaCollabSnapshot,
  IdeaCollabTextEdit,
} from "@/features/ideas/collab/idea-collab-adapter";

type BlockPatch = Partial<Pick<IdeaCollabBlock, "type" | "content" | "checked">>;

const ROOT_KEY = "idea";
const TITLE_KEY = "title";
const BLOCKS_KEY = "blocks";
const TITLE_DOC_KEY = "idea:title";
const BLOCKS_DOC_KEY = "idea:blocks";

function normalizeBlock(block: Partial<Block> | null | undefined): IdeaCollabBlock {
  return {
    id: String(block?.id || ""),
    type: String(block?.type || "paragraph"),
    content: String(block?.content || ""),
    checked: Boolean(block?.checked),
  };
}

function createBlockMap(block: IdeaCollabBlock) {
  const blockMap = new Y.Map<unknown>();
  const contentText = new Y.Text();

  if (block.content) {
    contentText.insert(0, block.content);
  }

  blockMap.set("id", block.id);
  blockMap.set("type", block.type);
  blockMap.set("content", contentText);
  blockMap.set("checked", block.checked);
  return blockMap;
}

function readTextValue(value: unknown) {
  if (value instanceof Y.Text) {
    return value.toString();
  }
  return String(value || "");
}

function readBlockMap(blockMap: Y.Map<unknown>): IdeaCollabBlock {
  return {
    id: String(blockMap.get("id") || ""),
    type: String(blockMap.get("type") || "paragraph"),
    content: readTextValue(blockMap.get("content")),
    checked: Boolean(blockMap.get("checked")),
  };
}

function normalizeTextEdit(edit: IdeaCollabTextEdit, length: number) {
  const safeLength = Math.max(0, length);
  const safeIndex = Math.max(0, Math.min(Number.isFinite(edit.index) ? Math.trunc(edit.index) : 0, safeLength));
  const rawDeleteCount = Number.isFinite(edit.deleteCount) ? Math.trunc(edit.deleteCount) : 0;

  return {
    index: safeIndex,
    deleteCount: Math.max(0, Math.min(rawDeleteCount, safeLength - safeIndex)),
    insert: String(edit.insert || ""),
  };
}

function replaceText(text: Y.Text, value: string) {
  if (text.length > 0) {
    text.delete(0, text.length);
  }
  if (value) {
    text.insert(0, value);
  }
}

function applyTextEdit(text: Y.Text, edit: IdeaCollabTextEdit) {
  const normalized = normalizeTextEdit(edit, text.length);

  if (normalized.deleteCount > 0) {
    text.delete(normalized.index, normalized.deleteCount);
  }
  if (normalized.insert) {
    text.insert(normalized.index, normalized.insert);
  }
}

export class IdeaCollabDoc {
  readonly ydoc: Y.Doc;
  private readonly root: Y.Map<unknown>;
  private readonly titleText: Y.Text;
  private readonly blocksArray: Y.Array<Y.Map<unknown>>;

  constructor(snapshot: Partial<IdeaCollabSnapshot> = {}, ydoc = new Y.Doc()) {
    this.ydoc = ydoc;
    this.root = this.ydoc.getMap(ROOT_KEY);
    this.titleText = this.ydoc.getText(TITLE_DOC_KEY);
    this.blocksArray = this.ydoc.getArray<Y.Map<unknown>>(BLOCKS_DOC_KEY);

    this.ydoc.transact(() => {
      this.root.set(TITLE_KEY, TITLE_DOC_KEY);
      this.root.set(BLOCKS_KEY, BLOCKS_DOC_KEY);

      if (this.titleText.length === 0 && snapshot.title) {
        this.titleText.insert(0, String(snapshot.title));
      }

      const normalizedBlocks = Array.isArray(snapshot.blocks) ? snapshot.blocks.map(normalizeBlock) : [];
      if (normalizedBlocks.length && this.blocksArray.length === 0) {
        this.blocksArray.insert(0, normalizedBlocks.map((block) => createBlockMap(block)));
      }
    });
  }

  static fromSnapshot(snapshot: Partial<IdeaCollabSnapshot>) {
    return new IdeaCollabDoc(snapshot);
  }

  getSnapshot(): IdeaCollabSnapshot {
    return {
      title: this.titleText.toString(),
      blocks: this.blocksArray.toArray().map(readBlockMap),
    };
  }

  toCheckpoint(): IdeaCollabCheckpointSnapshot {
    return this.getSnapshot();
  }

  setTitle(title: string) {
    this.ydoc.transact(() => {
      replaceText(this.titleText, title);
    });
  }

  editTitle(edit: IdeaCollabTextEdit) {
    this.ydoc.transact(() => {
      applyTextEdit(this.titleText, edit);
    });
  }

  private getBlockMap(blockId: string) {
    const index = this.indexOfBlock(blockId);

    if (index < 0) {
      throw new Error(`Unknown block id: ${blockId}`);
    }

    return this.blocksArray.get(index);
  }

  private getBlockContentText(blockMap: Y.Map<unknown>) {
    const existing = blockMap.get("content");

    if (existing instanceof Y.Text) {
      return existing;
    }

    const contentText = new Y.Text();
    const legacyContent = String(existing || "");

    if (legacyContent) {
      contentText.insert(0, legacyContent);
    }

    blockMap.set("content", contentText);
    return contentText;
  }

  updateBlock(blockId: string, patch: BlockPatch) {
    const blockMap = this.getBlockMap(blockId);

    this.ydoc.transact(() => {
      if (patch.type !== undefined) blockMap.set("type", patch.type);
      if (patch.content !== undefined) replaceText(this.getBlockContentText(blockMap), patch.content);
      if (patch.checked !== undefined) blockMap.set("checked", patch.checked);
    });
  }

  setBlockType(blockId: string, type: string) {
    this.updateBlock(blockId, { type });
  }

  editBlockContent(blockId: string, edit: IdeaCollabTextEdit) {
    const blockMap = this.getBlockMap(blockId);

    this.ydoc.transact(() => {
      applyTextEdit(this.getBlockContentText(blockMap), edit);
    });
  }

  insertBlockAfter(afterBlockId: string | null, block: Partial<Block>) {
    const normalized = normalizeBlock(block);
    const insertAt = afterBlockId === null ? 0 : this.indexOfBlock(afterBlockId) + 1;
    if (insertAt < 0) {
      throw new Error(`Unknown block id: ${afterBlockId}`);
    }
    this.blocksArray.insert(insertAt, [createBlockMap(normalized)]);
  }

  deleteBlock(blockId: string) {
    const index = this.indexOfBlock(blockId);

    if (index < 0) {
      throw new Error(`Unknown block id: ${blockId}`);
    }

    this.blocksArray.delete(index, 1);
  }

  moveBlock(blockId: string, targetIndex: number) {
    const currentIndex = this.indexOfBlock(blockId);
    if (currentIndex < 0) {
      throw new Error(`Unknown block id: ${blockId}`);
    }
    const boundedTarget = Math.max(0, Math.min(targetIndex, this.blocksArray.length - 1));
    if (boundedTarget === currentIndex) {
      return;
    }
    const blockSnapshot = readBlockMap(this.blocksArray.get(currentIndex));
    this.ydoc.transact(() => {
      this.blocksArray.delete(currentIndex, 1);
      this.blocksArray.insert(boundedTarget, [createBlockMap(blockSnapshot)]);
    });
  }

  toggleChecklist(blockId: string, checked: boolean) {
    this.updateBlock(blockId, { checked });
  }

  replaceBlocks(blocks: Array<Partial<Block>>) {
    const normalizedBlocks = blocks.map(normalizeBlock);
    this.ydoc.transact(() => {
      if (this.blocksArray.length) {
        this.blocksArray.delete(0, this.blocksArray.length);
      }
      if (normalizedBlocks.length) {
        this.blocksArray.insert(0, normalizedBlocks.map((block) => createBlockMap(block)));
      }
    });
  }

  indexOfBlock(blockId: string) {
    return this.blocksArray.toArray().findIndex((blockMap) => String(blockMap.get("id") || "") === blockId);
  }

  encodeState() {
    return Y.encodeStateAsUpdate(this.ydoc);
  }

  applyUpdate(update: Uint8Array, origin?: unknown) {
    Y.applyUpdate(this.ydoc, update, origin);
  }
}

export function mergeCollabUpdates(base: IdeaCollabDoc, ...updates: Uint8Array[]) {
  updates.forEach((update) => {
    base.applyUpdate(update);
  });
  return base.getSnapshot();
}

export function encodeCollabUpdate(update: Uint8Array) {
  return Buffer.from(update).toString("base64");
}

export function decodeCollabUpdate(encoded: string) {
  return new Uint8Array(Buffer.from(encoded, "base64"));
}

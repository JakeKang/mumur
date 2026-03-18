"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Idea, IdeaStatus } from "@/types";
import { STATUS_META as STATUS_META_DEFAULT } from "@/lib/idea-status";
import { EditorBlock, detectBlockType } from "./EditorBlock";
import type { EditorBlockData, BlockType } from "./EditorBlock";
import { useAutoSave } from "./useAutoSave";
import type { SaveStatus } from "./useAutoSave";

function genId() {
  return `b-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function toEditorBlocks(raw: Idea["blocks"]): EditorBlockData[] {
  if (!raw || raw.length === 0) {
    return [{ id: genId(), type: "paragraph", content: "" }];
  }
  return raw.map((b) => ({
    id: b.id || genId(),
    type: (b.type as BlockType) || "paragraph",
    content: b.content || "",
    checked: Boolean(b.checked),
  }));
}

function SaveStatusBadge({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  if (status === "idle") return null;
  const map: Record<string, { text: string; cls: string }> = {
    dirty:  { text: "변경됨",     cls: "text-[var(--muted)]" },
    saving: { text: "저장 중...", cls: "text-[var(--muted)] animate-pulse" },
    saved:  { text: "저장됨 ✓",  cls: "text-emerald-600" },
    error:  { text: "저장 실패 — 재시도", cls: "text-rose-600 cursor-pointer underline" },
  };
  const { text, cls } = map[status] ?? map.dirty;
  return (
    <span
      className={`fixed right-6 top-3 z-50 select-none text-xs ${cls}`}
      onClick={status === "error" ? onRetry : undefined}
    >
      {text}
    </span>
  );
}

type BlockEditorProps = {
  idea: Idea;
  onSaveBlocks: (blocks: EditorBlockData[]) => Promise<void>;
  onSaveTitle: (title: string) => Promise<void>;
  onSaveStatus?: (status: IdeaStatus) => Promise<void>;
  STATUS_META: typeof STATUS_META_DEFAULT;
  formatTime: (ts: number) => string;
};

export function BlockEditor({
  idea,
  onSaveBlocks,
  onSaveTitle,
  onSaveStatus,
  STATUS_META,
  formatTime,
}: BlockEditorProps) {
  const [blocks, setBlocks] = useState<EditorBlockData[]>(() => toEditorBlocks(idea.blocks));
  const [title, setTitle] = useState(idea.title ?? "");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  const saveAll = useCallback(async () => {
    await Promise.all([onSaveBlocks(blocks), onSaveTitle(title)]);
  }, [blocks, title, onSaveBlocks, onSaveTitle]);

  const { status, flush, markDirty } = useAutoSave(saveAll, 800);

  const updateBlocks = useCallback(
    (next: EditorBlockData[]) => {
      setBlocks(next);
      markDirty();
    },
    [markDirty]
  );

  const updateTitle = useCallback(
    (val: string) => {
      setTitle(val);
      markDirty();
    },
    [markDirty]
  );

  const addBlock = useCallback(
    (afterIndex: number, type: BlockType = "paragraph") => {
      const newBlock: EditorBlockData = { id: genId(), type, content: "" };
      setBlocks((prev) => {
        const next = [...prev];
        next.splice(afterIndex + 1, 0, newBlock);
        return next;
      });
      setEditingIndex(afterIndex + 1);
      markDirty();
    },
    [markDirty]
  );

  const handleChange = useCallback(
    (index: number, content: string, type?: BlockType) => {
      setBlocks((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], content, ...(type ? { type } : {}) };
        return next;
      });
      markDirty();
    },
    [markDirty]
  );

  const handleEnter = useCallback(
    (index: number) => {
      addBlock(index);
    },
    [addBlock]
  );

  const handleDelete = useCallback(
    (index: number) => {
      setBlocks((prev) => {
        if (prev.length <= 1) {
          return [{ id: genId(), type: "paragraph", content: "" }];
        }
        const next = [...prev];
        next.splice(index, 1);
        return next;
      });
      setEditingIndex(Math.max(0, index - 1));
      markDirty();
    },
    [markDirty]
  );

  const statusMeta = STATUS_META[idea.status] ?? { icon: "💡", label: idea.status };

  return (
    <div className="flex h-full flex-col">
      <SaveStatusBadge status={status} onRetry={flush} />

      {/* Title + meta */}
      <div className="px-8 pb-4 pt-8">
        <textarea
          ref={titleRef}
          className="w-full resize-none border-0 bg-transparent font-serif text-3xl font-bold leading-snug text-[var(--foreground)] outline-none placeholder:text-[var(--muted)]"
          placeholder="제목 없음"
          value={title}
          rows={1}
          onChange={(e) => {
            e.target.style.height = "auto";
            e.target.style.height = `${e.target.scrollHeight}px`;
            updateTitle(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              setEditingIndex(0);
            }
          }}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
          {onSaveStatus ? (
            <select
              className="rounded border border-[var(--border)] bg-transparent px-1.5 py-0.5 text-xs text-[var(--foreground)]"
              value={idea.status}
              onChange={(e) => {
                onSaveStatus(e.target.value as IdeaStatus);
                markDirty();
              }}
            >
              {Object.entries(STATUS_META).map(([key, meta]) => (
                <option key={key} value={key}>
                  {meta.icon} {meta.label}
                </option>
              ))}
            </select>
          ) : (
            <span className="rounded border border-[var(--border)] px-1.5 py-0.5">
              {statusMeta.icon} {statusMeta.label}
            </span>
          )}
          <span>수정 {formatTime(idea.updatedAt)}</span>
        </div>
      </div>

      {/* Block list */}
      <div
        className="flex-1 overflow-auto px-8 pb-20"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setEditingIndex(blocks.length - 1);
          }
        }}
      >
        {blocks.map((block, index) => (
          <div key={block.id} className="py-0.5">
            <EditorBlock
              block={block}
              isEditing={editingIndex === index}
              autoFocus={editingIndex === index}
              onFocus={() => setEditingIndex(index)}
              onChange={(content, type) => handleChange(index, content, type)}
              onEnter={() => handleEnter(index)}
              onDelete={() => handleDelete(index)}
            />
          </div>
        ))}

        {/* Click-to-add area */}
        <div
          className="min-h-[60px] cursor-text py-2"
          onClick={() => {
            const last = blocks.length - 1;
            if (blocks[last]?.content === "" && blocks[last]?.type === "paragraph") {
              setEditingIndex(last);
            } else {
              addBlock(last);
            }
          }}
        />
      </div>
    </div>
  );
}

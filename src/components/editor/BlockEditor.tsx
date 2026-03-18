"use client";

import { useCallback, useRef, useState } from "react";
import type { Idea, IdeaStatus, Comment } from "@/types";
import { STATUS_META as STATUS_META_DEFAULT } from "@/lib/idea-status";
import { EditorBlock } from "./EditorBlock";
import type { EditorBlockData, BlockType } from "./EditorBlock";
import { useAutoSave } from "./useAutoSave";
import type { SaveStatus } from "./useAutoSave";

const QUICK_EMOJIS = ["👍", "❤️", "🎉", "😮", "🤔"];

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

const BLOCK_TYPE_OPTIONS: { type: BlockType; icon: string; label: string }[] = [
  { type: "paragraph",    icon: "¶",  label: "단락" },
  { type: "heading1",     icon: "H1", label: "제목 1" },
  { type: "heading2",     icon: "H2", label: "제목 2" },
  { type: "heading3",     icon: "H3", label: "제목 3" },
  { type: "bulletList",   icon: "•",  label: "글머리 목록" },
  { type: "numberedList", icon: "1.", label: "번호 목록" },
  { type: "checklist",    icon: "☑",  label: "체크리스트" },
  { type: "quote",        icon: "❝",  label: "인용" },
  { type: "code",         icon: "</>", label: "코드" },
  { type: "divider",      icon: "—",  label: "구분선" },
];

function SaveStatusBadge({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  if (status === "idle") return null;
  const map: Record<string, { text: string; cls: string }> = {
    dirty:  { text: "변경됨",            cls: "text-[var(--muted)]" },
    saving: { text: "저장 중...",        cls: "text-[var(--muted)] animate-pulse" },
    saved:  { text: "저장됨 ✓",         cls: "text-emerald-600" },
    error:  { text: "저장 실패 — 재시도", cls: "text-rose-600 cursor-pointer underline" },
  };
  const { text, cls } = map[status] ?? map.dirty;
  return (
    <span
      role={status === "error" ? "button" : undefined}
      tabIndex={status === "error" ? 0 : undefined}
      className={`fixed right-6 top-3 z-50 select-none text-xs ${cls}`}
      onClick={status === "error" ? onRetry : undefined}
      onKeyDown={status === "error" ? (e) => e.key === "Enter" && onRetry() : undefined}
    >
      {text}
    </span>
  );
}

type BlockRowProps = {
  block: EditorBlockData;
  index: number;
  total: number;
  isEditing: boolean;
  isDragOver: boolean;
  commentCount: number;
  blockReactions: { emoji: string; count: number; mine: boolean }[];
  onFocus: () => void;
  onChange: (content: string, type?: BlockType) => void;
  onEnter: () => void;
  onDelete: () => void;
  onTypeChange: (type: BlockType) => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onOpenComments: () => void;
  onReaction: (emoji: string) => void;
};

function BlockRow({
  block,
  index,
  total,
  isEditing,
  isDragOver,
  commentCount,
  blockReactions,
  onFocus,
  onChange,
  onEnter,
  onDelete,
  onTypeChange,
  onDragStart,
  onDragOver,
  onDrop,
  onOpenComments,
  onReaction,
}: BlockRowProps) {
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={rowRef}
      className={`group/row relative flex items-start gap-1 py-0.5 ${isDragOver ? "border-t-2 border-[var(--accent)]" : ""}`}
      onDragOver={(e) => { e.preventDefault(); onDragOver(e); }}
      onDrop={onDrop}
    >
      <div className="invisible flex shrink-0 flex-col items-center gap-0.5 pt-1 group-hover/row:visible">
        <button
          type="button"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            onDragStart();
          }}
          aria-label="드래그하여 이동"
          title="드래그하여 이동"
          className="cursor-grab rounded p-0.5 text-xs text-[var(--muted)] hover:bg-[var(--surface-strong)] active:cursor-grabbing"
        >
          ⠿
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setTypeMenuOpen((v) => !v)}
            aria-label="블록 타입 변경"
            title="블록 타입 변경"
            className="rounded p-0.5 text-xs text-[var(--muted)] hover:bg-[var(--surface-strong)]"
          >
            ⋮
          </button>

          {typeMenuOpen && (
            <div
              className="absolute left-6 top-0 z-50 w-40 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1 shadow-lg"
              onMouseLeave={() => setTypeMenuOpen(false)}
            >
              {BLOCK_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.type}
                  type="button"
                  onClick={() => { onTypeChange(opt.type); setTypeMenuOpen(false); }}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs transition hover:bg-[var(--surface-strong)] ${block.type === opt.type ? "font-semibold text-[var(--foreground)]" : "text-[var(--muted)]"}`}
                >
                  <span className="w-5 text-center font-mono">{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
              <div className="my-1 border-t border-[var(--border)]" />
              <button
                type="button"
                onClick={() => { onDelete(); setTypeMenuOpen(false); }}
                disabled={total <= 1}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs text-rose-500 transition hover:bg-rose-50 disabled:opacity-40"
              >
                <span className="w-5 text-center">🗑</span>
                삭제
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <EditorBlock
          block={block}
          isEditing={isEditing}
          autoFocus={isEditing}
          onFocus={onFocus}
          onChange={onChange}
          onEnter={onEnter}
          onDelete={onDelete}
        />

        {blockReactions.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {blockReactions.map((r) => (
              <button
                key={r.emoji}
                type="button"
                onClick={() => onReaction(r.emoji)}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition ${r.mine ? "border-[var(--accent)] bg-[var(--accent)]/10" : "border-[var(--border)] hover:border-[var(--accent)]/50"}`}
              >
                {r.emoji} {r.count}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="invisible ml-1 flex shrink-0 items-start gap-1 pt-1 group-hover/row:visible">
        <div className="relative">
          <button
            type="button"
            onClick={() => setReactionPickerOpen((v) => !v)}
            title="리액션 추가"
            aria-label="리액션 추가"
            className="rounded p-0.5 text-xs text-[var(--muted)] hover:bg-[var(--surface-strong)]"
          >
            😊
          </button>
          {reactionPickerOpen && (
            <div className="absolute right-0 top-6 z-50 flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-lg">
              {QUICK_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => { onReaction(emoji); setReactionPickerOpen(false); }}
                  className="rounded p-1 text-base hover:bg-[var(--surface-strong)] transition"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        {commentCount > 0 && (
          <button
            type="button"
            onClick={onOpenComments}
            title={`댓글 ${commentCount}개`}
            aria-label={`댓글 ${commentCount}개`}
            className="inline-flex items-center gap-0.5 rounded-full border border-[var(--border)] bg-[var(--surface-strong)] px-1.5 py-0.5 text-xs text-[var(--muted)] hover:border-[var(--accent)]/50 transition"
          >
            💬 {commentCount}
          </button>
        )}
      </div>
    </div>
  );
}

type BlockEditorProps = {
  idea: Idea;
  comments?: Comment[];
  readOnly?: boolean;
  onSaveBlocks: (blocks: EditorBlockData[]) => Promise<void>;
  onSaveTitle: (title: string) => Promise<void>;
  onSaveStatus?: (status: IdeaStatus) => Promise<void>;
  onOpenBlockComments?: (blockId: string) => void;
  onBlockReaction?: (blockId: string, emoji: string) => void;
  STATUS_META: typeof STATUS_META_DEFAULT;
  formatTime: (ts: number) => string;
};

export function BlockEditor({
  idea,
  comments = [],
  readOnly = false,
  onSaveBlocks,
  onSaveTitle,
  onSaveStatus,
  STATUS_META,
  formatTime,
  onOpenBlockComments,
  onBlockReaction,
}: BlockEditorProps) {
  const commentsByBlock = comments.reduce<Record<string, number>>((acc, c) => {
    if (c.blockId) acc[c.blockId] = (acc[c.blockId] ?? 0) + 1;
    return acc;
  }, {});
  const [blocks, setBlocks] = useState<EditorBlockData[]>(() => toEditorBlocks(idea.blocks));
  const [title, setTitle] = useState(idea.title ?? "");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const saveAll = useCallback(async () => {
    await Promise.all([onSaveBlocks(blocks), onSaveTitle(title)]);
  }, [blocks, title, onSaveBlocks, onSaveTitle]);

  const { status, flush, markDirty } = useAutoSave(saveAll, 800);

  const updateTitle = useCallback(
    (val: string) => { setTitle(val); markDirty(); },
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

  const handleDelete = useCallback(
    (index: number) => {
      setBlocks((prev) => {
        if (prev.length <= 1) return [{ id: genId(), type: "paragraph", content: "" }];
        const next = [...prev];
        next.splice(index, 1);
        return next;
      });
      setEditingIndex(Math.max(0, index - 1));
      markDirty();
    },
    [markDirty]
  );

  const handleTypeChange = useCallback(
    (index: number, type: BlockType) => {
      setBlocks((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], type };
        return next;
      });
      markDirty();
    },
    [markDirty]
  );

  const handleDrop = useCallback(
    (dropIndex: number) => {
      if (dragIndex === null || dragIndex === dropIndex) return;
      setBlocks((prev) => {
        const next = [...prev];
        const [moved] = next.splice(dragIndex, 1);
        const insertAt = dragIndex < dropIndex ? dropIndex - 1 : dropIndex;
        next.splice(insertAt, 0, moved);
        return next;
      });
      setDragIndex(null);
      setDragOverIndex(null);
      markDirty();
    },
    [dragIndex, markDirty]
  );

  const statusMeta = STATUS_META[idea.status] ?? { icon: "💡", label: idea.status };

  return (
    <div className="flex h-full flex-col">
      <SaveStatusBadge status={status} onRetry={flush} />

      {readOnly && (
        <div className="flex items-center gap-2 border-b border-[var(--border)] bg-amber-50 px-4 py-2 text-xs text-amber-700">
          <span>🔒</span>
          <span>보기 전용 — 이 워크스페이스에서는 편집 권한이 없습니다.</span>
        </div>
      )}

      <div className="px-4 pb-4 pt-6 md:px-8 md:pt-8">
        <textarea
          className="w-full resize-none border-0 bg-transparent font-serif text-2xl font-bold leading-snug text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] md:text-3xl"
          placeholder="제목 없음"
          value={title}
          readOnly={readOnly}
          rows={1}
          onChange={(e) => {
            e.target.style.height = "auto";
            e.target.style.height = `${e.target.scrollHeight}px`;
            updateTitle(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); setEditingIndex(0); }
          }}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
          {onSaveStatus ? (
            <select
              className="rounded border border-[var(--border)] bg-transparent px-1.5 py-0.5 text-xs text-[var(--foreground)]"
              value={idea.status}
              onChange={(e) => { onSaveStatus(e.target.value as IdeaStatus); markDirty(); }}
            >
              {Object.entries(STATUS_META).map(([key, meta]) => (
                <option key={key} value={key}>{meta.icon} {meta.label}</option>
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

      <div
        className="flex-1 overflow-auto px-4 pb-20 md:px-8"
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => { setDragIndex(null); setDragOverIndex(null); }}
        role="region"
        aria-label="블록 에디터"
        onClick={(e) => {
          if (e.target === e.currentTarget) setEditingIndex(blocks.length - 1);
        }}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
            setEditingIndex(blocks.length - 1);
          }
        }}
        tabIndex={0}
      >
        {blocks.map((block, index) => (
          <BlockRow
            key={block.id}
            block={block}
            index={index}
            total={blocks.length}
            isEditing={editingIndex === index}
            isDragOver={dragOverIndex === index}
            commentCount={commentsByBlock[block.id] ?? 0}
            blockReactions={[]}
            onFocus={() => setEditingIndex(index)}
            onChange={(content, type) => handleChange(index, content, type)}
            onEnter={() => addBlock(index)}
            onDelete={() => handleDelete(index)}
            onTypeChange={(type) => handleTypeChange(index, type)}
            onDragStart={() => setDragIndex(index)}
            onDragOver={() => setDragOverIndex(index)}
            onDrop={() => handleDrop(index)}
            onOpenComments={() => onOpenBlockComments?.(block.id)}
            onReaction={(emoji) => onBlockReaction?.(block.id, emoji)}
          />
        ))}

        <div
          role="button"
          tabIndex={0}
          className="min-h-[60px] cursor-text py-2"
          onClick={() => {
            const last = blocks.length - 1;
            if (blocks[last]?.content === "" && blocks[last]?.type === "paragraph") {
              setEditingIndex(last);
            } else {
              addBlock(last);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") addBlock(blocks.length - 1);
          }}
          aria-label="새 블록 추가"
        />
      </div>
    </div>
  );
}

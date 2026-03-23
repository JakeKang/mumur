"use client";

import { useCallback, useMemo, useRef, useState } from "react";
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

function normalizeBlockType(rawType: string | undefined): BlockType {
  const value = String(rawType || "").trim();
  if (!value) {
    return "paragraph";
  }
  if (
    value === "paragraph" ||
    value === "heading1" ||
    value === "heading2" ||
    value === "heading3" ||
    value === "bulletList" ||
    value === "numberedList" ||
    value === "checklist" ||
    value === "quote" ||
    value === "code" ||
    value === "divider" ||
    value === "file"
  ) {
    return value;
  }
  if (value === "text") {
    return "paragraph";
  }
  if (value === "heading") {
    return "heading2";
  }
  if (value === "image") {
    return "file";
  }
  return "paragraph";
}

function toEditorBlocks(raw: Idea["blocks"]): EditorBlockData[] {
  if (!raw || raw.length === 0) {
    return [{ id: genId(), type: "paragraph", content: "" }];
  }
  return raw.map((b) => ({
    id: b.id || genId(),
    type: normalizeBlockType(b.type),
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
  { type: "file",         icon: "📎", label: "파일" },
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
  if (status === "error") {
    return (
      <button
        type="button"
        className={`fixed right-6 top-3 z-50 select-none text-xs ${cls}`}
        onClick={onRetry}
      >
        {text}
      </button>
    );
  }
  return (
    <span className={`fixed right-6 top-3 z-50 select-none text-xs ${cls}`}>
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
  isSelected: boolean;
  readOnly: boolean;
  commentCount: number;
  blockReactions: { emoji: string; count: number; mine: boolean }[];
  onFocus: () => void;
  onToggleSelect: (shiftKey: boolean) => void;
  onChange: (content: string, type?: BlockType) => void;
  onEnter: () => void;
  onDelete: () => void;
  onTypeChange: (type: BlockType) => void;
  onDragStart: () => void;
  onOpenComments: () => void;
  onReaction: (emoji: string) => void;
  onFileUpload: (file: File) => Promise<void>;
};

function BlockRow({
  block,
  index,
  total,
  isEditing,
  isDragOver,
  isSelected,
  readOnly,
  commentCount,
  blockReactions,
  onFocus,
  onToggleSelect,
  onChange,
  onEnter,
  onDelete,
  onTypeChange,
  onDragStart,
  onOpenComments,
  onReaction,
  onFileUpload,
}: BlockRowProps) {
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const rowRef = useRef<HTMLElement>(null);
  const dragTriggeredRef = useRef(false);

  return (
    <section
      ref={rowRef}
      role="presentation"
      data-block-index={index}
      className={`group/row relative flex items-start gap-1 py-0.5 ${isDragOver ? "border-t-2 border-[var(--accent)]" : ""} ${isSelected ? "rounded-md bg-[var(--accent)]/10" : ""}`}
    >
      <div className="relative flex shrink-0 flex-col items-center gap-0.5 pt-1 md:invisible md:group-hover/row:visible">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleSelect(event.shiftKey);
          }}
          aria-label="블록 선택"
          title="Shift+클릭으로 범위 선택"
          className={`h-4 w-4 rounded border text-[10px] leading-none transition ${isSelected ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--accent)]/60"}`}
        >
          {isSelected ? "✓" : ""}
        </button>
        <button
          type="button"
          draggable={!readOnly}
          onDragStart={(e) => {
            if (readOnly) {
              e.preventDefault();
              return;
            }
            dragTriggeredRef.current = true;
            e.dataTransfer.effectAllowed = "move";
            onDragStart();
          }}
          onDragEnd={() => {
            setTimeout(() => {
              dragTriggeredRef.current = false;
            }, 0);
          }}
          onClick={() => {
            if (readOnly) {
              return;
            }
            if (dragTriggeredRef.current) {
              return;
            }
            setTypeMenuOpen((v) => !v);
          }}
          aria-label="블록 이동 및 타입 변경"
          title="드래그: 이동 · 클릭: 타입 변경"
          className={`rounded p-0.5 text-xs text-[var(--muted)] hover:bg-[var(--surface-strong)] ${readOnly ? "cursor-not-allowed opacity-50" : "cursor-grab active:cursor-grabbing"}`}
          disabled={readOnly}
        >
          ⠿
        </button>

        {typeMenuOpen && (
          <div
            className="absolute left-6 top-0 z-50 w-40 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1 shadow-lg"
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

      <div className="min-w-0 flex-1">
        <EditorBlock
          block={block}
          isEditing={isEditing}
          autoFocus={isEditing}
          onFocus={onFocus}
          onChange={onChange}
          onFileUpload={onFileUpload}
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

      <div className="ml-1 flex shrink-0 items-start gap-1 pt-1 md:invisible md:group-hover/row:visible">
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
    </section>
  );
}

type BlockEditorProps = {
  idea: Idea;
  comments?: Comment[];
  reactionsByTarget?: Record<string, { reactions: Array<{ emoji: string; count: number }>; mine: string[] }>;
  readOnly?: boolean;
  onSaveBlocks: (blocks: EditorBlockData[]) => Promise<void>;
  onSaveTitle: (title: string) => Promise<void>;
  onSaveStatus?: (status: IdeaStatus) => Promise<void>;
  onOpenBlockComments?: (blockId: string) => void;
  onBlockReaction?: (blockId: string, emoji: string) => void;
  onUploadFile?: (blockId: string, file: File) => Promise<{ name: string; size: number; type: string; filePath: string; status: string }>;
  STATUS_META: typeof STATUS_META_DEFAULT;
  formatTime: (ts: number) => string;
};

export function BlockEditor({
  idea,
  comments = [],
  reactionsByTarget = {},
  readOnly = false,
  onSaveBlocks,
  onSaveTitle,
  onSaveStatus,
  STATUS_META,
  formatTime,
  onOpenBlockComments,
  onBlockReaction,
  onUploadFile,
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
  const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([]);
  const [selectionAnchor, setSelectionAnchor] = useState<number | null>(null);
  const selectedIdSet = useMemo(() => new Set(selectedBlockIds), [selectedBlockIds]);
  const selectedCount = selectedBlockIds.length;

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
      if (readOnly) {
        return;
      }
      const newBlock: EditorBlockData = { id: genId(), type, content: "" };
      setBlocks((prev) => {
        const next = [...prev];
        next.splice(afterIndex + 1, 0, newBlock);
        return next;
      });
      setSelectedBlockIds([]);
      setSelectionAnchor(null);
      setEditingIndex(afterIndex + 1);
      markDirty();
    },
    [markDirty, readOnly]
  );

  const handleChange = useCallback(
    (index: number, content: string, type?: BlockType) => {
      if (readOnly) {
        return;
      }
      setBlocks((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], content, ...(type ? { type } : {}) };
        return next;
      });
      markDirty();
    },
    [markDirty, readOnly]
  );

  const handleDelete = useCallback(
    (index: number) => {
      if (readOnly) {
        return;
      }
      setBlocks((prev) => {
        if (prev.length <= 1) return [{ id: genId(), type: "paragraph", content: "" }];
        const next = [...prev];
        const removed = next[index];
        next.splice(index, 1);
        if (removed) {
          setSelectedBlockIds((ids) => ids.filter((id) => id !== removed.id));
        }
        return next;
      });
      setEditingIndex(Math.max(0, index - 1));
      markDirty();
    },
    [markDirty, readOnly]
  );

  const handleTypeChange = useCallback(
    (index: number, type: BlockType) => {
      if (readOnly) {
        return;
      }
      setBlocks((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], type };
        return next;
      });
      markDirty();
    },
    [markDirty, readOnly]
  );

  const handleDrop = useCallback(
    (dropIndex: number) => {
      if (readOnly) {
        return;
      }
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
    [dragIndex, markDirty, readOnly]
  );

  const statusMeta = STATUS_META[idea.status] ?? { icon: "💡", label: idea.status };

  const toggleBlockSelection = useCallback(
    (index: number, shiftKey: boolean) => {
      if (readOnly) {
        return;
      }
      const target = blocks[index];
      if (!target) {
        return;
      }
      if (shiftKey && selectionAnchor !== null && blocks[selectionAnchor]) {
        const start = Math.min(selectionAnchor, index);
        const end = Math.max(selectionAnchor, index);
        const rangeIds = blocks.slice(start, end + 1).map((item) => item.id);
        setSelectedBlockIds((prev) => Array.from(new Set([...prev, ...rangeIds])));
      } else {
        setSelectedBlockIds((prev) => (prev.includes(target.id) ? prev.filter((id) => id !== target.id) : [...prev, target.id]));
        setSelectionAnchor(index);
      }
      setEditingIndex(index);
    },
    [blocks, readOnly, selectionAnchor]
  );

  const clearSelection = useCallback(() => {
    setSelectedBlockIds([]);
    setSelectionAnchor(null);
  }, []);

  const selectAllBlocks = useCallback(() => {
    if (readOnly) {
      return;
    }
    setSelectedBlockIds(blocks.map((item) => item.id));
    setSelectionAnchor(0);
  }, [blocks, readOnly]);

  const deleteSelectedBlocks = useCallback(() => {
    if (readOnly || selectedCount === 0) {
      return;
    }
    setBlocks((prev) => {
      const selected = new Set(selectedBlockIds);
      const next = prev.filter((item) => !selected.has(item.id));
      if (next.length === 0) {
        return [{ id: genId(), type: "paragraph", content: "" }];
      }
      return next;
    });
    setSelectedBlockIds([]);
    setSelectionAnchor(null);
    setEditingIndex(0);
    markDirty();
  }, [markDirty, readOnly, selectedBlockIds, selectedCount]);

  const changeSelectedType = useCallback(
    (type: BlockType) => {
      if (readOnly || selectedCount === 0) {
        return;
      }
      const selected = new Set(selectedBlockIds);
      setBlocks((prev) => prev.map((item) => (selected.has(item.id) ? { ...item, type } : item)));
      markDirty();
    },
    [markDirty, readOnly, selectedBlockIds, selectedCount]
  );

  const moveSelected = useCallback(
    (direction: "up" | "down") => {
      if (readOnly || selectedCount === 0) {
        return;
      }
      const selected = new Set(selectedBlockIds);
      setBlocks((prev) => {
        const next = [...prev];
        if (direction === "up") {
          for (let idx = 1; idx < next.length; idx += 1) {
            if (selected.has(next[idx].id) && !selected.has(next[idx - 1].id)) {
              const current = next[idx];
              next[idx] = next[idx - 1];
              next[idx - 1] = current;
            }
          }
        } else {
          for (let idx = next.length - 2; idx >= 0; idx -= 1) {
            if (selected.has(next[idx].id) && !selected.has(next[idx + 1].id)) {
              const current = next[idx];
              next[idx] = next[idx + 1];
              next[idx + 1] = current;
            }
          }
        }
        return next;
      });
      markDirty();
    },
    [markDirty, readOnly, selectedBlockIds, selectedCount]
  );

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
              onChange={(e) => {
                if (readOnly) {
                  return;
                }
                onSaveStatus(e.target.value as IdeaStatus);
                markDirty();
              }}
              disabled={readOnly}
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

      <section
        className="flex-1 overflow-auto px-4 pb-20 md:px-8"
        onDragOver={(event) => {
          event.preventDefault();
          const target = (event.target as HTMLElement).closest("[data-block-index]") as HTMLElement | null;
          if (!target) {
            return;
          }
          const raw = Number(target.dataset.blockIndex);
          if (Number.isInteger(raw) && raw >= 0) {
            setDragOverIndex(raw);
          }
        }}
        onDrop={() => {
          if (dragOverIndex !== null) {
            handleDrop(dragOverIndex);
          }
          setDragIndex(null);
          setDragOverIndex(null);
        }}
        aria-label="블록 에디터"
      >
        {!readOnly ? (
          <div className="sticky top-0 z-20 mb-2 flex flex-wrap items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs">
            <button type="button" className="rounded border border-[var(--border)] px-2 py-1" onClick={selectAllBlocks}>전체 선택</button>
            <button type="button" className="rounded border border-[var(--border)] px-2 py-1" onClick={clearSelection} disabled={selectedCount === 0}>선택 해제</button>
            <span className="rounded bg-[var(--surface-strong)] px-2 py-1 text-[var(--muted)]">{`선택 ${selectedCount}`}</span>
            <div className="ml-auto flex flex-wrap items-center gap-1">
              <button type="button" className="rounded border border-[var(--border)] px-2 py-1" onClick={() => moveSelected("up")} disabled={selectedCount === 0}>위로</button>
              <button type="button" className="rounded border border-[var(--border)] px-2 py-1" onClick={() => moveSelected("down")} disabled={selectedCount === 0}>아래로</button>
              <select
                className="h-7 rounded border border-[var(--border)] bg-[var(--surface)] px-1"
                defaultValue=""
                onChange={(event) => {
                  const value = event.target.value as BlockType;
                  if (value) {
                    changeSelectedType(value);
                    event.currentTarget.value = "";
                  }
                }}
                disabled={selectedCount === 0}
              >
                <option value="">타입 변경</option>
                {BLOCK_TYPE_OPTIONS.map((opt) => (
                  <option key={`batch-type-${opt.type}`} value={opt.type}>{opt.label}</option>
                ))}
              </select>
              <button type="button" className="rounded border border-rose-200 px-2 py-1 text-rose-600" onClick={deleteSelectedBlocks} disabled={selectedCount === 0}>삭제</button>
            </div>
          </div>
        ) : null}

        {blocks.map((block, index) => {
          const reactionSummary = reactionsByTarget[`block:${block.id}`] || { reactions: [], mine: [] };
          const blockReactions = (reactionSummary.reactions || []).map((item) => ({
            emoji: item.emoji,
            count: Number(item.count || 0),
            mine: (reactionSummary.mine || []).includes(item.emoji)
          }));

          return (
          <BlockRow
            key={block.id}
            block={block}
            index={index}
            total={blocks.length}
            isEditing={!readOnly && editingIndex === index}
            isDragOver={dragOverIndex === index}
            isSelected={selectedIdSet.has(block.id)}
            readOnly={readOnly}
            commentCount={commentsByBlock[block.id] ?? 0}
            blockReactions={blockReactions}
            onFocus={() => {
              if (!readOnly) {
                setEditingIndex(index);
              }
            }}
            onToggleSelect={(shiftKey) => toggleBlockSelection(index, shiftKey)}
            onChange={(content, type) => handleChange(index, content, type)}
            onEnter={() => addBlock(index)}
            onDelete={() => handleDelete(index)}
            onTypeChange={(type) => handleTypeChange(index, type)}
            onDragStart={() => setDragIndex(index)}
            onOpenComments={() => onOpenBlockComments?.(block.id)}
            onReaction={(emoji) => onBlockReaction?.(block.id, emoji)}
            onFileUpload={async (file) => {
              if (readOnly) {
                return;
              }
              if (!onUploadFile) {
                handleChange(index, JSON.stringify({ name: file.name, size: file.size, type: file.type, status: "uploaded" }));
                return;
              }
              handleChange(index, JSON.stringify({ name: file.name, size: file.size, type: file.type, status: "uploading" }), "file");
              try {
                const uploaded = await onUploadFile(block.id, file);
                handleChange(index, JSON.stringify(uploaded), "file");
              } catch {
                handleChange(index, JSON.stringify({ name: file.name, size: file.size, type: file.type, status: "failed" }), "file");
              }
            }}
          />
          );
        })}

        {!readOnly ? (
          <button
            type="button"
            className="min-h-[60px] cursor-text py-2"
            onClick={() => {
              const last = blocks.length - 1;
              if (blocks[last]?.content === "" && blocks[last]?.type === "paragraph") {
                setEditingIndex(last);
              } else {
                addBlock(last);
              }
            }}
            aria-label="새 블록 추가"
          />
        ) : null}
      </section>
    </div>
  );
}

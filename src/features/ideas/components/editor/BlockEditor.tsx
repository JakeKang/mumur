"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Idea, Comment } from "@/shared/types";
import { STATUS_META as STATUS_META_DEFAULT } from "@/features/ideas/constants/idea-status";
import { AlertCircle, Check, CircleHelp, Loader2, MessageSquare } from "lucide-react";
import { EditorBlock } from "./EditorBlock";
import type { EditorBlockData, BlockType } from "./EditorBlock";
import { useAutoSave } from "@/features/ideas/hooks/useAutoSave";
import type { SaveStatus } from "@/features/ideas/hooks/useAutoSave";
import { useIdeaCollab } from "@/features/ideas/collab/idea-collab-provider";
import { DialogShell } from "@/shared/components/ui/dialog-shell";
import { Button } from "@/shared/components/ui/button";
import { getCollaborationColor } from "@/shared/utils/collaboration-colors";

const QUICK_EMOJIS = ["👍", "❤️", "🎉", "😮", "🤔"];

export function getCursorLineLabel(content: string, cursorOffset: number | null) {
  if (cursorOffset === null || cursorOffset < 0) {
    return "작업 중";
  }
  const safeOffset = Math.min(Math.max(0, Math.trunc(cursorOffset)), String(content || "").length);
  const line = String(content || "").slice(0, safeOffset).split("\n").length;
  return `${line}줄`;
}

export function shouldApplyIncomingRemoteSnapshot({
  status,
  localEditVersion,
  lastSaveVersion,
  currentSnapshot,
  incomingSnapshot
}: {
  status: SaveStatus;
  localEditVersion: number;
  lastSaveVersion: number;
  currentSnapshot: string;
  incomingSnapshot: string;
}) {
  if (status === "dirty" || status === "saving") {
    return false;
  }
  const localDraftMovedAhead = localEditVersion > lastSaveVersion;
  if (localDraftMovedAhead && currentSnapshot !== incomingSnapshot) {
    return false;
  }
  return true;
}

function shouldQueueIncomingRemoteSnapshot({
  status,
  localEditVersion,
  lastSaveVersion,
  currentSnapshot,
  incomingSnapshot
}: {
  status: SaveStatus;
  localEditVersion: number;
  lastSaveVersion: number;
  currentSnapshot: string;
  incomingSnapshot: string;
}) {
  return status === "dirty"
    || status === "saving"
    || (localEditVersion > lastSaveVersion && currentSnapshot !== incomingSnapshot);
}

function serializeDraftSnapshot(title: string, blocks: EditorBlockData[]) {
  return JSON.stringify({
    title,
    blocks: blocks.map((block) => ({
      id: block.id,
      type: block.type,
      content: block.content,
      checked: Boolean(block.checked),
    })),
  });
}

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
  if (value === "callout") return "callout";
  if (value === "image") return "image";
  if (value === "video") return "video";
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
  { type: "callout",      icon: "💬", label: "콜아웃" },
  { type: "image",        icon: "🖼️", label: "이미지" },
  { type: "video",        icon: "🎬", label: "동영상" },
  { type: "divider",      icon: "—",  label: "구분선" },
  { type: "file",         icon: "📎", label: "파일" },
];

function SaveStatusBadge({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  if (status === "idle") {
    return null;
  }

  const map: Record<string, { text: string; cls: string; icon: React.ReactNode }> = {
    dirty: { text: "저장 대기", cls: "text-[var(--muted)]", icon: <Loader2 className="h-3.5 w-3.5" /> },
    saving: { text: "저장 중...", cls: "text-sky-600", icon: <Loader2 className="h-3.5 w-3.5 animate-spin" /> },
    saved: { text: "저장됨", cls: "text-emerald-600", icon: <Check className="h-3.5 w-3.5" /> },
    error: { text: "저장 실패", cls: "text-rose-600", icon: <AlertCircle className="h-3.5 w-3.5" /> },
  };
  const { text, cls, icon } = map[status] ?? map.dirty;
  if (status === "error") {
    return (
      <button
        type="button"
        className={`inline-flex select-none items-center gap-1.5 rounded-full border border-current/15 bg-[var(--surface)] px-2 py-1 text-xs ${cls}`}
        onClick={onRetry}
      >
        {icon}
        {text}
      </button>
    );
  }
  return (
    <span className={`inline-flex select-none items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs ${cls} ${status === "saved" ? "animate-save-fade" : ""}`}>
      {icon}
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
  activeUsers: Array<{ userId: number; userName: string; cursorOffset: number | null; isTyping: boolean; isSelf: boolean }>;
  onFocus: () => void;
  onToggleSelect: (shiftKey: boolean) => void;
  onChange: (content: string, type?: BlockType, options?: { checked?: boolean }) => void;
  onCursorActivity: (cursorOffset: number, typing?: boolean) => void;
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
  activeUsers,
  onFocus,
  onToggleSelect,
  onChange,
  onCursorActivity,
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
  const typeMenuRef = useRef<HTMLDivElement>(null);
  const reactionPickerRef = useRef<HTMLDivElement>(null);
  const remoteActiveUsers = activeUsers.filter((user) => !user.isSelf);
  const primaryRemoteColor = remoteActiveUsers[0] ? getCollaborationColor(remoteActiveUsers[0].userId, false) : null;

  useEffect(() => {
    if (!typeMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (typeMenuRef.current && !typeMenuRef.current.contains(e.target as Node)) {
        setTypeMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [typeMenuOpen]);

  useEffect(() => {
    if (!reactionPickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (reactionPickerRef.current && !reactionPickerRef.current.contains(e.target as Node)) {
        setReactionPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [reactionPickerOpen]);

  useEffect(() => {
    if (isEditing && rowRef.current) {
      requestAnimationFrame(() => {
        rowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
    }
  }, [isEditing]);

  return (
    <section
      ref={rowRef}
      role="presentation"
      data-block-index={index}
      className={`group/row relative flex items-start gap-1 rounded-md py-px transition-colors duration-100 ${isDragOver ? "border-t-2 border-[var(--accent)]" : ""} ${isSelected ? "bg-[var(--accent)]/10" : ""}`}
      style={remoteActiveUsers.length > 0 && primaryRemoteColor ? { backgroundColor: primaryRemoteColor.bg } : undefined}
    >
      {remoteActiveUsers.length > 0 ? (
        <span className="absolute left-0 top-1 bottom-1 w-1 rounded-full" style={{ backgroundColor: primaryRemoteColor?.rail }} aria-hidden="true" />
      ) : null}

      <div className="relative flex shrink-0 flex-col items-center gap-0 md:invisible md:group-hover/row:visible">
        <div className="relative" ref={typeMenuRef}>
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
          onClick={(event) => {
            if (readOnly) {
              return;
            }
            if (dragTriggeredRef.current) {
              return;
            }
            event.stopPropagation();
            onToggleSelect(event.shiftKey);
            setTypeMenuOpen((v) => !v);
          }}
          aria-label="블록 이동 및 타입 변경"
          title="드래그: 이동 · 클릭: 타입 변경"
          className={`rounded p-1 text-sm hover:bg-[var(--surface-strong)] transition-all ${
            readOnly ? "cursor-not-allowed opacity-40 text-[var(--muted)]" : "cursor-grab active:cursor-grabbing"
          } ${isSelected ? "text-[var(--accent)] bg-[var(--accent)]/10" : "text-[var(--muted)]"}`}
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
      </div>

      <div className="min-w-0 flex-1">
        <EditorBlock
          block={block}
          isEditing={isEditing}
          autoFocus={isEditing}
          onFocus={onFocus}
          onChange={onChange}
          onCursorActivity={onCursorActivity}
          remoteCursors={activeUsers}
          onTypeChange={onTypeChange}
          onFileUpload={onFileUpload}
          onEnter={onEnter}
          onDelete={onDelete}
        />

        {remoteActiveUsers.length > 0 ? (
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            {remoteActiveUsers.slice(0, 3).map((user) => {
              const color = getCollaborationColor(user.userId, false);
              return (
                <span
                  key={`cursor-${block.id}-${user.userId}`}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] shadow-sm"
                  style={{
                    border: `1px solid ${color.border}`,
                    backgroundColor: color.bg,
                    color: color.text,
                  }}
                  title={`${user.userName} · ${user.isTyping ? "입력 중" : getCursorLineLabel(block.content, user.cursorOffset)}`}
                >
                  <span className="h-2 w-2 animate-pulse rounded-full" style={{ backgroundColor: color.accent }} aria-hidden="true" />
                  <span className="max-w-28 truncate">{user.userName}</span>
                  <span style={{ color: color.text, opacity: 0.78 }}>{user.isTyping ? "입력 중" : getCursorLineLabel(block.content, user.cursorOffset)}</span>
                </span>
              );
            })}
            {remoteActiveUsers.length > 3 ? (
              <span className="rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: primaryRemoteColor?.border, backgroundColor: primaryRemoteColor?.bg, color: primaryRemoteColor?.text }}>
                외 {remoteActiveUsers.length - 3}명
              </span>
            ) : null}
          </div>
        ) : null}

        {(blockReactions.length > 0 || commentCount > 0) && (
          <div className="mt-1 flex items-center justify-between gap-1">
            <div className="flex flex-wrap gap-1">
              {blockReactions.map((r) => (
                <button
                  key={r.emoji}
                  type="button"
                  onClick={() => onReaction(r.emoji)}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition ${r.mine ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-[var(--border)] hover:border-[var(--accent)]/50 text-[var(--muted)]"}`}
                >
                  {r.emoji} {r.count}
                </button>
              ))}
            </div>
            {commentCount > 0 && (
              <button
                type="button"
                onClick={onOpenComments}
                title={`댓글 ${commentCount}개 — 클릭하여 확인`}
                aria-label={`댓글 ${commentCount}개`}
                className="inline-flex items-center gap-0.5 rounded-full border border-[var(--border)] bg-[var(--surface-strong)] px-1.5 py-0.5 text-xs text-[var(--muted)] hover:border-[var(--accent)]/50 transition"
              >
                💬 {commentCount}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="ml-1 flex shrink-0 items-start gap-1 pt-1 md:invisible md:group-hover/row:visible">
        <button
          type="button"
          onClick={onOpenComments}
          title="블록 댓글 보기/추가"
          aria-label="블록 댓글"
          className="inline-flex h-6 w-6 items-center justify-center rounded text-xs text-[var(--muted)] transition hover:bg-[var(--surface-strong)] hover:text-[var(--foreground)]"
        >
          💬
        </button>
        <div className="relative" ref={reactionPickerRef}>
          <button
            type="button"
            onClick={() => setReactionPickerOpen((v) => !v)}
            title="리액션 추가"
            aria-label="리액션 추가"
            className="inline-flex h-6 w-6 items-center justify-center rounded text-xs text-[var(--muted)] transition hover:bg-[var(--surface-strong)] hover:text-[var(--foreground)]"
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

      </div>
    </section>
  );
}

type BlockEditorProps = {
  idea: Idea;
  comments?: Comment[];
  reactionsByTarget?: Record<string, { reactions: Array<{ emoji: string; count: number }>; mine: string[] }>;
  readOnly?: boolean;
  onSaveDocument: (
    title: string,
    blocks: EditorBlockData[],
    context?: { baseSnapshot: string }
  ) => Promise<void>;
  onOpenBlockComments?: (blockId: string) => void;
  onBlockReaction?: (blockId: string, emoji: string) => void;
  onUploadFile?: (blockId: string, file: File) => Promise<{ name: string; size: number; type: string; filePath: string; status: string }>;
  onOpenDocumentComments?: () => void;
  globalCommentCount?: number;
  ideaPresence?: Array<{ userId: number; userName: string; blockId: string; cursorOffset: number | null; isTyping?: boolean; updatedAt: number }>;
  currentUserId?: number | null;
  onActiveBlockChange?: (blockId: string, cursorOffset?: number | null, typing?: boolean) => void;
  STATUS_META: typeof STATUS_META_DEFAULT;
  formatTime: (ts: number) => string;
};

export function BlockEditor({
  idea,
  comments = [],
  reactionsByTarget = {},
  readOnly = false,
  onSaveDocument,
  STATUS_META,
  formatTime,
  onOpenBlockComments,
  onBlockReaction,
  onUploadFile,
  onOpenDocumentComments,
  globalCommentCount = 0,
  ideaPresence = [],
  currentUserId = null,
  onActiveBlockChange,
}: BlockEditorProps) {
  const collab = useIdeaCollab();
  const collabAdapter = collab?.enabled ? collab.adapter : null;
  const collabSnapshot = collab?.enabled ? collab.snapshot : null;
  const commentsByBlock = comments.reduce<Record<string, number>>((acc, c) => {
    if (c.blockId) acc[c.blockId] = (acc[c.blockId] ?? 0) + 1;
    return acc;
  }, {});
  const [blocks, setBlocks] = useState<EditorBlockData[]>(() => toEditorBlocks(collab?.enabled ? collab.snapshot.blocks : idea.blocks));
  const [title, setTitle] = useState(collab?.enabled ? collab.snapshot.title : idea.title ?? "");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([]);
  const [selectionAnchor, setSelectionAnchor] = useState<number | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [pendingRemoteSync, setPendingRemoteSync] = useState(false);
  const appliedIdeaVersionRef = useRef<{ id: number; updatedAt: number }>({ id: idea.id, updatedAt: Number(idea.updatedAt || 0) });
  const localEditVersionRef = useRef(0);
  const lastSaveVersionRef = useRef(0);
  const lastSavedSnapshotRef = useRef<string>(serializeDraftSnapshot(idea.title ?? "", toEditorBlocks(idea.blocks)));
  const blocksRef = useRef<EditorBlockData[]>(toEditorBlocks(collab?.enabled ? collab.snapshot.blocks : idea.blocks));
  const titleRef = useRef(collab?.enabled ? collab.snapshot.title : idea.title ?? "");
  const selectedIdSet = useMemo(() => new Set(selectedBlockIds), [selectedBlockIds]);
  const selectedCount = selectedBlockIds.length;

  useEffect(() => {
    blocksRef.current = blocks;
  }, [blocks]);

  useEffect(() => {
    titleRef.current = title;
  }, [title]);

  const presenceByBlock = useMemo(() => {
    const grouped: Record<string, Array<{ userId: number; userName: string; cursorOffset: number | null; isTyping: boolean; isSelf: boolean }>> = {};
    ideaPresence.forEach((entry) => {
      if (!entry?.blockId) {
        return;
      }
      if (!grouped[entry.blockId]) {
        grouped[entry.blockId] = [];
      }
      grouped[entry.blockId].push({
        userId: Number(entry.userId),
        userName: String(entry.userName || "사용자"),
        cursorOffset: typeof entry.cursorOffset === "number" ? entry.cursorOffset : null,
        isTyping: Boolean(entry.isTyping),
        isSelf: currentUserId !== null && Number(entry.userId) === Number(currentUserId)
      });
    });
    Object.values(grouped).forEach((entries) => {
      entries.sort((left, right) => {
        if (left.isSelf !== right.isSelf) {
          return left.isSelf ? -1 : 1;
        }
        if (left.isTyping !== right.isTyping) {
          return left.isTyping ? -1 : 1;
        }
        return left.userName.localeCompare(right.userName, "ko");
      });
    });
    return grouped;
  }, [currentUserId, ideaPresence]);

  const activeCollaborators = useMemo(() => {
    const unique = new Map<number, { userId: number; userName: string; isSelf: boolean }>();
    Object.values(presenceByBlock).forEach((list) => {
      list.forEach((entry) => {
        if (!unique.has(entry.userId)) {
          unique.set(entry.userId, { userId: entry.userId, userName: entry.userName, isSelf: entry.isSelf });
        }
      });
    });
    return [...unique.values()];
  }, [presenceByBlock]);

  const activeOtherCollaborators = activeCollaborators.filter((user) => !user.isSelf);
  const collaboratorSummaryText = activeOtherCollaborators.length === 0
    ? (activeCollaborators.some((user) => user.isSelf) ? "내가 편집 중" : "")
    : (activeCollaborators.some((user) => user.isSelf)
        ? `함께 작업 중 ${activeOtherCollaborators.length}명 + 나`
        : `함께 작업 중 ${activeOtherCollaborators.length}명`);
  const collaboratorSummaryTitle = activeCollaborators.map((user) => user.isSelf ? `${user.userName} (나)` : user.userName).join(", ");

  const saveAll = useCallback(async () => {
    const snapshot = serializeDraftSnapshot(title, blocks);
    const saveVersion = localEditVersionRef.current;
    const baseSnapshot = lastSavedSnapshotRef.current;
    await onSaveDocument(title, blocks, { baseSnapshot });
    lastSaveVersionRef.current = saveVersion;
    lastSavedSnapshotRef.current = snapshot;
  }, [blocks, onSaveDocument, title]);

  const { status, flush, markDirty } = useAutoSave(saveAll, 2000);

  const readCollabEditorState = useCallback(() => {
    if (!collabAdapter) {
      return null;
    }
    const snapshot = collabAdapter.getSnapshot();
    return {
      title: snapshot.title,
      blocks: toEditorBlocks(snapshot.blocks),
    };
  }, [collabAdapter]);

  const ensurePersistedBlockTarget = useCallback(async (blockId: string) => {
    if (!collabAdapter || !blockId) {
      return;
    }
    const persistedBlockIds = new Set((idea.blocks || []).map((item) => String(item.id || "")).filter(Boolean));
    if (persistedBlockIds.has(blockId)) {
      return;
    }
    const snapshot = collabAdapter.toCheckpoint();
    const nextBlocks = toEditorBlocks(snapshot.blocks);
    const nextTitle = snapshot.title ?? titleRef.current;
    await onSaveDocument(nextTitle, nextBlocks, { baseSnapshot: lastSavedSnapshotRef.current });
    lastSaveVersionRef.current = localEditVersionRef.current;
    lastSavedSnapshotRef.current = serializeDraftSnapshot(nextTitle, nextBlocks);
  }, [collabAdapter, idea.blocks, onSaveDocument]);

  const bumpLocalDraftVersion = useCallback(() => {
    localEditVersionRef.current += 1;
    markDirty();
  }, [markDirty]);

  const updateTitle = useCallback(
    (val: string) => {
      if (collabAdapter) {
        collabAdapter.replaceTitle(val);
        const nextState = readCollabEditorState();
        if (nextState) {
          setBlocks(nextState.blocks);
          setTitle(nextState.title);
        }
      } else {
        setTitle(val);
      }
      bumpLocalDraftVersion();
    },
    [bumpLocalDraftVersion, collabAdapter, readCollabEditorState]
  );

  const addBlock = (afterIndex: number, type: BlockType = "paragraph") => {
    if (readOnly) {
      return;
    }
    const newBlock: EditorBlockData = { id: genId(), type, content: "" };
    if (collabAdapter) {
      const afterBlockId = blocks[afterIndex]?.id ?? null;
      collabAdapter.insertBlock(afterBlockId, newBlock);
      setSelectedBlockIds([]);
      setSelectionAnchor(null);
      const nextState = readCollabEditorState();
      if (nextState) {
        setBlocks(nextState.blocks);
        setTitle(nextState.title);
        setEditingIndex(nextState.blocks.findIndex((block) => block.id === newBlock.id));
      }
      bumpLocalDraftVersion();
      return;
    }
    setBlocks((prev) => {
      const next = [...prev];
      next.splice(afterIndex + 1, 0, newBlock);
      return next;
    });
    setSelectedBlockIds([]);
    setSelectionAnchor(null);
    setEditingIndex(afterIndex + 1);
    bumpLocalDraftVersion();
  };

  const handleChange = (index: number, content: string, type?: BlockType, options?: { checked?: boolean }) => {
    if (readOnly) {
      return;
    }
    const currentBlock = blocks[index];
    const blockId = currentBlock?.id;
    if (collabAdapter && currentBlock && blockId) {
      if (type && type !== currentBlock.type) {
        collabAdapter.setBlockType(blockId, type);
      }
      if (content !== currentBlock.content) {
        collabAdapter.editBlockContent(blockId, {
          index: 0,
          deleteCount: currentBlock.content.length,
          insert: content,
        });
      }
      if (typeof options?.checked === "boolean" && options.checked !== Boolean(currentBlock.checked)) {
        collabAdapter.toggleChecklist(blockId, options.checked);
      }
      const nextState = readCollabEditorState();
      if (nextState) {
        setBlocks(nextState.blocks);
        setTitle(nextState.title);
        setEditingIndex(nextState.blocks.findIndex((block) => block.id === blockId));
      }
      bumpLocalDraftVersion();
      return;
    }
    setBlocks((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        content,
        ...(type ? { type } : {}),
        ...(typeof options?.checked === "boolean" ? { checked: options.checked } : {})
      };
      return next;
    });
    bumpLocalDraftVersion();
  };

  const handleDelete = (index: number) => {
    if (readOnly) {
      return;
    }
    if (collabAdapter) {
      const blockId = blocks[index]?.id;
      if (!blockId) {
        return;
      }
      collabAdapter.deleteBlock(blockId);
      if (collabAdapter.getSnapshot().blocks.length === 0) {
        const replacement = { id: genId(), type: "paragraph" as BlockType, content: "", checked: false };
        collabAdapter.insertBlock(null, replacement);
        const nextState = readCollabEditorState();
        if (nextState) {
          setBlocks(nextState.blocks);
          setTitle(nextState.title);
          setEditingIndex(nextState.blocks.findIndex((block) => block.id === replacement.id));
        }
      } else {
        const nextFocusId = blocks[Math.max(0, index - 1)]?.id ?? null;
        const nextState = readCollabEditorState();
        if (nextState) {
          setBlocks(nextState.blocks);
          setTitle(nextState.title);
          setEditingIndex(nextFocusId ? nextState.blocks.findIndex((block) => block.id === nextFocusId) : null);
        }
      }
      setSelectedBlockIds((ids) => ids.filter((id) => id !== blockId));
      bumpLocalDraftVersion();
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
    bumpLocalDraftVersion();
  };

  const handleTypeChange = (index: number, type: BlockType) => {
    if (readOnly) {
      return;
    }
    const blockId = blocks[index]?.id;
    if (collabAdapter && blockId) {
      collabAdapter.setBlockType(blockId, type);
      const nextState = readCollabEditorState();
      if (nextState) {
        setBlocks(nextState.blocks);
        setTitle(nextState.title);
        setEditingIndex(nextState.blocks.findIndex((block) => block.id === blockId));
      }
      bumpLocalDraftVersion();
      return;
    }
    setBlocks((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], type };
      return next;
    });
    bumpLocalDraftVersion();
  };

  const handleDrop = (dropIndex: number) => {
    if (readOnly) {
      return;
    }
    if (dragIndex === null || dragIndex === dropIndex) return;
    if (collabAdapter) {
      const movedId = blocks[dragIndex]?.id;
      if (!movedId) {
        return;
      }
      const insertAt = dragIndex < dropIndex ? dropIndex - 1 : dropIndex;
      collabAdapter.reorderBlock(movedId, insertAt);
      setDragIndex(null);
      setDragOverIndex(null);
      const nextState = readCollabEditorState();
      if (nextState) {
        setBlocks(nextState.blocks);
        setTitle(nextState.title);
        setEditingIndex(nextState.blocks.findIndex((block) => block.id === movedId));
      }
      bumpLocalDraftVersion();
      return;
    }
    setBlocks((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      const insertAt = dragIndex < dropIndex ? dropIndex - 1 : dropIndex;
      next.splice(insertAt, 0, moved);
      return next;
    });
    setDragIndex(null);
    setDragOverIndex(null);
    bumpLocalDraftVersion();
  };

  const statusMeta = STATUS_META[idea.status] ?? { icon: "💡", label: idea.status };

  const toggleBlockSelection = (index: number, shiftKey: boolean) => {
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
  };

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
    if (collabAdapter) {
      const selected = new Set(selectedBlockIds);
      const next = blocks.filter((item) => !selected.has(item.id));
      const safeNext = next.length === 0 ? [{ id: genId(), type: "paragraph" as BlockType, content: "", checked: false }] : next;
      collabAdapter.replaceBlocks(safeNext);
      const nextState = readCollabEditorState();
      if (nextState) {
        setBlocks(nextState.blocks);
        setTitle(nextState.title);
        setEditingIndex(safeNext[0]?.id ? nextState.blocks.findIndex((block) => block.id === safeNext[0]?.id) : null);
      }
      setSelectedBlockIds([]);
      setSelectionAnchor(null);
      bumpLocalDraftVersion();
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
    bumpLocalDraftVersion();
  }, [blocks, bumpLocalDraftVersion, collabAdapter, readOnly, selectedBlockIds, selectedCount, readCollabEditorState]);

  const moveSelected = useCallback(
    (direction: "up" | "down") => {
      if (readOnly || selectedCount === 0) {
        return;
      }
      const selected = new Set(selectedBlockIds);
      if (collabAdapter) {
        const next = [...blocks];
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
        collabAdapter.replaceBlocks(next);
        const focusBlockId = next.find((item) => selected.has(item.id))?.id ?? null;
        const nextState = readCollabEditorState();
        if (nextState) {
          setBlocks(nextState.blocks);
          setTitle(nextState.title);
          setEditingIndex(focusBlockId ? nextState.blocks.findIndex((block) => block.id === focusBlockId) : null);
        }
        bumpLocalDraftVersion();
        return;
      }
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
      bumpLocalDraftVersion();
    },
    [blocks, bumpLocalDraftVersion, collabAdapter, readOnly, selectedBlockIds, selectedCount, readCollabEditorState]
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const container = document.querySelector("[data-block-editor]");
      if (container && !container.contains(e.target as Node)) {
        setSelectedBlockIds([]);
        setSelectionAnchor(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (collabAdapter && collabSnapshot) {
      const snapshot = collabSnapshot;
      const nextBlocks = toEditorBlocks(snapshot.blocks);
      const nextSnapshot = serializeDraftSnapshot(snapshot.title ?? "", nextBlocks);
      const currentSnapshot = serializeDraftSnapshot(title, blocks);

      if (nextSnapshot === currentSnapshot) {
        if (pendingRemoteSync) {
          queueMicrotask(() => setPendingRemoteSync(false));
        }
        return;
      }

      appliedIdeaVersionRef.current = { id: idea.id, updatedAt: Number(idea.updatedAt || 0) };
      lastSavedSnapshotRef.current = nextSnapshot;
      queueMicrotask(() => {
        setBlocks(nextBlocks);
        setTitle(snapshot.title ?? "");
        setPendingRemoteSync(false);
      });
      return;
    }

    const queueEditorStateSync = (sync: () => void) => {
      queueMicrotask(sync);
    };

    const applyIncomingSnapshot = (incomingUpdatedAt: number, incomingSnapshot: string) => {
      const nextBlocks = toEditorBlocks(idea.blocks);
      const currentEditingId = editingIndex !== null ? blocks[editingIndex]?.id : null;
      const nextEditingIndex = currentEditingId ? nextBlocks.findIndex((block) => block.id === currentEditingId) : -1;
      appliedIdeaVersionRef.current = { id: idea.id, updatedAt: incomingUpdatedAt };
      lastSavedSnapshotRef.current = incomingSnapshot;
      queueEditorStateSync(() => {
        setBlocks(nextBlocks);
        setTitle(idea.title ?? "");
        if (editingIndex !== null) {
          setEditingIndex(nextEditingIndex >= 0 ? nextEditingIndex : null);
        }
        setPendingRemoteSync(false);
      });
    };

    if (idea.id !== appliedIdeaVersionRef.current.id) {
      const nextBlocks = toEditorBlocks(idea.blocks);
      appliedIdeaVersionRef.current = { id: idea.id, updatedAt: Number(idea.updatedAt || 0) };
      localEditVersionRef.current = 0;
      lastSaveVersionRef.current = 0;
      lastSavedSnapshotRef.current = serializeDraftSnapshot(idea.title ?? "", nextBlocks);
      queueEditorStateSync(() => {
        setBlocks(nextBlocks);
        setTitle(idea.title ?? "");
        setPendingRemoteSync(false);
      });
      return;
    }

    const incomingUpdatedAt = Number(idea.updatedAt || 0);
    if (incomingUpdatedAt <= appliedIdeaVersionRef.current.updatedAt) {
      if (pendingRemoteSync) {
        queueEditorStateSync(() => setPendingRemoteSync(false));
      }
      return;
    }

    const incomingSnapshot = serializeDraftSnapshot(idea.title ?? "", toEditorBlocks(idea.blocks));
    const canApplyIncoming = shouldApplyIncomingRemoteSnapshot({
      status,
      localEditVersion: localEditVersionRef.current,
      lastSaveVersion: lastSaveVersionRef.current,
      currentSnapshot: serializeDraftSnapshot(title, blocks),
      incomingSnapshot
    });

    if (!canApplyIncoming) {
      const shouldQueueRemoteSync = shouldQueueIncomingRemoteSnapshot({
        status,
        localEditVersion: localEditVersionRef.current,
        lastSaveVersion: lastSaveVersionRef.current,
        currentSnapshot: serializeDraftSnapshot(title, blocks),
        incomingSnapshot,
      });
      if (pendingRemoteSync !== shouldQueueRemoteSync) {
        queueEditorStateSync(() => setPendingRemoteSync(shouldQueueRemoteSync));
      }
      return;
    }

    applyIncomingSnapshot(incomingUpdatedAt, incomingSnapshot);
  }, [blocks, collabAdapter, collabSnapshot, editingIndex, idea.blocks, idea.id, idea.title, idea.updatedAt, pendingRemoteSync, status, title]);

  return (
    <div
      className="flex h-full min-h-[78vh] flex-col"
      data-block-editor
    >
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
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--muted)]">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="rounded border border-[var(--border)] px-1.5 py-0.5">
              {statusMeta.icon} {statusMeta.label}
            </span>
            <span className="whitespace-nowrap">수정 {formatTime(idea.updatedAt)}</span>
            <SaveStatusBadge status={status} onRetry={flush} />
            {pendingRemoteSync ? (
              <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] text-sky-700">
                다른 사용자의 변경사항 대기 중
              </span>
            ) : null}
            {activeCollaborators.length > 0 ? (
              <span
                className="rounded-full border border-[var(--border)] bg-[var(--surface-strong)] px-2 py-0.5 text-[11px] text-[var(--muted)]"
                title={collaboratorSummaryTitle}
              >
                {collaboratorSummaryText}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            {onOpenDocumentComments && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onOpenDocumentComments}
                className="h-8 gap-1.5 rounded-full px-3 text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
                aria-label="문서 댓글 스레드 열기"
                title="문서 댓글 스레드"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                댓글{globalCommentCount > 0 ? ` ${globalCommentCount}` : ""}
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setHelpOpen(true)}
              className="h-8 gap-1.5 rounded-full px-3 text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
              aria-label="에디터 도움말 열기"
              title="에디터 도움말"
            >
              <CircleHelp className="h-3.5 w-3.5" />
              도움말
            </Button>
          </div>
        </div>
      </div>

      <section
        className="min-h-[62vh] flex-1 overflow-auto px-4 pb-24 md:px-8"
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
            activeUsers={presenceByBlock[block.id] || []}
            onFocus={() => {
              if (!readOnly) {
                setEditingIndex(index);
                onActiveBlockChange?.(block.id, null, false);
              }
            }}
            onToggleSelect={(shiftKey) => toggleBlockSelection(index, shiftKey)}
            onChange={(content, type, options) => handleChange(index, content, type, options)}
            onCursorActivity={(cursorOffset, typing) => {
              if (!readOnly) {
                onActiveBlockChange?.(block.id, cursorOffset, typing);
              }
            }}
            onEnter={() => {
              const LIST_CONTINUE: BlockType[] = ["bulletList", "numberedList"];
              if (LIST_CONTINUE.includes(block.type) && block.content.trim() === "") {
                addBlock(index, "paragraph");
                handleTypeChange(index, "paragraph");
              } else {
                addBlock(index, LIST_CONTINUE.includes(block.type) ? block.type : "paragraph");
              }
            }}
            onDelete={() => handleDelete(index)}
            onTypeChange={(type) => handleTypeChange(index, type)}
            onDragStart={() => setDragIndex(index)}
            onOpenComments={() => {
              void (async () => {
                try {
                  await ensurePersistedBlockTarget(block.id);
                  onOpenBlockComments?.(block.id);
                } catch {
                  void 0;
                }
              })();
            }}
            onReaction={(emoji) => {
              void (async () => {
                try {
                  await ensurePersistedBlockTarget(block.id);
                  await onBlockReaction?.(block.id, emoji);
                } catch {
                  void 0;
                }
              })();
            }}
            onFileUpload={async (file) => {
              if (readOnly) {
                return;
              }
              const targetBlockId = block.id;
              const getCurrentBlockIndex = () => blocksRef.current.findIndex((item) => item.id === targetBlockId);
              if (!onUploadFile) {
                const currentIndex = getCurrentBlockIndex();
                if (currentIndex >= 0) {
                  handleChange(currentIndex, JSON.stringify({ name: file.name, size: file.size, type: file.type, status: "uploaded" }), block.type === "image" || block.type === "video" ? block.type : "file");
                }
                return;
              }
              const targetType = block.type === "image" || block.type === "video"
                ? block.type
                : file.type.startsWith("image/")
                  ? "image"
                  : file.type.startsWith("video/")
                    ? "video"
                    : "file";
              const persistedBlockIds = new Set((idea.blocks || []).map((item) => String(item.id || "")).filter(Boolean));
              const uploadingPayload = JSON.stringify({ name: file.name, size: file.size, type: file.type, status: "uploading" });
              const currentIndex = getCurrentBlockIndex();
              if (currentIndex >= 0) {
                handleChange(currentIndex, uploadingPayload, targetType);
              }
              try {
                if (!persistedBlockIds.has(targetBlockId)) {
                  const nextBlocks = blocksRef.current.map((item) => item.id === targetBlockId
                    ? { ...item, type: targetType as BlockType, content: uploadingPayload }
                    : item);
                  await onSaveDocument(titleRef.current, nextBlocks, {
                    baseSnapshot: lastSavedSnapshotRef.current,
                  });
                }
                const uploaded = await onUploadFile(targetBlockId, file);
                const uploadedIndex = getCurrentBlockIndex();
                if (uploadedIndex >= 0) {
                  handleChange(uploadedIndex, JSON.stringify(uploaded), targetType);
                }
              } catch {
                const failedIndex = getCurrentBlockIndex();
                if (failedIndex >= 0) {
                  handleChange(failedIndex, JSON.stringify({ name: file.name, size: file.size, type: file.type, status: "failed" }), targetType);
                }
              }
            }}
          />
          );
        })}

        {!readOnly ? (
          <button
            type="button"
            className="group/addblock w-full min-h-[40px] cursor-text py-3 text-left"
            onClick={() => {
              const last = blocks.length - 1;
              if (blocks[last]?.content === "" && blocks[last]?.type === "paragraph") {
                setEditingIndex(last);
              } else {
                addBlock(last);
              }
            }}
            aria-label="새 블록 추가"
          >
            <span className="text-sm text-transparent transition-colors group-hover/addblock:text-[var(--muted)] select-none">
              클릭하여 새 블록 추가...
            </span>
          </button>
        ) : null}
      </section>

      <DialogShell
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title="에디터 사용법"
        description="블록 전환, 들여쓰기, 기본 단축키를 빠르게 확인하세요."
        maxWidthClass="max-w-2xl"
        footer={(
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={() => setHelpOpen(false)}>
              확인
            </Button>
          </div>
        )}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-4">
            <h3 className="text-sm font-semibold text-[var(--foreground)]">블록 전환</h3>
            <ul className="mt-2 space-y-2 text-xs leading-5 text-[var(--muted)]">
              <li><span className="font-medium text-[var(--foreground)]">/</span> 를 입력하면 블록 메뉴가 열립니다.</li>
              <li>제목, 글머리 목록, 번호 목록, 체크리스트, 코드, 콜아웃, 이미지, 파일 블록으로 전환할 수 있습니다.</li>
              <li>블록 왼쪽의 <span className="font-medium text-[var(--foreground)]">⠿</span> 버튼으로 타입 변경과 순서 이동을 할 수 있습니다.</li>
            </ul>
          </section>

          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-4">
            <h3 className="text-sm font-semibold text-[var(--foreground)]">목록 / 들여쓰기</h3>
            <ul className="mt-2 space-y-2 text-xs leading-5 text-[var(--muted)]">
              <li>글머리 목록, 번호 목록, 체크리스트에서 <span className="font-medium text-[var(--foreground)]">Tab</span> 으로 들여쓰기합니다.</li>
              <li><span className="font-medium text-[var(--foreground)]">Shift + Tab</span> 으로 현재 줄 또는 선택한 줄을 내어씁니다.</li>
              <li>여러 줄을 선택한 뒤 Tab / Shift + Tab 을 누르면 선택한 줄 전체에 적용됩니다.</li>
            </ul>
          </section>

          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-4 md:col-span-2">
            <h3 className="text-sm font-semibold text-[var(--foreground)]">기본 단축키</h3>
            <div className="mt-2 grid gap-2 text-xs text-[var(--muted)] sm:grid-cols-2">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
                <span>새 블록 만들기</span>
                <kbd className="rounded border border-[var(--border)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--foreground)]">Enter</kbd>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
                <span>빈 블록 삭제</span>
                <kbd className="rounded border border-[var(--border)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--foreground)]">Backspace</kbd>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
                <span>목록 들여쓰기</span>
                <kbd className="rounded border border-[var(--border)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--foreground)]">Tab</kbd>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
                <span>목록 내어쓰기</span>
                <kbd className="rounded border border-[var(--border)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--foreground)]">Shift + Tab</kbd>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 sm:col-span-2">
                <span>블록 타입 검색 / 전환</span>
                <kbd className="rounded border border-[var(--border)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--foreground)]">/</kbd>
              </div>
            </div>
          </section>
        </div>
      </DialogShell>
    </div>
  );
}

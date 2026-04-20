"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { marked, type Tokens } from "marked";
import { getCollaborationColor } from "@/shared/utils/collaboration-colors";

export type BlockType =
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "bulletList"
  | "numberedList"
  | "checklist"
  | "quote"
  | "code"
  | "divider"
  | "file"
  | "callout"
  | "image"
  | "video";

export type EditorBlockData = {
  id: string;
  type: BlockType;
  content: string;
  checked?: boolean;
  lang?: string;
};

marked.use({
  gfm: true,
  breaks: true,
});

const PREFIX_RULES: Array<{ pattern: RegExp; type: BlockType; strip: boolean }> = [
  { pattern: /^### /, type: "heading3", strip: true },
  { pattern: /^## /, type: "heading2", strip: true },
  { pattern: /^# /, type: "heading1", strip: true },
  { pattern: /^- \[ \] /, type: "checklist", strip: true },
  { pattern: /^- \[x\] /i, type: "checklist", strip: true },
  { pattern: /^[-*] /, type: "bulletList", strip: true },
  { pattern: /^\d+\. /, type: "numberedList", strip: true },
  { pattern: /^> /, type: "quote", strip: true },
  { pattern: /^```/, type: "code", strip: false },
  { pattern: /^---$/, type: "divider", strip: false },
];

const SLASH_OPTIONS: Array<{ type: BlockType; icon: string; label: string; keywords: string[] }> = [
  { type: "heading1", icon: "H1", label: "제목 1", keywords: ["h1", "heading1", "제목"] },
  { type: "heading2", icon: "H2", label: "제목 2", keywords: ["h2", "heading2", "제목"] },
  { type: "heading3", icon: "H3", label: "제목 3", keywords: ["h3", "heading3", "제목"] },
  { type: "bulletList", icon: "•", label: "글머리 목록", keywords: ["bullet", "list", "ul", "목록"] },
  { type: "numberedList", icon: "1.", label: "번호 목록", keywords: ["numbered", "ol", "번호"] },
  { type: "checklist", icon: "☑", label: "체크리스트", keywords: ["check", "todo", "체크"] },
  { type: "quote", icon: "❝", label: "인용", keywords: ["quote", "인용", "blockquote"] },
  { type: "code", icon: "</>", label: "코드", keywords: ["code", "코드"] },
  { type: "callout", icon: "💬", label: "콜아웃", keywords: ["callout", "info", "알림", "강조"] },
  { type: "image", icon: "🖼️", label: "이미지", keywords: ["image", "img", "이미지", "사진"] },
  { type: "video", icon: "🎬", label: "동영상", keywords: ["video", "movie", "동영상", "영상"] },
  { type: "file", icon: "📎", label: "파일", keywords: ["file", "upload", "첨부", "파일"] },
  { type: "divider", icon: "—", label: "구분선", keywords: ["divider", "hr", "구분"] },
  { type: "paragraph", icon: "¶", label: "단락", keywords: ["p", "paragraph", "단락", "text"] },
];

const FEATURED_SLASH_TYPES: BlockType[] = ["paragraph", "heading2", "bulletList"];

export function detectBlockType(
  content: string,
  currentType: BlockType
): { type: BlockType; content: string } | null {
  for (const rule of PREFIX_RULES) {
    if (rule.pattern.test(content)) {
      if (rule.type === currentType && !rule.strip) return null;
      if (rule.type === "divider") {
        return { type: "divider", content: "" };
      }
      if (rule.type === "code") {
        const stripped = content.replace(/^```(\w*)/, "");
        return { type: "code", content: stripped };
      }
      const stripped = content.replace(rule.pattern, "");
      return { type: rule.type, content: stripped };
    }
  }
  return null;
}

type InlineToken = Tokens.Generic & {
  tokens?: InlineToken[];
  href?: string;
  title?: string;
  text?: string;
  raw?: string;
};

type SelectionSnapshot = {
  start: number;
  end: number;
  direction: "forward" | "backward" | "none";
};

function inlineTokens(content: string): InlineToken[] {
  if (!content.trim()) {
    return [];
  }
  const parsed = marked.lexer(content);
  const first = parsed[0] as InlineToken | undefined;
  if (first && Array.isArray(first.tokens)) {
    return first.tokens;
  }
  return [
    {
      type: "text",
      raw: content,
      text: content
    } as InlineToken
  ];
}

function renderInlineToken(token: InlineToken, keyPrefix: string): ReactNode {
  const text = String(token.text ?? token.raw ?? "");
  const tokenIdentity = (candidate: InlineToken) => String(candidate.raw ?? candidate.type ?? "");
  const children = Array.isArray(token.tokens)
    ? token.tokens.map((child, idx) => renderInlineToken(child as InlineToken, `${keyPrefix}-child-${idx}-${tokenIdentity(child as InlineToken)}`))
    : text;

  if (token.type === "strong") {
    return <strong key={keyPrefix}>{children}</strong>;
  }
  if (token.type === "em") {
    return <em key={keyPrefix}>{children}</em>;
  }
  if (token.type === "del") {
    return <del key={keyPrefix}>{children}</del>;
  }
  if (token.type === "codespan") {
    return (
      <code key={keyPrefix} className="rounded bg-[var(--surface-strong)] px-1 text-xs">
        {text}
      </code>
    );
  }
  if (token.type === "link") {
    const href = sanitizeLinkHref(String(token.href || ""));
    if (!href) {
      return <span key={keyPrefix}>{children}</span>;
    }
    return (
      <a key={keyPrefix} href={href} target="_blank" rel="noreferrer" className="underline">
        {children}
      </a>
    );
  }
  if (token.type === "br") {
    return <br key={keyPrefix} />;
  }
  return <span key={keyPrefix}>{text}</span>;
}

function toStableLineEntries(lines: string[]) {
  const counts = new Map<string, number>();
  return lines.map((line) => {
    const keyBase = line || "__empty__";
    const count = (counts.get(keyBase) || 0) + 1;
    counts.set(keyBase, count);
    return {
      line,
      key: `${keyBase}-${count}`
    };
  });
}

function getLineIndexAtPosition(lines: string[], position: number): number {
  let offset = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const lineLength = lines[index].length;
    if (position <= offset + lineLength) {
      return index;
    }
    offset += lineLength + 1;
  }
  return Math.max(0, lines.length - 1);
}

function transformPositionForLineIndent(
  originalPosition: number,
  originalLineStart: number,
  removedSpaces: number,
  addedSpaces: number
): number {
  if (addedSpaces > 0) {
    return originalPosition >= originalLineStart ? addedSpaces : 0;
  }

  if (removedSpaces <= 0 || originalPosition <= originalLineStart) {
    return 0;
  }

  if (originalPosition <= originalLineStart + removedSpaces) {
    return originalLineStart - originalPosition;
  }

  return -removedSpaces;
}

function adjustListIndentation(
  content: string,
  selectionStart: number,
  selectionEnd: number,
  direction: "indent" | "dedent"
) {
  const lines = content.split("\n");
  const startLineIndex = getLineIndexAtPosition(lines, selectionStart);
  const selectionEndAnchor = selectionEnd > selectionStart && content[selectionEnd - 1] === "\n"
    ? selectionEnd - 1
    : selectionEnd;
  const endLineIndex = getLineIndexAtPosition(lines, selectionEndAnchor);

  let offset = 0;
  let startDelta = 0;
  let endDelta = 0;

  const nextLines = lines.map((line, index) => {
    const lineStart = offset;
    offset += line.length + 1;

    if (index < startLineIndex || index > endLineIndex) {
      return line;
    }

    if (direction === "indent") {
      startDelta += transformPositionForLineIndent(selectionStart, lineStart, 0, 2);
      endDelta += transformPositionForLineIndent(selectionEnd, lineStart, 0, 2);
      return `  ${line}`;
    }

    const removedSpaces = Math.min(2, line.match(/^ */)?.[0]?.length || 0);
    startDelta += transformPositionForLineIndent(selectionStart, lineStart, removedSpaces, 0);
    endDelta += transformPositionForLineIndent(selectionEnd, lineStart, removedSpaces, 0);
    return line.slice(removedSpaces);
  });

  const nextSelectionStart = Math.max(0, selectionStart + startDelta);
  const nextSelectionEnd = selectionStart === selectionEnd
    ? nextSelectionStart
    : Math.max(nextSelectionStart, selectionEnd + endDelta);

  return {
    content: nextLines.join("\n"),
    selectionStart: nextSelectionStart,
    selectionEnd: nextSelectionEnd
  };
}

function renderInline(tokens: InlineToken[], muted?: boolean): ReactNode {
  return (
    <span className={muted ? "text-[var(--muted)]" : undefined}>
      {tokens.length
        ? tokens.map((token, idx) =>
            renderInlineToken(token, `inline-${idx}-${String(token.raw ?? token.type ?? "")}`)
          )
        : "\u00A0"}
    </span>
  );
}

function sanitizeLinkHref(value: string): string {
  const href = String(value || "").trim();
  if (!href) {
    return "";
  }
  if (href.startsWith("/") || href.startsWith("#")) {
    return href;
  }
  const lower = href.toLowerCase();
  if (lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("mailto:")) {
    return href;
  }
  return "";
}

function parseMediaContent(content: string) {
  const raw = String(content || "").trim();
  if (!raw) {
    return null;
  }
  if (raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("/")) {
    return { filePath: raw, name: "", type: "", size: 0, status: "uploaded" };
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function resolveMediaUrl(content: string) {
  const parsed = parseMediaContent(content);
  if (parsed?.filePath) {
    return String(parsed.filePath).trim();
  }
  const raw = String(content || "").trim();
  if (raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("/")) {
    return raw;
  }
  return "";
}

function captureSelectionSnapshot(textarea: HTMLTextAreaElement): SelectionSnapshot {
  return {
    start: textarea.selectionStart,
    end: textarea.selectionEnd,
    direction: textarea.selectionDirection ?? "none"
  };
}

function clampSelectionSnapshot(snapshot: SelectionSnapshot, valueLength: number): SelectionSnapshot {
  const safeStart = Math.max(0, Math.min(snapshot.start, valueLength));
  const safeEnd = Math.max(safeStart, Math.min(snapshot.end, valueLength));
  return {
    start: safeStart,
    end: safeEnd,
    direction: snapshot.direction
  };
}

function shouldApplyExternalContentImmediately(blockType: BlockType, content: string): boolean {
  if (blockType === "file") {
    return true;
  }
  if (blockType !== "image" && blockType !== "video") {
    return false;
  }
  const parsed = parseMediaContent(content);
  return Boolean(parsed && typeof parsed === "object" && (parsed.status || parsed.filePath || parsed.name));
}

function EditingAffordance({ block }: { block: EditorBlockData }) {
  if (block.type === "checklist") {
    return <span className="mt-2 shrink-0 text-base text-[var(--muted)]">☐</span>;
  }
  if (block.type === "bulletList") {
    return <span className="mt-2 shrink-0 text-base text-[var(--muted)]">•</span>;
  }
  if (block.type === "numberedList") {
    return <span className="mt-2 w-5 shrink-0 text-right text-sm text-[var(--muted)]">1.</span>;
  }
  if (block.type === "paragraph") {
    return <span className="mt-2 shrink-0 text-xs font-medium text-[var(--muted)]">¶</span>;
  }
  if (block.type === "heading1") {
    return <span className="mt-2 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">H1</span>;
  }
  if (block.type === "heading2") {
    return <span className="mt-2 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">H2</span>;
  }
  if (block.type === "heading3") {
    return <span className="mt-2 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">H3</span>;
  }
  if (block.type === "quote") {
    return <span className="mt-2 shrink-0 text-base text-[var(--muted)]">❝</span>;
  }
  return null;
}

function highlightMatch(text: string, query: string): ReactNode {
  if (!query) {
    return text;
  }
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) {
    return text;
  }
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-[var(--accent)]/20 text-[var(--accent)]">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

type EditorBlockProps = {
  block: EditorBlockData;
  isEditing: boolean;
  onFocus: () => void;
  onChange: (content: string, type?: BlockType, options?: { checked?: boolean }) => void;
  onTypeChange?: (type: BlockType) => void;
  onFileUpload?: (file: File) => Promise<void>;
  onEnter: () => void;
  onDelete: () => void;
  onCursorActivity?: (cursorOffset: number, typing?: boolean) => void;
  remoteCursors?: Array<{ userId: number; userName: string; cursorOffset: number | null; isSelf: boolean }>;
  autoFocus?: boolean;
};

function getCursorOverlayPosition(
  content: string,
  cursorOffset: number | null,
  lineHeight: number,
  paddingTop: number,
  scrollTop: number
) {
  if (cursorOffset === null || cursorOffset < 0) {
    return { top: paddingTop, line: 1 };
  }
  const safeOffset = Math.min(cursorOffset, String(content || "").length);
  const line = String(content || "").slice(0, safeOffset).split("\n").length;
  return {
    top: Math.max(paddingTop, paddingTop + (line - 1) * lineHeight - scrollTop),
    line,
  };
}

export function EditorBlock({
  block,
  isEditing,
  onFocus,
  onChange,
  onTypeChange,
  onFileUpload,
  onEnter,
  onDelete,
  onCursorActivity,
  remoteCursors = [],
  autoFocus,
}: EditorBlockProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isComposingRef = useRef(false);
  const pendingExternalContentRef = useRef<string | null>(null);
  const pendingSelectionRestoreRef = useRef<SelectionSnapshot | null>(null);
  const selectionRestoreFrameRef = useRef<number | null>(null);
  const [slashActive, setSlashActive] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
  const [overlayMetrics, setOverlayMetrics] = useState({ lineHeight: 24, paddingTop: 10, scrollTop: 0 });
  const [draftContent, setDraftContent] = useState(block.content || "");
  const localContent = draftContent;

  const captureSelection = useCallback((target?: HTMLTextAreaElement | null) => {
    const textarea = target ?? textareaRef.current;
    if (!textarea) {
      return null;
    }
    const snapshot = captureSelectionSnapshot(textarea);
    pendingSelectionRestoreRef.current = snapshot;
    return snapshot;
  }, []);

  const scheduleSelectionRestore = useCallback((snapshot: SelectionSnapshot | null) => {
    if (!snapshot) {
      return;
    }
    if (selectionRestoreFrameRef.current !== null) {
      cancelAnimationFrame(selectionRestoreFrameRef.current);
    }
    selectionRestoreFrameRef.current = requestAnimationFrame(() => {
      selectionRestoreFrameRef.current = null;
      const textarea = textareaRef.current;
      if (!textarea || document.activeElement !== textarea || isComposingRef.current) {
        return;
      }
      const clamped = clampSelectionSnapshot(snapshot, textarea.value.length);
      textarea.setSelectionRange(clamped.start, clamped.end, clamped.direction);
      pendingSelectionRestoreRef.current = clamped;
    });
  }, []);

  const syncDraftContent = useCallback((nextContent: string, restoreSelection: boolean) => {
    const selectionSnapshot = restoreSelection ? captureSelection() : null;
    queueMicrotask(() => {
      setDraftContent((current) => (current === nextContent ? current : nextContent));
      if (restoreSelection) {
        scheduleSelectionRestore(selectionSnapshot);
      }
    });
  }, [captureSelection, scheduleSelectionRestore]);

  useEffect(() => {
    const nextContent = block.content || "";
    if (isComposingRef.current) {
      pendingExternalContentRef.current = nextContent;
      return;
    }

    const textarea = textareaRef.current;
    const isFocusedTextEditor = Boolean(isEditing && textarea && document.activeElement === textarea);
    const shouldDeferSync = isFocusedTextEditor
      && nextContent !== localContent
      && !shouldApplyExternalContentImmediately(block.type, nextContent);

    if (shouldDeferSync) {
      pendingExternalContentRef.current = nextContent;
      return;
    }

    pendingExternalContentRef.current = null;
    syncDraftContent(nextContent, isFocusedTextEditor);
  }, [block.content, block.type, isEditing, localContent, syncDraftContent]);

  useEffect(() => {
    return () => {
      if (selectionRestoreFrameRef.current !== null) {
        cancelAnimationFrame(selectionRestoreFrameRef.current);
      }
    };
  }, []);

  const filteredSlashOptions = useMemo(() => {
    if (!slashActive) {
      return [];
    }
    if (!slashQuery) {
      return SLASH_OPTIONS;
    }
    return SLASH_OPTIONS.filter((opt) =>
      opt.label.toLowerCase().includes(slashQuery)
      || opt.keywords.some((kw) => kw.toLowerCase().includes(slashQuery))
      || opt.type.toLowerCase().includes(slashQuery)
    );
  }, [slashActive, slashQuery]);

  const displayOptions = useMemo(() => {
    if (!slashActive) {
      return [] as Array<{ type: BlockType | "___divider___"; icon: string; label: string; keywords: string[] }>;
    }
    if (slashQuery) {
      return filteredSlashOptions;
    }

    const featured = filteredSlashOptions.filter((opt) => FEATURED_SLASH_TYPES.includes(opt.type));
    const rest = filteredSlashOptions.filter((opt) => !FEATURED_SLASH_TYPES.includes(opt.type));
    if (featured.length === 0 || rest.length === 0) {
      return [...featured, ...rest];
    }
    return [
      ...featured,
      { type: "___divider___", icon: "", label: "", keywords: [] },
      ...rest,
    ];
  }, [filteredSlashOptions, slashActive, slashQuery]);

  const selectableSlashOptions = useMemo(
    () => displayOptions.filter((opt) => opt.type !== "___divider___") as typeof filteredSlashOptions,
    [displayOptions]
  );

  const applySlashCommand = useCallback(
    (type: BlockType) => {
      setSlashActive(false);
      setSlashQuery("");
      setSlashSelectedIndex(0);
      if (onTypeChange) {
        onTypeChange(type);
      } else {
        onChange("", type);
      }
    },
    [onTypeChange, onChange]
  );

  // Auto-focus when entering edit mode
  useEffect(() => {
    if ((isEditing || autoFocus) && textareaRef.current) {
      textareaRef.current.focus();
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [isEditing, autoFocus]);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    const style = window.getComputedStyle(textarea);
    const fontSize = Number.parseFloat(style.fontSize || "16") || 16;
    const lineHeight = Number.parseFloat(style.lineHeight || "") || fontSize * 1.5;
    const paddingTop = Number.parseFloat(style.paddingTop || "") || 4;

    setOverlayMetrics((current) => {
      const next = {
        lineHeight,
        paddingTop,
        scrollTop: textarea.scrollTop,
      };
      return current.lineHeight === next.lineHeight
        && current.paddingTop === next.paddingTop
        && current.scrollTop === next.scrollTop
        ? current
        : next;
    });
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const native = e.nativeEvent as unknown as { isComposing?: boolean; keyCode?: number };
      if (isComposingRef.current || native?.isComposing || native?.keyCode === 229) {
        return;
      }
      if (slashActive) {
        if (e.key === "ArrowDown" && selectableSlashOptions.length > 0) {
          e.preventDefault();
          setSlashSelectedIndex((prev) => (prev + 1) % selectableSlashOptions.length);
          return;
        }
        if (e.key === "ArrowUp" && selectableSlashOptions.length > 0) {
          e.preventDefault();
          setSlashSelectedIndex((prev) => (prev - 1 + selectableSlashOptions.length) % selectableSlashOptions.length);
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          const selected = selectableSlashOptions[slashSelectedIndex];
          if (selected) {
            applySlashCommand(selected.type);
          }
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setSlashActive(false);
          setSlashQuery("");
          setSlashSelectedIndex(0);
          onChange(`/${slashQuery}`);
          return;
        }
        if (e.key === "Backspace" && slashQuery === "") {
          e.preventDefault();
          setSlashActive(false);
          setSlashQuery("");
          setSlashSelectedIndex(0);
          onChange("");
          return;
        }
      }
      if (e.key === "Tab") {
        e.preventDefault();
        if (block.type === "bulletList" || block.type === "numberedList" || block.type === "checklist") {
          const textarea = textareaRef.current;
          if (textarea) {
            const nextState = adjustListIndentation(
              localContent,
              textarea.selectionStart,
              textarea.selectionEnd,
              e.shiftKey ? "dedent" : "indent"
            );
            onChange(nextState.content);
            requestAnimationFrame(() => {
              if (textareaRef.current) {
                textareaRef.current.setSelectionRange(nextState.selectionStart, nextState.selectionEnd);
              }
            });
          }
        }
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onChange(localContent);
        onEnter();
        return;
      }
      if (e.key === "Backspace" && localContent === "" && !slashActive) {
        e.preventDefault();
        onDelete();
      }
    },
    [
      applySlashCommand,
      block.type,
      localContent,
      onChange,
      onDelete,
      onEnter,
      selectableSlashOptions,
      slashActive,
      slashQuery,
      slashSelectedIndex,
    ]
  );

  const emitCursorOffset = useCallback((typing = false) => {
    const position = textareaRef.current?.selectionStart;
    captureSelection();
    if (typeof position === "number") {
      onCursorActivity?.(position, typing);
    }
  }, [captureSelection, onCursorActivity]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      captureSelection(e.target);

      if (value.startsWith("/")) {
        const query = value.slice(1).toLowerCase();
        setSlashActive(true);
        setSlashQuery(query);
        setSlashSelectedIndex(0);
        return;
      }

      if (slashActive) {
        setSlashActive(false);
        setSlashQuery("");
        setSlashSelectedIndex(0);
      }

      const nextCursor = e.target.selectionStart;

      const detected = detectBlockType(value, block.type);
      if (detected) {
        setDraftContent(detected.content);
        onChange(detected.content, detected.type);
      } else {
        setDraftContent(value);
        onChange(value);
      }
      if (typeof nextCursor === "number") {
        onCursorActivity?.(nextCursor, true);
      }
    },
    [block.type, captureSelection, onChange, onCursorActivity, slashActive]
  );

  const editingValue = slashActive ? `/${slashQuery}` : localContent;
  const rows = Math.max(1, editingValue.split("\n").length);
  const inlineNodes = useMemo(() => inlineTokens(localContent || ""), [localContent]);
  const listLines = useMemo(() => {
    const rawLines = localContent.split("\n");
    const counts = new Map<string, number>();
    const entries: { line: string; rawLine: string; key: string }[] = [];
    for (const raw of rawLines) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const keyBase = trimmed || "__empty__";
      const count = (counts.get(keyBase) || 0) + 1;
      counts.set(keyBase, count);
      entries.push({ line: trimmed, rawLine: raw, key: `${keyBase}-${count}` });
    }
    if (entries.length === 0) entries.push({ line: "", rawLine: "", key: "__empty__-1" });
    return entries;
  }, [localContent]);
  const textareaBlockClass = (() => {
    switch (block.type) {
      case "heading1":
        return "text-2xl font-bold leading-snug";
      case "heading2":
        return "text-xl font-bold leading-snug";
      case "heading3":
        return "text-lg font-semibold leading-snug";
      case "quote":
        return "border-l-2 border-[var(--border)] pl-3 text-[var(--muted)] italic";
      case "code":
        return "font-mono text-xs bg-[var(--surface-strong)] rounded-md p-2";
      case "callout":
        return "rounded-lg border border-[var(--accent)]/20 bg-[var(--accent)]/5 px-4 py-2 text-sm";
      case "image":
        return "font-mono text-xs text-[var(--muted)]";
      case "video":
        return "font-mono text-xs text-[var(--muted)]";
      case "bulletList":
      case "numberedList":
      case "checklist":
        return "min-h-[40px]";
      case "paragraph":
        return "min-h-[40px]";
      default:
        return "text-sm leading-relaxed";
    }
  })();
  const visibleRemoteCursors = remoteCursors.filter((cursor) => !cursor.isSelf).slice(0, 3);
  const placeholderText = (() => {
    switch (block.type) {
      case "heading1":
        return "제목 1...";
      case "heading2":
        return "제목 2...";
      case "heading3":
        return "제목 3...";
      case "quote":
        return "인용문을 입력하세요...";
      case "code":
        return "코드를 입력하세요...";
      case "bulletList":
        return "• 목록 항목 입력...";
      case "numberedList":
        return "1. 목록 항목 입력...";
      case "checklist":
        return "할 일을 입력하세요...";
      case "callout":
        return "💡 콜아웃 텍스트 (시작에 이모지 넣기 가능)...";
      case "image":
        return "이미지 URL을 입력하세요 (https://...)";
      case "video":
        return "동영상 URL을 입력하거나 업로드하세요";
      default:
        return "/ 로 블록 전환, 텍스트 입력...";
    }
  })();

  const activateOnPointer = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      event.preventDefault();
      onFocus();
    },
    [onFocus]
  );

  // --- Divider ---
  if (block.type === "divider") {
    return (
      <button type="button" className="block w-full py-2 text-left" onMouseDown={activateOnPointer}>
        <span className="block border-t border-[var(--border)]" />
      </button>
    );
  }

  if (block.type === "file") {
    const fileData = (() => {
      try { return block.content ? JSON.parse(block.content) : null; } catch { return null; }
    })();
    if (fileData?.name) {
      return (
        <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] p-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📎</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[var(--foreground)]">{fileData.name}</p>
              <p className="text-xs text-[var(--muted)]">
                {fileData.size ? `${(fileData.size / 1024).toFixed(1)} KB` : "크기 정보 없음"}
                {fileData.status ? ` · ${fileData.status}` : ""}
              </p>
            </div>
          </div>
          {fileData.type?.startsWith("image/") && fileData.filePath ? (
            <Image
              src={fileData.filePath}
              alt={fileData.name || "image"}
              width={1280}
              height={720}
              unoptimized
              className="max-h-72 w-auto rounded-md border border-[var(--border)] object-contain"
            />
          ) : null}
          {fileData.type?.startsWith("video/") && fileData.filePath ? (
            <video src={fileData.filePath} controls className="max-h-80 w-full rounded-md border border-[var(--border)] bg-black/80">
              <track kind="captions" />
            </video>
          ) : null}
          {fileData.filePath ? (
            <div className="flex gap-3 text-xs">
              <a href={fileData.filePath} target="_blank" rel="noreferrer" className="inline-block text-[var(--foreground)] underline">
                파일 열기
              </a>
              <a href={fileData.filePath} download={fileData.name || true} className="inline-block text-[var(--foreground)] underline">
                다운로드
              </a>
            </div>
          ) : null}
          {fileData.status === "uploading" ? <p className="text-xs text-[var(--muted)]">업로드 중...</p> : null}
          {fileData.status === "failed" ? <p className="text-xs text-rose-600">업로드 실패</p> : null}
        </div>
      );
    }
    return (
      <label className="flex cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed border-[var(--border)] bg-[var(--surface-strong)] p-4 hover:border-[var(--accent)]/50 transition">
        <span className="text-2xl">📎</span>
        <div>
          <p className="text-sm font-medium text-[var(--foreground)]">파일 선택</p>
          <p className="text-xs text-[var(--muted)]">클릭하여 첨부</p>
        </div>
        <input
          type="file"
          className="hidden"
          accept=".png,.jpg,.jpeg,.gif,.webp,.heic,.mp4,.mov,.webm,.txt,.pdf,.md,.csv,.json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (onFileUpload) {
              void onFileUpload(file);
              return;
            }
            onChange(JSON.stringify({ name: file.name, size: file.size, type: file.type, status: "uploaded" }));
          }}
        />
      </label>
    );
  }

  // --- Checklist (render mode) ---
  if (!isEditing && block.type === "checklist") {
    const leadingSpaces = block.content.match(/^ */)?.[0]?.length || 0;
    const level = Math.floor(leadingSpaces / 2);
    const checklistContent = block.content.slice(leadingSpaces);
    const checklistNodes = inlineTokens(checklistContent || "");
    return (
      <div
        className="flex cursor-pointer items-start gap-2 rounded-md p-1 hover:bg-[var(--surface-strong)]"
        style={{ paddingLeft: `${level * 16}px` }}
      >
        <input
          type="checkbox"
          className="mt-1"
          checked={Boolean(block.checked)}
          onChange={(e) => {
            e.stopPropagation();
            onChange(block.content, undefined, { checked: e.target.checked });
          }}
          onClick={(e) => e.stopPropagation()}
        />
        <button type="button" className="min-w-0 flex-1 text-left" onMouseDown={activateOnPointer}>
          <span
            className={`text-sm leading-relaxed ${block.checked ? "text-[var(--muted)] line-through" : "text-[var(--foreground)]"}`}
          >
            {renderInline(checklistNodes, !checklistContent)}
          </span>
        </button>
      </div>
    );
  }

  if (isEditing && (block.type === "image" || block.type === "video")) {
    const media = parseMediaContent(localContent);
    const mediaUrl = resolveMediaUrl(localContent);
    const isImage = block.type === "image";
    return (
      <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] p-3">
        {isImage && mediaUrl ? (
          <Image src={mediaUrl} alt="" width={1280} height={720} unoptimized className="max-h-72 w-full rounded-md object-contain" />
        ) : null}
        {!isImage && mediaUrl ? (
          <video src={mediaUrl} controls className="max-h-80 w-full rounded-md border border-[var(--border)] bg-black/80">
            <track kind="captions" />
          </video>
        ) : null}
        <textarea
          ref={textareaRef}
          className="w-full resize-none rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
          rows={2}
          value={mediaUrl}
          onChange={(e) => onChange(e.target.value, block.type)}
          onKeyDown={handleKeyDown}
          onKeyUp={() => emitCursorOffset(false)}
          onSelect={() => emitCursorOffset(false)}
          onFocus={() => {
            captureSelection();
            onFocus();
            emitCursorOffset(false);
          }}
          placeholder={placeholderText}
        />
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--foreground)] transition hover:border-[var(--accent)]/40">
          <span>{isImage ? "🖼️" : "🎬"}</span>
          <span>{isImage ? "이미지 업로드" : "동영상 업로드"}</span>
          <input
            type="file"
            className="hidden"
            accept={isImage ? "image/*" : "video/*"}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file || !onFileUpload) return;
              void onFileUpload(file);
            }}
          />
        </label>
      </div>
    );
  }

  // --- Edit mode ---
  if (isEditing) {
    return (
      <div className="relative">
        {visibleRemoteCursors.length > 0 ? (
          <div className="pointer-events-none absolute inset-y-2 right-2 z-10 hidden w-28 md:block">
            {visibleRemoteCursors.map((cursor) => {
              const overlay = getCursorOverlayPosition(
                localContent,
                cursor.cursorOffset,
                overlayMetrics.lineHeight,
                overlayMetrics.paddingTop,
                overlayMetrics.scrollTop
              );
              const color = getCollaborationColor(cursor.userId, cursor.isSelf);
              return (
                <div
                  key={`remote-cursor-${block.id}-${cursor.userId}`}
                  className="absolute right-0 flex items-center gap-1"
                  style={{ top: `${overlay.top}px` }}
                >
                  <span className="h-5 w-[2px] rounded-full shadow-[0_0_0_1px_rgba(15,23,42,0.06)]" style={{ backgroundColor: color.accent }} aria-hidden="true" />
                  <span className="inline-flex max-w-[96px] items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-medium shadow-sm backdrop-blur-sm" style={{ border: `1px solid ${color.border}`, color: color.text }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color.accent }} aria-hidden="true" />
                    <span className="truncate">{cursor.userName}</span>
                    <span style={{ color: color.text, opacity: 0.72 }}>작업 중</span>
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}

        <div className={`flex items-start gap-2 rounded-md ${block.type === "quote" ? "border-l-2 border-[var(--border)] pl-3" : ""} ${block.type === "callout" ? "rounded-lg border border-[var(--accent)]/20 bg-[var(--accent)]/5 px-4 py-2" : ""}`}>
          <EditingAffordance block={block} />
          {block.type === "checklist" ? (
            <input
              type="checkbox"
              className="mt-2"
              checked={Boolean(block.checked)}
              onChange={(e) => onChange(localContent, undefined, { checked: e.target.checked })}
              onClick={(e) => e.stopPropagation()}
            />
          ) : null}
          <textarea
            ref={textareaRef}
            className={`w-full resize-none border-0 bg-transparent p-1 text-[var(--foreground)] outline-none focus:ring-0 ${visibleRemoteCursors.length > 0 ? "md:pr-28" : ""} ${textareaBlockClass} ${block.type === "code" ? "" : "rounded-md"}`}
            rows={rows}
            value={editingValue}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onKeyUp={() => emitCursorOffset(false)}
            onSelect={() => emitCursorOffset(false)}
            onClick={() => emitCursorOffset(false)}
            onFocus={() => {
              captureSelection();
              onFocus();
              emitCursorOffset(false);
            }}
            onScroll={(event) => {
              const nextScrollTop = event.currentTarget.scrollTop;
              setOverlayMetrics((current) => current.scrollTop === nextScrollTop ? current : { ...current, scrollTop: nextScrollTop });
            }}
            onCompositionStart={() => {
              isComposingRef.current = true;
              captureSelection();
            }}
            onCompositionEnd={() => {
              requestAnimationFrame(() => {
                isComposingRef.current = false;
                if (pendingExternalContentRef.current !== null) {
                  const nextContent = pendingExternalContentRef.current;
                  const textarea = textareaRef.current;
                  const isFocusedTextEditor = Boolean(isEditing && textarea && document.activeElement === textarea);
                  if (isFocusedTextEditor && !shouldApplyExternalContentImmediately(block.type, nextContent)) {
                    return;
                  }
                  pendingExternalContentRef.current = null;
                  syncDraftContent(nextContent, false);
                }
              });
            }}
            onBlur={() => {
              if (slashActive) {
                setSlashActive(false);
                setSlashQuery("");
                setSlashSelectedIndex(0);
              } else {
                onChange(localContent);
              }
              if (pendingExternalContentRef.current !== null) {
                const nextContent = pendingExternalContentRef.current;
                pendingExternalContentRef.current = null;
                syncDraftContent(nextContent, false);
              }
            }}
            placeholder={placeholderText}
          />
        </div>

        {slashActive && (displayOptions.length > 0 || Boolean(slashQuery)) && (
          <div className="absolute left-0 top-full z-50 mt-1 w-52 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-lg">
            <div className="border-b border-[var(--border)] px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
              {slashQuery ? `"${slashQuery}" 검색 결과` : "블록 전환"}
            </div>
            {!slashQuery ? (
              <div className="border-b border-[var(--border)] px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-[var(--muted)]">
                자주 쓰는 블록
              </div>
            ) : null}
            {slashQuery && displayOptions.length === 0 ? (
              <p className="px-3 py-2 text-xs text-[var(--muted)]">일치하는 블록 유형이 없습니다</p>
            ) : (
              (() => {
                let selectableIndex = -1;
                return displayOptions.map((opt, idx) => {
                  if (opt.type === "___divider___") {
                    return <div key="slash-palette-separator" className="my-0.5 border-t border-[var(--border)]" />;
                  }
                  selectableIndex += 1;
                  const isSelected = selectableIndex === slashSelectedIndex;
                  return (
                    <button
                      key={opt.type}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        applySlashCommand(opt.type);
                      }}
                      className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition ${
                        isSelected
                          ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                          : "text-[var(--foreground)] hover:bg-[var(--surface-strong)]"
                      }`}
                    >
                      <span className="w-6 text-center font-mono text-xs text-[var(--muted)]">{opt.icon}</span>
                      <span>{highlightMatch(opt.label, slashQuery)}</span>
                    </button>
                  );
                });
              })()
            )}
          </div>
        )}
      </div>
    );
  }

  // --- Render mode ---
  const commonClass = "cursor-pointer rounded-md p-1 hover:bg-[var(--surface-strong)]";

  if (block.type === "heading1") {
    return (
      <h1 className={`${commonClass} text-2xl font-bold text-[var(--foreground)]`} onMouseDown={activateOnPointer}>
        {renderInline(inlineNodes, !inlineNodes.length)}
      </h1>
    );
  }

  if (block.type === "heading2") {
    return (
      <h2 className={`${commonClass} text-xl font-bold text-[var(--foreground)]`} onMouseDown={activateOnPointer}>
        {renderInline(inlineNodes, !inlineNodes.length)}
      </h2>
    );
  }

  if (block.type === "heading3") {
    return (
      <h3 className={`${commonClass} text-lg font-semibold text-[var(--foreground)]`} onMouseDown={activateOnPointer}>
        {renderInline(inlineNodes, !inlineNodes.length)}
      </h3>
    );
  }

  if (block.type === "bulletList") {
    return (
      <ul className={`${commonClass} text-sm leading-relaxed text-[var(--foreground)]`} onMouseDown={activateOnPointer}>
        {listLines.map((entry) => {
          const spaces = entry.rawLine.match(/^(\s*)/)?.[1]?.length || 0;
          const level = Math.floor(spaces / 2);
          const bulletChars = ["\u2022", "\u25E6", "\u25AA"];
          const bullet = bulletChars[Math.min(level, bulletChars.length - 1)];
          return (
            <div
              key={`bullet-${entry.key}`}
              className="flex items-start gap-1.5"
              style={{ paddingLeft: `${level * 16}px` }}
            >
              <span className="mt-0.5 shrink-0 text-[var(--muted)]" style={{ fontSize: level === 0 ? "1em" : "0.85em" }}>{bullet}</span>
              <span>{renderInline(inlineTokens(entry.line), !entry.line)}</span>
            </div>
          );
        })}
      </ul>
    );
  }

  if (block.type === "numberedList") {
    let levelCounters: number[] = [];
    return (
      <ol className={`${commonClass} text-sm leading-relaxed text-[var(--foreground)]`} onMouseDown={activateOnPointer}>
        {listLines.map((entry) => {
          const spaces = entry.rawLine.match(/^(\s*)/)?.[1]?.length || 0;
          const level = Math.floor(spaces / 2);
          while (levelCounters.length <= level) levelCounters.push(0);
          levelCounters[level] = (levelCounters[level] || 0) + 1;
          if (level < levelCounters.length - 1) levelCounters = levelCounters.slice(0, level + 1);
          const num = levelCounters[level];
          return (
            <div
              key={`num-${entry.key}`}
              className="flex items-start gap-1.5"
              style={{ paddingLeft: `${level * 16}px` }}
            >
              <span className="mt-0.5 w-5 shrink-0 text-right text-[var(--muted)]">{num}.</span>
              <span>{renderInline(inlineTokens(entry.line), !entry.line)}</span>
            </div>
          );
        })}
      </ol>
    );
  }

  if (block.type === "quote") {
    return (
      <blockquote className={`${commonClass} border-l-2 border-[var(--border)] pl-3 text-sm leading-relaxed text-[var(--muted)]`} onMouseDown={activateOnPointer}>
        {listLines.map((entry) => (
          <p key={`quote-${entry.key}`}>
            {renderInline(inlineTokens(entry.line), !entry.line)}
          </p>
        ))}
      </blockquote>
    );
  }

  if (block.type === "code") {
    return (
      <pre className={`${commonClass} overflow-auto rounded-md bg-[var(--surface-strong)] p-3 text-xs text-[var(--foreground)]`} onMouseDown={activateOnPointer}>
        <code>{localContent || "\u00A0"}</code>
      </pre>
    );
  }

  if (block.type === "callout") {
    const [emoji, ...rest] = (localContent || "").split(" ");
    const isEmoji = emoji && /\p{Emoji}/u.test(emoji);
    const calloutEmoji = isEmoji ? emoji : "💡";
    const calloutText = isEmoji ? rest.join(" ") : localContent;
    return (
      <button
        type="button"
        className="flex w-full cursor-pointer items-start gap-3 rounded-lg border border-[var(--accent)]/20 bg-[var(--accent)]/5 px-4 py-3 text-left transition hover:bg-[var(--accent)]/8"
        onMouseDown={activateOnPointer}
      >
        <span className="mt-0.5 shrink-0 text-lg">{calloutEmoji}</span>
        <p className="text-sm leading-relaxed text-[var(--foreground)]">{calloutText || "\u00A0"}</p>
      </button>
    );
  }

  if (block.type === "image") {
    const url = resolveMediaUrl(localContent);
    if (url && (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/"))) {
      return (
        <button
          type="button"
          className="block w-full cursor-pointer overflow-hidden rounded-lg border border-[var(--border)] text-left"
          onMouseDown={activateOnPointer}
        >
          <Image src={url} alt="" width={1280} height={720} unoptimized className="max-h-80 w-full object-contain" />
        </button>
      );
    }
    return (
      <button
        type="button"
        className="flex w-full cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-[var(--border)] py-8 text-center transition hover:border-[var(--accent)]/40"
        onMouseDown={activateOnPointer}
      >
        <span className="text-3xl">🖼️</span>
        <p className="text-sm text-[var(--muted)]">클릭하여 이미지 URL 입력 또는 업로드</p>
      </button>
    );
  }

  if (block.type === "video") {
    const url = resolveMediaUrl(localContent);
    if (url && (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/"))) {
      return (
        <button
          type="button"
          className="block w-full cursor-pointer overflow-hidden rounded-lg border border-[var(--border)] text-left"
          onMouseDown={activateOnPointer}
        >
          <video src={url} controls className="max-h-80 w-full bg-black/80 object-contain">
            <track kind="captions" />
          </video>
        </button>
      );
    }
    return (
      <button
        type="button"
        className="flex w-full cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-[var(--border)] py-8 text-center transition hover:border-[var(--accent)]/40"
        onMouseDown={activateOnPointer}
      >
        <span className="text-3xl">🎬</span>
        <p className="text-sm text-[var(--muted)]">클릭하여 동영상 URL 입력 또는 업로드</p>
      </button>
    );
  }

  return (
    <p className={`${commonClass} text-sm leading-relaxed text-[var(--foreground)]`} onMouseDown={activateOnPointer}>
      {renderInline(inlineNodes, !inlineNodes.length)}
    </p>
  );
}

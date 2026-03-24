"use client";

import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import Image from "next/image";
import { marked, type Tokens } from "marked";

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
  | "file";

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

type EditorBlockProps = {
  block: EditorBlockData;
  isEditing: boolean;
  onFocus: () => void;
  onChange: (content: string, type?: BlockType, options?: { checked?: boolean }) => void;
  onFileUpload?: (file: File) => Promise<void>;
  onEnter: () => void;
  onDelete: () => void;
  autoFocus?: boolean;
};

export function EditorBlock({
  block,
  isEditing,
  onFocus,
  onChange,
  onFileUpload,
  onEnter,
  onDelete,
  autoFocus,
}: EditorBlockProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isComposingRef = useRef(false);
  const localContent = block.content || "";

  // Auto-focus when entering edit mode
  useEffect(() => {
    if ((isEditing || autoFocus) && textareaRef.current) {
      textareaRef.current.focus();
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [isEditing, autoFocus]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const native = e.nativeEvent as unknown as { isComposing?: boolean; keyCode?: number };
      if (isComposingRef.current || native?.isComposing || native?.keyCode === 229) {
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onChange(localContent);
        onEnter();
        return;
      }
      if (e.key === "Backspace" && localContent === "") {
        e.preventDefault();
        onDelete();
      }
    },
    [localContent, onChange, onEnter, onDelete]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;

      const detected = detectBlockType(value, block.type);
      if (detected) {
        onChange(detected.content, detected.type);
      } else {
        onChange(value);
      }
    },
    [block.type, onChange]
  );

  const rows = Math.max(1, localContent.split("\n").length);
  const inlineNodes = useMemo(() => inlineTokens(localContent || ""), [localContent]);
  const listLines = useMemo(() => {
    const lines = localContent.split("\n").map((line) => line.trim()).filter(Boolean);
    return toStableLineEntries(lines.length ? lines : [""]);
  }, [localContent]);

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
          {fileData.filePath ? (
            <a href={fileData.filePath} target="_blank" rel="noreferrer" className="inline-block text-xs text-[var(--foreground)] underline">
              파일 열기
            </a>
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
          accept="*/*"
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
    return (
      <div
        className="flex cursor-pointer items-start gap-2 rounded-md p-1 hover:bg-[var(--surface-strong)]"
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
            {block.content || "\u00A0"}
          </span>
        </button>
      </div>
    );
  }

  // --- Edit mode ---
  if (isEditing) {
    return (
      <textarea
        ref={textareaRef}
        className="w-full resize-none rounded-md border-0 bg-transparent p-1 text-sm leading-relaxed text-[var(--foreground)] outline-none focus:ring-0"
        rows={rows}
        value={localContent}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onCompositionStart={() => {
          isComposingRef.current = true;
        }}
        onCompositionEnd={() => {
          queueMicrotask(() => {
            isComposingRef.current = false;
          });
        }}
        onBlur={() => onChange(localContent)}
        placeholder={block.type === "code" ? "코드를 입력하세요..." : "텍스트를 입력하세요..."}
      />
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
      <ul className={`${commonClass} list-disc pl-5 text-sm leading-relaxed text-[var(--foreground)]`} onMouseDown={activateOnPointer}>
        {listLines.map((entry) => (
          <li key={`bullet-${entry.key}`} className="ml-1">
            {renderInline(inlineTokens(entry.line), !entry.line)}
          </li>
        ))}
      </ul>
    );
  }

  if (block.type === "numberedList") {
    return (
      <ol className={`${commonClass} list-decimal pl-5 text-sm leading-relaxed text-[var(--foreground)]`} onMouseDown={activateOnPointer}>
        {listLines.map((entry) => (
          <li key={`number-${entry.key}`} className="ml-1">
            {renderInline(inlineTokens(entry.line), !entry.line)}
          </li>
        ))}
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

  return (
    <p className={`${commonClass} text-sm leading-relaxed text-[var(--foreground)]`} onMouseDown={activateOnPointer}>
      {renderInline(inlineNodes, !inlineNodes.length)}
    </p>
  );
}

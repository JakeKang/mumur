"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { marked } from "marked";
import hljs from "highlight.js";
import "highlight.js/styles/github.css";

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

const renderer = new marked.Renderer();
renderer.code = ({ text, lang }: { text: string; lang?: string }) => {
  const language = lang && hljs.getLanguage(lang) ? lang : "plaintext";
  const highlighted = hljs.highlight(text, { language }).value;
  return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`;
};

marked.use({
  renderer,
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

function renderMarkdown(content: string): string {
  if (!content.trim()) return "";
  return marked.parse(content) as string;
}

type EditorBlockProps = {
  block: EditorBlockData;
  isEditing: boolean;
  onFocus: () => void;
  onChange: (content: string, type?: BlockType) => void;
  onEnter: () => void;
  onDelete: () => void;
  autoFocus?: boolean;
};

export function EditorBlock({
  block,
  isEditing,
  onFocus,
  onChange,
  onEnter,
  onDelete,
  autoFocus,
}: EditorBlockProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [localContent, setLocalContent] = useState(block.content);

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
      setLocalContent(value);

      const detected = detectBlockType(value, block.type);
      if (detected) {
        onChange(detected.content, detected.type);
        setLocalContent(detected.content);
      } else {
        onChange(value);
      }
    },
    [block.type, onChange]
  );

  const rows = Math.max(1, localContent.split("\n").length);

  // --- Divider ---
  if (block.type === "divider") {
    return (
      <div className="py-2" onClick={onFocus}>
        <hr className="border-[var(--border)]" />
      </div>
    );
  }

  // --- Checklist (render mode) ---
  if (!isEditing && block.type === "checklist") {
    return (
      <div
        className="flex cursor-pointer items-start gap-2 rounded-md p-1 hover:bg-[var(--surface-strong)]"
        onClick={onFocus}
      >
        <input
          type="checkbox"
          className="mt-1"
          checked={Boolean(block.checked)}
          onChange={(e) => {
            e.stopPropagation();
            onChange(block.content);
          }}
          onClick={(e) => e.stopPropagation()}
        />
        <span
          className={`text-sm leading-relaxed ${block.checked ? "text-[var(--muted)] line-through" : "text-[var(--foreground)]"}`}
        >
          {block.content || "\u00A0"}
        </span>
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
        onBlur={() => onChange(localContent)}
        placeholder={block.type === "code" ? "코드를 입력하세요..." : "텍스트를 입력하세요..."}
      />
    );
  }

  // --- Render mode ---
  const html = renderMarkdown(wrapWithMarkdownSyntax(block));

  return (
    <div
      className="max-w-none cursor-pointer rounded-md p-1 text-sm leading-relaxed text-[var(--foreground)] hover:bg-[var(--surface-strong)] [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--border)] [&_blockquote]:pl-3 [&_blockquote]:text-[var(--muted)] [&_code]:rounded [&_code]:bg-[var(--surface-strong)] [&_code]:px-1 [&_code]:text-xs [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:text-xl [&_h2]:font-bold [&_h3]:text-lg [&_h3]:font-semibold [&_li]:ml-4 [&_ol]:list-decimal [&_p]:leading-relaxed [&_pre]:rounded [&_pre]:bg-[var(--surface-strong)] [&_pre]:p-3 [&_ul]:list-disc"
      onClick={onFocus}
      dangerouslySetInnerHTML={{ __html: html || "<p class='text-[var(--muted)]'>\u00A0</p>" }}
    />
  );
}

// --- Helpers ---------------------------------------------------------------

function wrapWithMarkdownSyntax(block: EditorBlockData): string {
  const c = block.content;
  switch (block.type) {
    case "heading1":
      return `# ${c}`;
    case "heading2":
      return `## ${c}`;
    case "heading3":
      return `### ${c}`;
    case "bulletList":
      return c
        .split("\n")
        .map((line) => `- ${line}`)
        .join("\n");
    case "numberedList":
      return c
        .split("\n")
        .map((line, i) => `${i + 1}. ${line}`)
        .join("\n");
    case "quote":
      return c
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
    case "code":
      return `\`\`\`${block.lang || ""}\n${c}\n\`\`\``;
    default:
      return c;
  }
}

import { Button } from "@/components/ui/button";
import { roleLabel } from "@/lib/ui-labels";

export function MentionAssistPanel({
  matches,
  activeIndex,
  setActiveIndex,
  applyMention,
  draft,
  setDraft,
  preview,
  removeMention,
  statusId,
  listboxId,
  activeOptionId,
  announcement,
  helpId,
  helpText,
  listboxLabel,
  previewTitle
}) {
  return (
    <>
      {matches.length ? (
        <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-2">
          {helpText ? <p className="mb-1 text-xs text-[var(--muted)]" id={helpId}>{helpText}</p> : null}
          <div id={statusId} aria-live="polite" aria-atomic="true" className="sr-only">
            {announcement}
          </div>
          <div id={listboxId} role="listbox" aria-label={listboxLabel} className="flex flex-wrap gap-2">
            {matches.map((member) => (
              <Button
                key={`${listboxId}-${member.userId}`}
                id={matches[activeIndex]?.userId === member.userId ? activeOptionId : `${listboxId}-option-${member.userId}`}
                type="button"
                role="option"
                aria-selected={matches[activeIndex]?.userId === member.userId}
                size="sm"
                variant={matches[activeIndex]?.userId === member.userId ? "default" : "outline"}
                onMouseEnter={() => setActiveIndex(matches.findIndex((item) => item.userId === member.userId))}
                onClick={() => applyMention(setDraft, draft, member.email)}
                className="h-auto justify-start"
              >
                <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--surface-strong)] text-[10px] font-semibold text-[var(--muted)]">
                  {member.initials}
                </span>
                <span className="flex flex-col items-start text-left">
                  <span className="text-xs font-medium">{member.name}</span>
                  <span className="text-[10px] opacity-80">{member.email}</span>
                </span>
                <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] ${member.role === "owner" ? "bg-amber-100 text-amber-700" : "bg-[var(--surface-strong)] text-[var(--muted)]"}`}>
                  {roleLabel(member.role)}
                </span>
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {preview.length ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-2">
          <p className="mb-1 text-xs text-amber-700">{previewTitle}</p>
          <div className="flex flex-wrap gap-2">
            {preview.map((member) => (
              <div key={`${listboxId}-preview-${member.userId}`} className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-[var(--surface)] px-2 py-1 text-xs text-[var(--muted)]">
                <span className="font-semibold">@{member.name}</span>
                <span className="text-[10px] text-[var(--muted)]">{member.email}</span>
                <button
                  type="button"
                  className="ml-1 text-[10px] text-[var(--muted)] hover:text-[var(--foreground)]"
                  onClick={() => removeMention(setDraft, draft, member)}
                  aria-label={`${member.name} 멘션 제거`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

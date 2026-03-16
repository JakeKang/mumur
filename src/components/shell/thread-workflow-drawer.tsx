import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DrawerShell } from "@/components/ui/drawer-shell";
import { Input } from "@/components/ui/input";
import { MentionAssistPanel } from "@/components/shell/mention-assist-panel";
import { PriorityBadge } from "@/components/ui/priority-badge";
import { threadStatusLabel } from "@/lib/ui-labels";

function threadPriorityMeta(thread) {
  const comments = Number(thread?.commentCount || 0);
  if (thread?.status === "active" && comments >= 5) {
    return { level: "high" };
  }
  if (thread?.status === "active") {
    return { level: "medium" };
  }
  return { level: "low" };
}

export function ThreadWorkflowDrawer({
  open,
  onClose,
  threads,
  threadStatusCounts,
  threadListFilter,
  setThreadListFilter,
  visibleThreads,
  THREAD_STATUS,
  handleCreateThread,
  threadForm,
  setThreadForm,
  selectedThreadId,
  setSelectedThreadId,
  syncThreadEditor,
  selectedIdeaId,
  api,
  setThreadComments,
  selectedThread,
  handleUpdateThread,
  threadEdit,
  setThreadEdit,
  handleAddThreadComment,
  threadCommentDraft,
  setThreadCommentDraft,
  threadMentionMatches,
  activeThreadMentionIndex,
  setThreadMentionIndex,
  applyMention,
  threadMentionPreview,
  removeMention,
  threadMentionAnnouncement,
  threadMentionStatusId,
  threadMentionListboxId,
  activeThreadMentionOptionId,
  handleMentionKeyDown,
  threadComments,
  formatTime
}) {
  return (
    <DrawerShell
      open={open}
      onClose={onClose}
      title="토론 스레드"
      description="스레드 생성, 상태 관리, 댓글 협업을 한 화면에서 처리합니다"
      widthClass="max-w-3xl"
    >
      <section className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            <Badge>{`전체 ${threads.length}`}</Badge>
            <Badge>{`진행 ${threadStatusCounts.active}`}</Badge>
            <Badge>{`해결 ${threadStatusCounts.resolved}`}</Badge>
            <Badge>{`보류 ${threadStatusCounts.on_hold}`}</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={threadListFilter === "all" ? "default" : "outline"} onClick={() => setThreadListFilter("all")}>
              전체
            </Button>
            {THREAD_STATUS.map((status) => (
              <Button
                key={`thread-filter-${status}`}
                size="sm"
                variant={threadListFilter === status ? "default" : "outline"}
                onClick={() => setThreadListFilter(status)}
              >
                {threadStatusLabel(status)}
              </Button>
            ))}
          </div>
        </div>

        <form className="grid gap-2" onSubmit={handleCreateThread}>
          <Input
            placeholder="제목"
            value={threadForm.title}
            onChange={(event) => setThreadForm((prev) => ({ ...prev, title: event.target.value }))}
            required
          />
          <Input
            placeholder="설명"
            value={threadForm.description}
            onChange={(event) => setThreadForm((prev) => ({ ...prev, description: event.target.value }))}
          />
          <select
            className="h-10 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
            value={threadForm.status}
            onChange={(event) => setThreadForm((prev) => ({ ...prev, status: event.target.value }))}
          >
            {THREAD_STATUS.map((status) => (
              <option key={status} value={status}>
                {threadStatusLabel(status)}
              </option>
            ))}
          </select>
          <Button type="submit">스레드 생성</Button>
        </form>

        <div className="grid gap-2">
          {visibleThreads.length ? (
            visibleThreads.map((thread) => {
              const priority = threadPriorityMeta(thread);
              return (
                <button
                  type="button"
                  key={thread.id}
                  className={`rounded-md border p-2 text-left ${thread.id === selectedThreadId ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)] bg-[var(--surface)]"}`}
                  onClick={async () => {
                    setSelectedThreadId(thread.id);
                    syncThreadEditor(thread);
                    const res = await api(`/api/ideas/${selectedIdeaId}/threads/${thread.id}/comments`);
                    setThreadComments(res.comments || []);
                  }}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="font-medium text-[var(--foreground)]">{thread.title}</p>
                    <div className="flex items-center gap-1.5">
                      <Badge>{threadStatusLabel(thread.status)}</Badge>
                      <PriorityBadge level={priority.level} />
                    </div>
                  </div>
                  <p className="text-xs text-[var(--muted)]">{thread.description || "설명 없음"}</p>
                  <p className="text-[11px] text-[var(--muted)]">{`💬 ${thread.commentCount || 0} · 참여 ${thread.participantCount || 1}`}</p>
                </button>
              );
            })
          ) : (
            <p className="text-sm text-[var(--muted)]">스레드 없음</p>
          )}
        </div>

        {selectedThread ? (
          <>
            <form className="grid gap-2" onSubmit={handleUpdateThread}>
              <Input value={threadEdit.title} onChange={(event) => setThreadEdit((prev) => ({ ...prev, title: event.target.value }))} required />
              <Input value={threadEdit.description} onChange={(event) => setThreadEdit((prev) => ({ ...prev, description: event.target.value }))} />
              <select
                className="h-10 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
                value={threadEdit.status}
                onChange={(event) => setThreadEdit((prev) => ({ ...prev, status: event.target.value }))}
              >
                {THREAD_STATUS.map((status) => (
                  <option key={status} value={status}>
                    {threadStatusLabel(status)}
                  </option>
                ))}
              </select>
              <Input
                value={threadEdit.conclusion}
                placeholder="결론"
                onChange={(event) => setThreadEdit((prev) => ({ ...prev, conclusion: event.target.value }))}
              />
              <Button type="submit">스레드 업데이트</Button>
            </form>

            <form className="flex gap-2" onSubmit={handleAddThreadComment}>
              <Input
                className="flex-1"
                placeholder="스레드 댓글 (@email 또는 @이름공백없이 멘션)"
                value={threadCommentDraft}
                aria-label="스레드 댓글 입력"
                aria-haspopup="listbox"
                aria-autocomplete="list"
                aria-expanded={threadMentionMatches.length > 0}
                aria-controls={threadMentionMatches.length ? threadMentionListboxId : undefined}
                aria-activedescendant={threadMentionMatches.length ? activeThreadMentionOptionId : undefined}
                aria-describedby={threadMentionMatches.length ? `thread-mention-help ${threadMentionStatusId}` : undefined}
                onChange={(event) => {
                  setThreadCommentDraft(event.target.value);
                  setThreadMentionIndex(0);
                }}
                onKeyDown={(event) =>
                  handleMentionKeyDown(
                    event,
                    threadMentionMatches,
                    activeThreadMentionIndex,
                    setThreadMentionIndex,
                    setThreadCommentDraft,
                    threadCommentDraft
                  )
                }
                required
              />
              <Button type="submit">등록</Button>
            </form>

            <MentionAssistPanel
              matches={threadMentionMatches}
              activeIndex={activeThreadMentionIndex}
              setActiveIndex={setThreadMentionIndex}
              applyMention={applyMention}
              draft={threadCommentDraft}
              setDraft={setThreadCommentDraft}
              preview={threadMentionPreview}
              removeMention={removeMention}
              statusId={threadMentionStatusId}
              listboxId={threadMentionListboxId}
              activeOptionId={activeThreadMentionOptionId}
              announcement={threadMentionAnnouncement}
              helpId="thread-mention-help"
              helpText="멘션 자동완성 (화살표/엔터/탭 지원)"
              listboxLabel="스레드 멘션 후보"
              previewTitle="멘션 대상 미리보기"
            />

            <div className="grid gap-2">
              {threadComments.length ? (
                threadComments.map((comment) => (
                  <div key={comment.id} className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-2">
                    <p className="text-sm font-medium text-[var(--foreground)]">{comment.userName}</p>
                    <p className="text-sm text-[var(--foreground)]">{comment.content}</p>
                    <p className="text-xs text-[var(--muted)]">{formatTime(comment.createdAt)}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[var(--muted)]">스레드 댓글 없음</p>
              )}
            </div>
          </>
        ) : null}
      </section>
    </DrawerShell>
  );
}

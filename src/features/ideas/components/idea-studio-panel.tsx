import { useEffect, useMemo, useState, type ComponentProps, type Dispatch, type KeyboardEvent, type SetStateAction } from "react";
import { MentionAssistPanel } from "@/features/ideas/components/mention-assist-panel";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { timelineEventLabel } from "@/shared/constants/ui-labels";
import { ArrowLeft, ScrollText, SquarePen } from "lucide-react";
import {
  applyMentionToDraft,
  buildCommentContentParts,
  buildMentionCandidates,
  buildMentionUiState,
  buildThreadedComments,
  createMentionLookup,
  previewFromVersion,
  type IdeaStudioMentionCandidate,
  type IdeaStudioMentionCandidateSource,
  readRecentMentionEmails,
  removeMentionTokenFromText,
  writeRecentMentionEmails,
} from "@/features/ideas/utils/idea-studio-helpers";
import { useWorkbenchSessionContext } from "@/modules/workbench/presentation/contexts/workbench-contexts";
import type { IdeaBlockPresence } from "@/modules/workbench/application/hooks/use-idea-detail-helpers";
import { Input } from "@/shared/components/ui/input";
import { BlockEditor } from "@/features/ideas/components/editor/BlockEditor";
import type { Comment, Idea, IdeaVersion, TimelineEvent } from "@/shared/types";

import { DrawerShell } from "@/shared/components/ui/drawer-shell";
import { ConfirmDialog } from "@/shared/components/ui/confirm-dialog";

type IdeaStudioStatusMeta = EditorPanelProps["STATUS_META"];

type IdeaStudioVersionForm = {
  versionLabel: string;
  notes: string;
};

type EditorPanelProps = ComponentProps<typeof BlockEditor>;
type FormSubmitEvent = Parameters<NonNullable<ComponentProps<"form">["onSubmit"]>>[0];

type IdeaSavePatch = {
  title?: string;
  category?: string;
  status?: string;
  blocks?: Idea["blocks"];
  priority?: string;
};

export type IdeaStudioPanelProps = {
  selectedIdea: Idea | null;
  onBackToList: () => void;
  studioTab: string;
  setStudioTab: Dispatch<SetStateAction<string>>;
  STATUS_META: IdeaStudioStatusMeta;
  handleSaveIdea: (event?: { preventDefault?: () => void } | null, patch?: IdeaSavePatch, context?: unknown) => Promise<void> | void;
  blocks: Idea["blocks"];
  handleCreateComment: (event: FormSubmitEvent, blockIdOverride?: string, contentOverride?: string, parentId?: number | null) => Promise<void> | void;
  handleUpdateComment: (commentId: number, content: string) => Promise<void> | void;
  handleDeleteComment: (commentId: number) => Promise<void> | void;
  comments: Comment[];
  commentFilterBlockId: string;
  setCommentFilterBlockId: Dispatch<SetStateAction<string>>;
  applyCommentFilter: () => Promise<void> | void;
  reactionsByTarget: Record<string, { reactions: Array<{ emoji: string; count: number }>; mine: string[] }>;
  handleReaction: (emoji: string, targetType?: string, targetId?: string) => Promise<void> | void;
  handleCreateVersion: (event: FormSubmitEvent) => Promise<void> | void;
  handleRestoreVersion: (versionId: number) => Promise<boolean>;
  versionForm: IdeaStudioVersionForm;
  setVersionForm: Dispatch<SetStateAction<IdeaStudioVersionForm>>;
  versions: IdeaVersion[];
  timeline: TimelineEvent[];
  teamMembers: IdeaStudioMentionCandidateSource[];
  handleUploadBlockFile: NonNullable<EditorPanelProps["onUploadFile"]>;
  ideaPresence: IdeaBlockPresence[];
  reportActiveBlock: NonNullable<EditorPanelProps["onActiveBlockChange"]>;
};

export function IdeaStudioPanel({
  selectedIdea,
  onBackToList,
  studioTab,
  setStudioTab,
  STATUS_META,
  handleSaveIdea,
  blocks: _blocks,
  handleCreateComment,
  handleUpdateComment,
  handleDeleteComment,
  comments,
  commentFilterBlockId: _commentFilterBlockId,
  setCommentFilterBlockId,
  applyCommentFilter: _applyCommentFilter,
  reactionsByTarget,
  handleReaction,
  handleCreateVersion,
  handleRestoreVersion,
  versionForm,
  setVersionForm,
  versions,
  timeline,
  teamMembers,
  handleUploadBlockFile,
  ideaPresence,
  reportActiveBlock
}: IdeaStudioPanelProps) {
  const { teamMe, canEditIdea, formatTime } = useWorkbenchSessionContext();
  const myRole = teamMe?.role ?? null;
  const currentUserId = teamMe?.userId ?? null;
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editingCommentDraft, setEditingCommentDraft] = useState("");
  const [deleteCommentId, setDeleteCommentId] = useState<number | null>(null);
  const [commentMentionIndex, setCommentMentionIndex] = useState(0);
  const [blockCommentMentionIndex, setBlockCommentMentionIndex] = useState(0);
  const [replyMentionIndex, setReplyMentionIndex] = useState(0);
  const [blockCommentPanelOpen, setBlockCommentPanelOpen] = useState(false);
  const [blockCommentPanelBlockId, setBlockCommentPanelBlockId] = useState<string>("");
  const [globalCommentPanelOpen, setGlobalCommentPanelOpen] = useState(false);
  const [globalCommentDraft, setGlobalCommentDraft] = useState("");
  const [blockCommentDraft, setBlockCommentDraft] = useState("");
  const [replyingToCommentId, setReplyingToCommentId] = useState<number | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [restoreTarget, setRestoreTarget] = useState<null | {
    versionId: number;
    label: string;
    createdAt: number;
    preview: string;
  }>(null);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreRevision, setRestoreRevision] = useState(0);
  const [recentMentionEmails, setRecentMentionEmails] = useState(() => readRecentMentionEmails());
  const mentionCandidates = useMemo(() => buildMentionCandidates(teamMembers), [teamMembers]);

  useEffect(() => {
    writeRecentMentionEmails(recentMentionEmails);
  }, [recentMentionEmails]);


  const isReadOnly = !canEditIdea || myRole === "viewer";
  const canModerate = myRole === "admin" || myRole === "owner";
  const ideaPriority = useMemo(() => {
    if (!selectedIdea) {
      return "low";
    }
    if ((selectedIdea as { priority?: string }).priority) {
      return (selectedIdea as { priority?: string }).priority as string;
    }
    if (selectedIdea.priorityLevel) {
      return selectedIdea.priorityLevel;
    }
    const engagement = Number(selectedIdea.commentCount || 0) + Number(selectedIdea.reactionCount || 0) + Number(selectedIdea.versionCount || 0);
    if (selectedIdea.status === "harvest" || engagement >= 24) {
      return "high";
    }
    if (selectedIdea.status === "grow" || engagement >= 10) {
      return "medium";
    }
    return "low";
  }, [selectedIdea]);

  const mentionLookup = useMemo(() => {
    return createMentionLookup(mentionCandidates);
  }, [mentionCandidates]);

  const commentMentionState = useMemo(
    () => buildMentionUiState("comment", globalCommentDraft, commentMentionIndex, mentionCandidates, recentMentionEmails, mentionLookup),
    [commentMentionIndex, globalCommentDraft, mentionCandidates, mentionLookup, recentMentionEmails]
  );
  const blockCommentMentionState = useMemo(
    () => buildMentionUiState("block-comment", blockCommentDraft, blockCommentMentionIndex, mentionCandidates, recentMentionEmails, mentionLookup),
    [blockCommentDraft, blockCommentMentionIndex, mentionCandidates, mentionLookup, recentMentionEmails]
  );
  const replyMentionState = useMemo(
    () => buildMentionUiState("reply", replyDraft, replyMentionIndex, mentionCandidates, recentMentionEmails, mentionLookup),
    [mentionCandidates, mentionLookup, recentMentionEmails, replyDraft, replyMentionIndex]
  );

  const globalComments = useMemo(
    () => comments.filter((c) => !c.blockId || c.blockId === "").sort((a, b) => Number(b.createdAt) - Number(a.createdAt)),
    [comments]
  );

  const blockComments = useMemo(
    () => comments.filter((c) => c.blockId === blockCommentPanelBlockId).sort((a, b) => Number(b.createdAt) - Number(a.createdAt)),
    [comments, blockCommentPanelBlockId]
  );
  const globalCommentThreads = useMemo(() => buildThreadedComments(globalComments), [globalComments]);
  const blockCommentThreads = useMemo(() => buildThreadedComments(blockComments), [blockComments]);

  const renderCommentContent = (content: unknown) => {
    const parts = buildCommentContentParts(content, mentionLookup);
    return (
      <span className="whitespace-pre-wrap break-words">
        {parts.map((part) => part.type === "text"
          ? <span key={part.key}>{part.text}</span>
          : (
              <span
                key={part.key}
                className="mx-0.5 inline-flex max-w-full items-center rounded-full border border-[var(--accent)]/25 bg-[var(--accent)]/10 px-1.5 py-0.5 align-baseline text-xs font-medium text-[var(--accent)]"
                title={part.title}
              >
                <span className="truncate">{part.label}</span>
              </span>
            ))}
      </span>
    );
  };

  const applyMention = (setter: Dispatch<SetStateAction<string>>, currentValue: string, member: IdeaStudioMentionCandidate) => {
    const nextMention = applyMentionToDraft(currentValue, member);
    if (!nextMention) {
      return;
    }
    setRecentMentionEmails((prev) => [nextMention.normalizedEmail, ...prev.filter((item) => item !== nextMention.normalizedEmail)].slice(0, 12));
    setter(nextMention.value);
  };

  const removeMention = (setter: Dispatch<SetStateAction<string>>, currentValue: string, member: IdeaStudioMentionCandidate) => {
    let nextValue = removeMentionTokenFromText(currentValue, member.email);
    nextValue = removeMentionTokenFromText(nextValue, member.nameToken);
    nextValue = removeMentionTokenFromText(nextValue, member.legacyNameToken);
    setter(nextValue);
  };

  const handleMentionKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    matches: IdeaStudioMentionCandidate[],
    activeIndex: number,
    setActiveIndex: Dispatch<SetStateAction<number>>,
    setter: Dispatch<SetStateAction<string>>,
    value: string
  ) => {
    if (!matches.length) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) => (prev + 1) % matches.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) => (prev - 1 + matches.length) % matches.length);
      return;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      const target = matches[activeIndex] || matches[0];
      if (target) {
        applyMention(setter, value, target);
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setActiveIndex(0);
    }
  };

  return (
    <Card className={`studio-shell min-h-[70vh] xl:max-h-[calc(100vh-2rem)] xl:overflow-auto ${selectedIdea ? "studio-shell-detail" : "studio-shell-list"}`}>
      <CardContent className="space-y-5">
        {!selectedIdea ? (
          <section className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="text-sm text-[var(--muted)]">선택된 아이디어가 없습니다.</p>
            <Button type="button" onClick={onBackToList} className="w-fit">전체 아이디어로 이동</Button>
          </section>
        ) : (
          <>
            <div>
              <div className="flex items-center gap-3 border-b border-[var(--border)] px-1 py-1.5">
                {/* Left: back button */}
                <Button size="sm" variant="ghost" onClick={onBackToList} className="shrink-0 gap-1.5 text-[var(--muted)] hover:text-[var(--foreground)]">
                  <ArrowLeft className="h-4 w-4" />
                  목록으로
                </Button>

                {/* Divider */}
                <span className="h-4 w-px bg-[var(--border)]" />

                {/* Title */}
                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--foreground)]">
                  {selectedIdea.title || "제목 없음"}
                </p>

                {/* Right: status + priority + timestamps */}
                <div className="flex shrink-0 items-center gap-2">
                  <select
                    className="h-7 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-xs text-[var(--foreground)]"
                    value={selectedIdea.status}
                    onChange={(event) => {
                      if (isReadOnly) {
                        return;
                      }
                      void handleSaveIdea(null, { status: event.target.value });
                    }}
                    disabled={isReadOnly}
                    aria-label="문서 상태 변경"
                    title={isReadOnly ? "viewer 권한에서는 상태를 변경할 수 없습니다" : "문서 상태 변경"}
                  >
                    {Object.keys(STATUS_META).map((key) => {
                      const meta = STATUS_META[key];
                      return (
                        <option key={`studio-status-${key}`} value={key}>{meta.icon} {meta.label}</option>
                      );
                    })}
                  </select>
                  <select
                    className="h-7 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-xs text-[var(--foreground)]"
                    value={ideaPriority}
                    onChange={(event) => {
                      if (isReadOnly) return;
                      void handleSaveIdea(null, { priority: event.target.value });
                    }}
                    disabled={isReadOnly}
                    aria-label="중요도 변경"
                    title={isReadOnly ? "viewer 권한에서는 중요도를 변경할 수 없습니다" : "중요도 변경"}
                  >
                    <option value="low">🟢 낮음</option>
                    <option value="medium">🟡 중간</option>
                    <option value="high">🔴 높음</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center border-b border-[var(--border)] px-1">
                <div className="flex flex-1 flex-wrap gap-0">
                  <button
                    type="button"
                    className={`inline-flex items-center gap-1 border-b-2 px-3 py-2 text-sm ${studioTab === "editor" ? "border-[var(--accent)] text-[var(--foreground)]" : "border-transparent text-[var(--muted)]"} ${isReadOnly ? "cursor-not-allowed opacity-60" : ""}`}
                    onClick={() => {
                      if (!isReadOnly) {
                        setStudioTab("editor");
                      }
                    }}
                    disabled={isReadOnly}
                    aria-disabled={isReadOnly}
                    title={isReadOnly ? "viewer 권한에서는 편집 탭을 사용할 수 없습니다" : "편집"}
                  >
                    <SquarePen className="h-4 w-4" /> 편집
                  </button>
                  <button
                    type="button"
                    className={`inline-flex items-center gap-1 border-b-2 px-3 py-2 text-sm ${studioTab === "docs" ? "border-[var(--accent)] text-[var(--foreground)]" : "border-transparent text-[var(--muted)]"}`}
                    onClick={() => setStudioTab("docs")}
                  >
                    <ScrollText className="h-4 w-4" /> 문서/타임라인
                  </button>
                </div>
              </div>

              {isReadOnly ? (
                <p className="mx-1 my-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700">
                  viewer 권한에서는 편집 탭이 비활성화됩니다. 문서 탭에서 타임라인을 확인할 수 있습니다.
                </p>
              ) : null}
            </div>

            {studioTab === "editor" ? (
              <BlockEditor
                key={`${selectedIdea.id}-${restoreRevision}`}
                idea={selectedIdea}
                comments={comments}
                reactionsByTarget={reactionsByTarget}
                readOnly={isReadOnly}
                STATUS_META={STATUS_META}
                formatTime={formatTime}
                onSaveDocument={async (title, editorBlocks, context) => {
                  const blocks = editorBlocks.map((b) => ({
                    id: b.id,
                    type: b.type,
                    content: b.content,
                    checked: b.checked ?? false,
                  }));
                  await handleSaveIdea(null, { title, blocks }, context);
                }}
                onUploadFile={handleUploadBlockFile}
                onOpenBlockComments={(blockId) => {
                  setBlockCommentPanelBlockId(blockId);
                  setBlockCommentPanelOpen(true);
                  setBlockCommentDraft("");
                  setBlockCommentMentionIndex(0);
                }}
                onBlockReaction={async (blockId, emoji) => {
                  await handleReaction(emoji, "block", blockId);
                }}
                onOpenDocumentComments={() => setGlobalCommentPanelOpen((prev) => !prev)}
                globalCommentCount={globalComments.length}
                ideaPresence={ideaPresence}
                currentUserId={currentUserId}
                onActiveBlockChange={reportActiveBlock}
              />
            ) : null}

            {studioTab === "docs" ? (
              <>
            <section className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">타임라인</p>
                <form
                  className="flex items-center gap-1.5"
                  onSubmit={(event) => {
                    if (isReadOnly) {
                      event.preventDefault();
                      return;
                    }
                    void handleCreateVersion(event);
                  }}
                >
                  <Input
                    className="h-8 w-40"
                    placeholder="스냅샷 이름"
                    value={versionForm.versionLabel}
                    onChange={(event) => setVersionForm((prev) => ({ ...prev, versionLabel: event.target.value }))}
                    disabled={isReadOnly}
                  />
                  <Button type="submit" size="sm" disabled={isReadOnly}>스냅샷 생성</Button>
                </form>
              </div>
              <div className="grid gap-2">
                {timeline.length ? (
                  timeline.map((event) => {
                    const payload = event?.payload || {};
                    const eventType = event.eventType;
                    const createdLabel = eventType === "version.created" ? String(payload?.versionLabel || "") : "";
                    const sourceLabel = eventType === "version.restored"
                      ? String(payload?.sourceVersionLabel || payload?.versionLabel || payload?.from || "")
                      : "";
                    const restoredLabel = eventType === "version.restored" ? String(payload?.restoredVersionLabel || "") : "";
                    const restoreLabel = sourceLabel || createdLabel;
                    const payloadVersionId = Number(
                      eventType === "version.restored" ? (payload?.sourceVersionId ?? payload?.versionId) : payload?.versionId
                    );
                    const restoreVersionById = Number.isInteger(payloadVersionId) && payloadVersionId > 0
                      ? versions.find((version) => Number(version.id) === payloadVersionId)
                      : null;
                    const fallbackMatches = restoreLabel
                      ? versions.filter((version) => String(version.versionLabel) === restoreLabel)
                      : [];
                    const hasAmbiguousFallback = !restoreVersionById && fallbackMatches.length > 1;
                    const restoreVersion = restoreVersionById || fallbackMatches[0] || null;
                    const isRestoredSnapshot = eventType === "version.created" && createdLabel.startsWith("복원-");

                    return (
                      <div key={event.id} className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium">{timelineEventLabel(eventType)}</p>
                            <p className="text-xs text-[var(--muted)]">{event.actorName || "알 수 없음"}</p>
                            <p className="text-xs text-[var(--muted)]">{formatTime(event.createdAt)}</p>
                            {eventType === "version.created" && createdLabel ? (
                              <div className="mt-1 flex items-center gap-1.5">
                                <span className={`rounded px-1.5 py-0.5 text-[10px] ${isRestoredSnapshot ? "bg-amber-100 text-amber-700" : "bg-[var(--surface-strong)] text-[var(--muted)]"}`}>
                                  {isRestoredSnapshot ? "복원본" : "스냅샷"}
                                </span>
                                <p className="text-xs text-[var(--muted)]">{createdLabel}</p>
                              </div>
                            ) : null}
                            {eventType === "version.restored" && sourceLabel ? (
                              <div className="mt-1 space-y-0.5">
                                <p className="text-xs text-[var(--muted)]">원본: {sourceLabel}</p>
                                {restoredLabel ? <p className="text-xs text-[var(--muted)]">복원본: {restoredLabel}</p> : null}
                              </div>
                            ) : null}
                          </div>
                          {restoreVersion && !isReadOnly ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={hasAmbiguousFallback}
                              title={hasAmbiguousFallback ? "동일 라벨 스냅샷이 여러 개라 복원 대상을 확정할 수 없습니다" : undefined}
                              onClick={() =>
                                setRestoreTarget({
                                  versionId: restoreVersion.id,
                                  label: restoreLabel,
                                  createdAt: restoreVersion.createdAt,
                                  preview: previewFromVersion(restoreVersion)
                                })
                              }
                            >
                              복원
                            </Button>
                          ) : null}
                        </div>
                        {hasAmbiguousFallback ? (
                          <p className="mt-1 text-xs text-amber-700">동일 라벨 스냅샷이 여러 개라 현재 항목에서는 복원을 막았습니다.</p>
                        ) : null}
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-[var(--muted)]">이벤트 없음</p>
                )}
              </div>
            </section>
              </>
            ) : null}
          </>
        )}
      </CardContent>

      <DrawerShell
        open={globalCommentPanelOpen}
        title="문서 전체 댓글"
        description="문서 단위 토론 스레드"
        onClose={() => {
          setGlobalCommentPanelOpen(false);
          setCommentMentionIndex(0);
          setGlobalCommentDraft("");
          setReplyingToCommentId(null);
          setReplyMentionIndex(0);
          setReplyDraft("");
        }}
        widthClass="max-w-lg"
      >
        <div id="global-comment-thread-panel" className="space-y-3">
          {!isReadOnly && (
            <form
              className="flex gap-2"
              onSubmit={async (event) => {
                if (!globalCommentDraft.trim()) {
                  event.preventDefault();
                  return;
                }
                await handleCreateComment(event, "", globalCommentDraft);
                setGlobalCommentDraft("");
                setCommentMentionIndex(0);
              }}
            >
              <div className="relative min-w-0 flex-1">
                <Input
                  value={globalCommentDraft}
                  placeholder="문서 댓글 입력... (@멘션 지원)"
                  aria-label="문서 댓글 입력"
                  aria-haspopup="listbox"
                  aria-autocomplete="list"
                  aria-expanded={commentMentionState.matches.length > 0}
                  aria-controls={commentMentionState.matches.length ? commentMentionState.listboxId : undefined}
                  aria-activedescendant={commentMentionState.matches.length ? commentMentionState.activeOptionId : undefined}
                  aria-describedby={commentMentionState.matches.length ? commentMentionState.statusId : undefined}
                  onChange={(event) => {
                    setGlobalCommentDraft(event.target.value);
                    setCommentMentionIndex(0);
                  }}
                  onKeyDown={(event) =>
                    handleMentionKeyDown(
                      event,
                      commentMentionState.matches,
                      commentMentionState.activeIndex,
                      setCommentMentionIndex,
                      setGlobalCommentDraft,
                      globalCommentDraft
                    )
                  }
                  required
                />
                <MentionAssistPanel
                  matches={commentMentionState.matches}
                  activeIndex={commentMentionState.activeIndex}
                  setActiveIndex={setCommentMentionIndex}
                  applyMention={applyMention}
                  draft={globalCommentDraft}
                  setDraft={setGlobalCommentDraft}
                  preview={commentMentionState.preview}
                  removeMention={removeMention}
                  statusId={commentMentionState.statusId}
                  listboxId={commentMentionState.listboxId}
                  activeOptionId={commentMentionState.activeOptionId}
                  announcement={commentMentionState.announcement}
                  helpId="comment-mention-help"
                  helpText=""
                  listboxLabel="문서 댓글 멘션 후보"
                  previewTitle="멘션 대상 미리보기"
                />
              </div>
              <Button type="submit" size="sm" disabled={!globalCommentDraft.trim()}>등록</Button>
            </form>
          )}

          <div className="space-y-2">
            {globalCommentThreads.length ? (
              globalCommentThreads.map(({ comment, replies }) => (
                <div key={comment.id}>
                  <div className="group rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 transition-all duration-150 hover:border-[var(--border)]/60 hover:shadow-sm">
                    <div className="mb-1.5 flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--surface-strong)] text-xs font-semibold text-[var(--foreground)]">
                          {(comment.userName || "?")[0].toUpperCase()}
                        </span>
                        <p className="text-xs font-semibold text-[var(--foreground)]">{comment.userName}</p>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                        <p className="text-[10px] text-[var(--muted)]">{formatTime(comment.createdAt)}</p>
                        {!isReadOnly && (comment.userId === currentUserId || canModerate) ? (
                          <>
                            <button
                              type="button"
                              className="rounded px-1.5 py-0.5 text-[10px] text-[var(--muted)] hover:bg-[var(--surface-strong)] hover:text-[var(--foreground)] transition"
                              onClick={() => {
                                setEditingCommentId(comment.id);
                                setEditingCommentDraft(comment.content || "");
                              }}
                            >
                              수정
                            </button>
                            <button
                              type="button"
                              className="rounded px-1.5 py-0.5 text-[10px] text-rose-400 hover:bg-rose-50 hover:text-rose-600 transition"
                              onClick={() => setDeleteCommentId(comment.id)}
                            >
                              삭제
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>

                    {editingCommentId === comment.id ? (
                      <div className="space-y-2">
                        <Input
                          value={editingCommentDraft}
                          onChange={(event) => setEditingCommentDraft(event.target.value)}
                          placeholder="댓글 수정"
                        />
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            size="sm"
                            onClick={async () => {
                              const next = editingCommentDraft.trim();
                              if (!next) return;
                              await handleUpdateComment(comment.id, next);
                              setEditingCommentId(null);
                              setEditingCommentDraft("");
                            }}
                          >
                            저장
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingCommentId(null);
                              setEditingCommentDraft("");
                            }}
                          >
                            취소
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm leading-relaxed text-[var(--foreground)]">{renderCommentContent(comment.content)}</p>
                    )}

                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      {["👍", "🔥", "✅"].map((emoji) => {
                        const targetId = `idea:${comment.id}`;
                        const key = `comment:${targetId}`;
                        const summary = reactionsByTarget?.[key] || { reactions: [], mine: [] };
                        const item = (summary.reactions || []).find((row) => row.emoji === emoji);
                        const mine = (summary.mine || []).includes(emoji);
                        return (
                          <button
                            key={`comment-reaction-${comment.id}-${emoji}`}
                            type="button"
                            disabled={isReadOnly}
                            onClick={() => handleReaction(emoji, "comment", targetId)}
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition ${
                              mine
                                ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                                : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)]/40"
                            }`}
                          >
                            {emoji} {item?.count || 0}
                          </button>
                        );
                      })}
                      {!isReadOnly ? (
                        <button
                          type="button"
                          className="ml-1 rounded px-1.5 py-0.5 text-[10px] text-[var(--muted)] hover:bg-[var(--surface-strong)] hover:text-[var(--accent)] transition"
                          onClick={() => {
                            setReplyingToCommentId(replyingToCommentId === comment.id ? null : comment.id);
                            setReplyMentionIndex(0);
                            setReplyDraft("");
                          }}
                        >
                          답글
                        </button>
                      ) : null}
                    </div>

                    {replyingToCommentId === comment.id ? (
                      <form
                        className="mt-2 flex gap-2"
                        onSubmit={async (event) => {
                          if (!replyDraft.trim()) { event.preventDefault(); return; }
                          await handleCreateComment(event, "", replyDraft, comment.id);
                          setReplyingToCommentId(null);
                          setReplyMentionIndex(0);
                          setReplyDraft("");
                        }}
                      >
                        <div className="relative min-w-0 flex-1">
                          <Input
                            value={replyDraft}
                            placeholder="답글 입력... (@멘션 지원)"
                            aria-label="답글 입력"
                            aria-haspopup="listbox"
                            aria-autocomplete="list"
                            aria-expanded={replyMentionState.matches.length > 0}
                            aria-controls={replyMentionState.matches.length ? replyMentionState.listboxId : undefined}
                            aria-activedescendant={replyMentionState.matches.length ? replyMentionState.activeOptionId : undefined}
                            aria-describedby={replyMentionState.matches.length ? replyMentionState.statusId : undefined}
                            onChange={(event) => {
                              setReplyDraft(event.target.value);
                              setReplyMentionIndex(0);
                            }}
                            onKeyDown={(event) =>
                              handleMentionKeyDown(
                                event,
                                replyMentionState.matches,
                                replyMentionState.activeIndex,
                                setReplyMentionIndex,
                                setReplyDraft,
                                replyDraft
                              )
                            }
                          />
                          <MentionAssistPanel
                            matches={replyMentionState.matches}
                            activeIndex={replyMentionState.activeIndex}
                            setActiveIndex={setReplyMentionIndex}
                            applyMention={applyMention}
                            draft={replyDraft}
                            setDraft={setReplyDraft}
                            preview={replyMentionState.preview}
                            removeMention={removeMention}
                            statusId={replyMentionState.statusId}
                            listboxId={replyMentionState.listboxId}
                            activeOptionId={replyMentionState.activeOptionId}
                            announcement={replyMentionState.announcement}
                            helpId="reply-mention-help"
                            helpText=""
                            listboxLabel="답글 멘션 후보"
                            previewTitle="답글 멘션 대상 미리보기"
                          />
                        </div>
                        <Button type="submit" size="sm" disabled={!replyDraft.trim()}>등록</Button>
                      </form>
                    ) : null}
                  </div>

                  {replies.length > 0 ? (
                    <div className="ml-4 mt-1 space-y-1 border-l-2 border-[var(--border)] pl-3">
                      {replies.map((reply) => (
                        <div key={reply.id} className="group rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] p-2.5">
                          <div className="mb-1 flex items-start justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--surface)] text-[10px] font-semibold text-[var(--foreground)]">
                                {(reply.userName || "?")[0].toUpperCase()}
                              </span>
                              <p className="text-xs font-semibold text-[var(--foreground)]">{reply.userName}</p>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                              <p className="text-[10px] text-[var(--muted)]">{formatTime(reply.createdAt)}</p>
                              {!isReadOnly && (reply.userId === currentUserId || canModerate) ? (
                                <>
                                  <button
                                    type="button"
                                    className="rounded px-1.5 py-0.5 text-[10px] text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)] transition"
                                    onClick={() => { setEditingCommentId(reply.id); setEditingCommentDraft(reply.content || ""); }}
                                  >
                                    수정
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded px-1.5 py-0.5 text-[10px] text-rose-400 hover:bg-rose-50 hover:text-rose-600 transition"
                                    onClick={() => setDeleteCommentId(reply.id)}
                                  >
                                    삭제
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </div>
                          {editingCommentId === reply.id ? (
                            <div className="space-y-1.5">
                              <Input value={editingCommentDraft} onChange={(event) => setEditingCommentDraft(event.target.value)} placeholder="답글 수정" />
                              <div className="flex gap-1">
                                <Button type="button" size="sm" onClick={async () => { const next = editingCommentDraft.trim(); if (!next) return; await handleUpdateComment(reply.id, next); setEditingCommentId(null); setEditingCommentDraft(""); }}>저장</Button>
                                <Button type="button" size="sm" variant="outline" onClick={() => { setEditingCommentId(null); setEditingCommentDraft(""); }}>취소</Button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm leading-relaxed text-[var(--foreground)]">{renderCommentContent(reply.content)}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="py-4 text-center text-sm text-[var(--muted)]">아직 문서 댓글이 없습니다.</p>
            )}
          </div>
        </div>
      </DrawerShell>

      <DrawerShell
        open={blockCommentPanelOpen}
        title="블록 댓글"
        description={`블록 ID: ${blockCommentPanelBlockId}`}
        onClose={() => {
          setBlockCommentPanelOpen(false);
          setBlockCommentDraft("");
          setBlockCommentMentionIndex(0);
          setCommentFilterBlockId("");
          setReplyingToCommentId(null);
          setReplyMentionIndex(0);
          setReplyDraft("");
        }}
        widthClass="max-w-md"
      >
        {!isReadOnly && (
          <form
            className="mb-4 flex flex-col gap-2"
            onSubmit={async (event) => {
              if (!blockCommentDraft.trim()) {
                event.preventDefault();
                return;
              }
              await handleCreateComment(event, blockCommentPanelBlockId, blockCommentDraft);
              setBlockCommentDraft("");
              setBlockCommentMentionIndex(0);
            }}
          >
            <div className="relative min-w-0 flex-1">
              <Input
                value={blockCommentDraft}
                placeholder="이 블록에 댓글 입력... (@멘션 지원)"
                onChange={(event) => {
                  setBlockCommentDraft(event.target.value);
                  setBlockCommentMentionIndex(0);
                }}
                onKeyDown={(event) =>
                  handleMentionKeyDown(
                    event,
                    blockCommentMentionState.matches,
                    blockCommentMentionState.activeIndex,
                    setBlockCommentMentionIndex,
                    setBlockCommentDraft,
                    blockCommentDraft
                  )
                }
                aria-label="블록 댓글 입력"
                aria-haspopup="listbox"
                aria-autocomplete="list"
                aria-expanded={blockCommentMentionState.matches.length > 0}
                aria-controls={blockCommentMentionState.matches.length ? blockCommentMentionState.listboxId : undefined}
                aria-activedescendant={blockCommentMentionState.matches.length ? blockCommentMentionState.activeOptionId : undefined}
                aria-describedby={blockCommentMentionState.matches.length ? blockCommentMentionState.statusId : undefined}
              />
              <MentionAssistPanel
                matches={blockCommentMentionState.matches}
                activeIndex={blockCommentMentionState.activeIndex}
                setActiveIndex={setBlockCommentMentionIndex}
                applyMention={applyMention}
                draft={blockCommentDraft}
                setDraft={setBlockCommentDraft}
                preview={blockCommentMentionState.preview}
                removeMention={removeMention}
                statusId={blockCommentMentionState.statusId}
                listboxId={blockCommentMentionState.listboxId}
                activeOptionId={blockCommentMentionState.activeOptionId}
                announcement={blockCommentMentionState.announcement}
                helpId="block-comment-mention-help"
                helpText=""
                listboxLabel="블록 댓글 멘션 후보"
                previewTitle="블록 댓글 멘션 대상 미리보기"
              />
            </div>
            <Button type="submit" size="sm" disabled={!blockCommentDraft.trim()}>등록</Button>
          </form>
        )}

        <div className="space-y-2">
          {blockCommentThreads.map(({ comment, replies }) => (
            <div key={comment.id}>
              <div className="group rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] p-3 transition-all duration-150 hover:border-[var(--border)]/60 hover:shadow-sm">
                <div className="mb-1.5 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--surface)] text-xs font-semibold text-[var(--foreground)]">
                      {(comment.userName || "?")[0].toUpperCase()}
                    </span>
                    <p className="text-xs font-semibold text-[var(--foreground)]">{comment.userName}</p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                    <p className="text-[10px] text-[var(--muted)]">{formatTime(comment.createdAt)}</p>
                    {!isReadOnly && (comment.userId === currentUserId || canModerate) ? (
                      <>
                        <button
                          type="button"
                          className="rounded px-1.5 py-0.5 text-[10px] text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)] transition"
                          onClick={() => { setEditingCommentId(comment.id); setEditingCommentDraft(comment.content || ""); }}
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          className="rounded px-1.5 py-0.5 text-[10px] text-rose-400 hover:bg-rose-50 hover:text-rose-600 transition"
                          onClick={() => setDeleteCommentId(comment.id)}
                        >
                          삭제
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>

                {editingCommentId === comment.id ? (
                  <div className="space-y-2">
                    <Input
                      value={editingCommentDraft}
                      onChange={(event) => setEditingCommentDraft(event.target.value)}
                      placeholder="댓글 수정"
                    />
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        size="sm"
                        onClick={async () => {
                          const next = editingCommentDraft.trim();
                          if (!next) return;
                          await handleUpdateComment(comment.id, next);
                          setEditingCommentId(null);
                          setEditingCommentDraft("");
                        }}
                      >
                        저장
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => { setEditingCommentId(null); setEditingCommentDraft(""); }}
                      >
                        취소
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm leading-relaxed text-[var(--foreground)]">{renderCommentContent(comment.content)}</p>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-1">
                  {["👍", "🔥", "✅"].map((emoji) => {
                    const targetId = `idea:${comment.id}`;
                    const key = `comment:${targetId}`;
                    const summary = reactionsByTarget?.[key] || { reactions: [], mine: [] };
                    const item = (summary.reactions || []).find((row) => row.emoji === emoji);
                    const mine = (summary.mine || []).includes(emoji);
                    return (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => handleReaction(emoji, "comment", targetId)}
                        disabled={isReadOnly}
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition ${mine ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)]/40"}`}
                      >
                        {emoji} {item?.count || 0}
                      </button>
                    );
                  })}
                  {!isReadOnly ? (
                    <button
                      type="button"
                      className="ml-1 rounded px-1.5 py-0.5 text-[10px] text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--accent)] transition"
                      onClick={() => {
                        setReplyingToCommentId(replyingToCommentId === comment.id ? null : comment.id);
                        setReplyMentionIndex(0);
                        setReplyDraft("");
                      }}
                    >
                      답글
                    </button>
                  ) : null}
                </div>

                {replyingToCommentId === comment.id ? (
                  <form
                    className="mt-2 flex gap-2"
                    onSubmit={async (event) => {
                      if (!replyDraft.trim()) { event.preventDefault(); return; }
                      await handleCreateComment(event, comment.blockId || blockCommentPanelBlockId, replyDraft, comment.id);
                      setReplyingToCommentId(null);
                      setReplyMentionIndex(0);
                      setReplyDraft("");
                    }}
                  >
                    <div className="relative min-w-0 flex-1">
                      <Input
                        value={replyDraft}
                        placeholder="답글 입력... (@멘션 지원)"
                        aria-label="답글 입력"
                        aria-haspopup="listbox"
                        aria-autocomplete="list"
                        aria-expanded={replyMentionState.matches.length > 0}
                        aria-controls={replyMentionState.matches.length ? replyMentionState.listboxId : undefined}
                        aria-activedescendant={replyMentionState.matches.length ? replyMentionState.activeOptionId : undefined}
                        aria-describedby={replyMentionState.matches.length ? replyMentionState.statusId : undefined}
                        onChange={(event) => {
                          setReplyDraft(event.target.value);
                          setReplyMentionIndex(0);
                        }}
                        onKeyDown={(event) =>
                          handleMentionKeyDown(
                            event,
                            replyMentionState.matches,
                            replyMentionState.activeIndex,
                            setReplyMentionIndex,
                            setReplyDraft,
                            replyDraft
                          )
                        }
                      />
                      <MentionAssistPanel
                        matches={replyMentionState.matches}
                        activeIndex={replyMentionState.activeIndex}
                        setActiveIndex={setReplyMentionIndex}
                        applyMention={applyMention}
                        draft={replyDraft}
                        setDraft={setReplyDraft}
                        preview={replyMentionState.preview}
                        removeMention={removeMention}
                        statusId={replyMentionState.statusId}
                        listboxId={replyMentionState.listboxId}
                        activeOptionId={replyMentionState.activeOptionId}
                        announcement={replyMentionState.announcement}
                        helpId="block-reply-mention-help"
                        helpText=""
                        listboxLabel="블록 답글 멘션 후보"
                        previewTitle="블록 답글 멘션 대상 미리보기"
                      />
                    </div>
                    <Button type="submit" size="sm" disabled={!replyDraft.trim()}>등록</Button>
                  </form>
                ) : null}
              </div>

              {replies.length > 0 ? (
                <div className="ml-4 mt-1 space-y-1 border-l-2 border-[var(--border)] pl-3">
                  {replies.map((reply) => (
                    <div key={reply.id} className="group rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5">
                      <div className="mb-1 flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--surface-strong)] text-[10px] font-semibold text-[var(--foreground)]">
                            {(reply.userName || "?")[0].toUpperCase()}
                          </span>
                          <p className="text-xs font-semibold text-[var(--foreground)]">{reply.userName}</p>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                          <p className="text-[10px] text-[var(--muted)]">{formatTime(reply.createdAt)}</p>
                          {!isReadOnly && (reply.userId === currentUserId || canModerate) ? (
                            <>
                              <button
                                type="button"
                                className="rounded px-1.5 py-0.5 text-[10px] text-[var(--muted)] hover:bg-[var(--surface-strong)] hover:text-[var(--foreground)] transition"
                                onClick={() => { setEditingCommentId(reply.id); setEditingCommentDraft(reply.content || ""); }}
                              >
                                수정
                              </button>
                              <button
                                type="button"
                                className="rounded px-1.5 py-0.5 text-[10px] text-rose-400 hover:bg-rose-50 hover:text-rose-600 transition"
                                onClick={() => setDeleteCommentId(reply.id)}
                              >
                                삭제
                              </button>
                            </>
                          ) : null}
                        </div>
                      </div>
                      {editingCommentId === reply.id ? (
                        <div className="space-y-1.5">
                          <Input value={editingCommentDraft} onChange={(event) => setEditingCommentDraft(event.target.value)} placeholder="답글 수정" />
                          <div className="flex gap-1">
                            <Button type="button" size="sm" onClick={async () => { const next = editingCommentDraft.trim(); if (!next) return; await handleUpdateComment(reply.id, next); setEditingCommentId(null); setEditingCommentDraft(""); }}>저장</Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => { setEditingCommentId(null); setEditingCommentDraft(""); }}>취소</Button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm leading-relaxed text-[var(--foreground)]">{renderCommentContent(reply.content)}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
          {blockComments.length === 0 && (
            <p className="py-4 text-center text-sm text-[var(--muted)]">이 블록에 댓글이 없습니다.</p>
          )}
        </div>
      </DrawerShell>

      {restoreTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-slate-950/40" onClick={() => setRestoreTarget(null)} aria-label="복원 다이얼로그 닫기" />
          <section className="relative w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-2xl">
            <p className="text-base font-semibold text-[var(--foreground)]">타임라인 복원</p>
            <p className="mt-1 text-sm text-[var(--muted)]">대상 스냅샷: {restoreTarget.label}</p>
            <p className="text-sm text-[var(--muted)]">시점: {formatTime(restoreTarget.createdAt)}</p>
            <div className="mt-3 rounded-md border border-[var(--border)] bg-[var(--surface-strong)] p-2">
              <p className="mb-1 text-xs font-medium text-[var(--foreground)]">미리보기</p>
              <pre className="whitespace-pre-wrap text-xs text-[var(--muted)]">{restoreTarget.preview}</pre>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setRestoreTarget(null)} disabled={restoreBusy}>취소</Button>
              <Button
                type="button"
                disabled={restoreBusy}
                onClick={async () => {
                  if (!selectedIdea?.id) {
                    return;
                  }
                  setRestoreBusy(true);
                  try {
                    const restored = await handleRestoreVersion(restoreTarget.versionId);
                    if (restored) {
                      setRestoreRevision((prev) => prev + 1);
                      setRestoreTarget(null);
                    }
                  } finally {
                    setRestoreBusy(false);
                  }
                }}
              >
                {restoreBusy ? "복원 중..." : "복원 실행"}
              </Button>
            </div>
          </section>
        </div>
      ) : null}

      <ConfirmDialog
        open={deleteCommentId !== null}
        title="댓글 삭제"
        description="이 댓글을 삭제할까요? 삭제 후 되돌릴 수 없습니다."
        confirmText="삭제"
        danger
        onConfirm={async () => {
          if (deleteCommentId !== null) {
            await handleDeleteComment(deleteCommentId);
            if (editingCommentId === deleteCommentId) {
              setEditingCommentId(null);
              setEditingCommentDraft("");
            }
          }
          setDeleteCommentId(null);
        }}
        onCancel={() => setDeleteCommentId(null)}
      />
    </Card>
  );
}

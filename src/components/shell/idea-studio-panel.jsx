import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { BlockActionsMenu } from "@/components/shell/block-actions-menu";
import { MentionAssistPanel } from "@/components/shell/mention-assist-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ThreadWorkflowDrawer } from "@/components/shell/thread-workflow-drawer";
import { categoryLabel, timelineEventLabel } from "@/lib/ui-labels";
import { ArrowLeft, Lightbulb, MessageSquareText, ScrollText, SquarePen } from "lucide-react";

export function IdeaStudioPanel({
  selectedIdea,
  ideas,
  selectIdea,
  onBackToList,
  studioTab,
  setStudioTab,
  IDEA_STATUS,
  STATUS_META,
  busy,
  handleSaveIdea,
  updateSelectedIdeaField,
  addBlock,
  applySlashCommand,
  blocks,
  BLOCK_TYPES,
  updateBlock,
  moveBlockUp,
  moveBlockDown,
  duplicateBlock,
  removeBlock,
  setCommentBlockId,
  handleGenerateSummary,
  commentDraft,
  setCommentDraft,
  handleCreateComment,
  commentBlockId,
  comments,
  commentFilterBlockId,
  setCommentFilterBlockId,
  applyCommentFilter,
  reactions,
  handleReaction,
  votes,
  handleVote,
  handleCreateThread,
  threadForm,
  setThreadForm,
  THREAD_STATUS,
  threads,
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
  threadComments,
  formatTime,
  handleCreateVersion,
  versionForm,
  setVersionForm,
  setVersionFile,
  versions,
  timeline,
  teamMembers
}) {
  const [threadListFilter, setThreadListFilter] = useState("all");
  const [threadDrawerOpen, setThreadDrawerOpen] = useState(false);
  const [commentMentionIndex, setCommentMentionIndex] = useState(0);
  const [threadMentionIndex, setThreadMentionIndex] = useState(0);
  const [recentMentionEmails, setRecentMentionEmails] = useState(() => {
    if (typeof window === "undefined") {
      return [];
    }
    try {
      const raw = window.localStorage.getItem("mumur.mentions.recentEmails");
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map((item) => String(item).toLowerCase()) : [];
    } catch {
      return [];
    }
  });
  const mentionCandidates = useMemo(() => {
    return Array.isArray(teamMembers)
      ? teamMembers.map((member) => ({
          userId: member.userId,
          name: member.name,
          email: member.email,
          role: member.role || "member",
          initials: String(member.name || "?")
            .split(" ")
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0]?.toUpperCase() || "")
            .join("") || "?",
          nameToken: String(member.name || "").replace(/\s+/g, "").toLowerCase()
        }))
      : [];
  }, [teamMembers]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem("mumur.mentions.recentEmails", JSON.stringify(recentMentionEmails));
  }, [recentMentionEmails]);
  const threadStatusCounts = useMemo(() => {
    return threads.reduce(
      (acc, item) => {
        if (item?.status && Object.prototype.hasOwnProperty.call(acc, item.status)) {
          acc[item.status] += 1;
        }
        return acc;
      },
      { active: 0, resolved: 0, on_hold: 0 }
    );
  }, [threads]);

  const visibleThreads = useMemo(() => {
    if (threadListFilter === "all") {
      return threads;
    }
    return threads.filter((item) => item.status === threadListFilter);
  }, [threadListFilter, threads]);

  const recentIdeas = useMemo(() => ideas.slice(0, 12), [ideas]);

  const mentionTokenFromText = (value) => {
    const text = String(value || "");
    const match = text.match(/(^|\s)@([^\s@]*)$/);
    return match ? match[2].toLowerCase() : "";
  };

  const extractMentionTokens = (value) => {
    const text = String(value || "");
    const matches = text.match(/@([^\s@]+)/g) || [];
    return [...new Set(matches.map((item) => item.slice(1).toLowerCase()))];
  };

  const mentionLookup = useMemo(() => {
    const map = new Map();
    mentionCandidates.forEach((member) => {
      map.set(member.email.toLowerCase(), member);
      if (!map.has(member.nameToken)) {
        map.set(member.nameToken, member);
      }
    });
    return map;
  }, [mentionCandidates]);

  const hasMentionContextFromText = (value) => {
    const text = String(value || "");
    return /(^|\s)@([^\s@]*)$/.test(text);
  };

  const mentionMatches = (token, hasContext) => {
    if (!hasContext) {
      return [];
    }
    const normalizedToken = String(token || "").toLowerCase();
    const recentRank = new Map(recentMentionEmails.map((email, index) => [email, index]));
    return mentionCandidates
      .filter((member) => {
        if (!normalizedToken) {
          return true;
        }
        return member.email.toLowerCase().includes(normalizedToken) || member.nameToken.includes(normalizedToken);
      })
      .sort((a, b) => {
        const aEmail = a.email.toLowerCase();
        const bEmail = b.email.toLowerCase();
        const aRecent = recentRank.has(aEmail) ? recentRank.get(aEmail) : Number.MAX_SAFE_INTEGER;
        const bRecent = recentRank.has(bEmail) ? recentRank.get(bEmail) : Number.MAX_SAFE_INTEGER;
        if (aRecent !== bRecent) {
          return aRecent - bRecent;
        }
        if (normalizedToken) {
          const aPrefix = aEmail.startsWith(normalizedToken) || a.nameToken.startsWith(normalizedToken) ? 0 : 1;
          const bPrefix = bEmail.startsWith(normalizedToken) || b.nameToken.startsWith(normalizedToken) ? 0 : 1;
          if (aPrefix !== bPrefix) {
            return aPrefix - bPrefix;
          }
        }
        return String(a.name || "").localeCompare(String(b.name || ""));
      })
      .slice(0, 6);
  };

  const commentMentionToken = mentionTokenFromText(commentDraft);
  const threadMentionToken = mentionTokenFromText(threadCommentDraft);
  const commentMentionContext = hasMentionContextFromText(commentDraft);
  const threadMentionContext = hasMentionContextFromText(threadCommentDraft);
  const commentMentionMatches = mentionMatches(commentMentionToken, commentMentionContext);
  const threadMentionMatches = mentionMatches(threadMentionToken, threadMentionContext);
  const mentionPreviewMembers = (value) => {
    const tokens = extractMentionTokens(value);
    const collected = [];
    const seen = new Set();
    tokens.forEach((token) => {
      const member = mentionLookup.get(token);
      if (member && !seen.has(member.userId)) {
        seen.add(member.userId);
        collected.push(member);
      }
    });
    return collected;
  };
  const commentMentionPreview = mentionPreviewMembers(commentDraft);
  const threadMentionPreview = mentionPreviewMembers(threadCommentDraft);

  const activeCommentMentionIndex = commentMentionMatches.length
    ? Math.min(commentMentionIndex, commentMentionMatches.length - 1)
    : 0;
  const activeThreadMentionIndex = threadMentionMatches.length
    ? Math.min(threadMentionIndex, threadMentionMatches.length - 1)
    : 0;
  const commentMentionListboxId = "comment-mention-listbox";
  const threadMentionListboxId = "thread-mention-listbox";
  const commentMentionStatusId = "comment-mention-status";
  const threadMentionStatusId = "thread-mention-status";
  const activeCommentMentionOptionId = commentMentionMatches[activeCommentMentionIndex]
    ? `comment-mention-option-${commentMentionMatches[activeCommentMentionIndex].userId}`
    : undefined;
  const activeThreadMentionOptionId = threadMentionMatches[activeThreadMentionIndex]
    ? `thread-mention-option-${threadMentionMatches[activeThreadMentionIndex].userId}`
    : undefined;
  const commentMentionAnnouncement = commentMentionMatches.length
    ? `${commentMentionMatches.length}개의 멘션 추천이 있습니다. 현재 선택 ${activeCommentMentionIndex + 1}번.`
    : "멘션 추천이 없습니다.";
  const threadMentionAnnouncement = threadMentionMatches.length
    ? `${threadMentionMatches.length}개의 멘션 추천이 있습니다. 현재 선택 ${activeThreadMentionIndex + 1}번.`
    : "멘션 추천이 없습니다.";

  const applyMention = (setter, currentValue, email) => {
    const normalizedEmail = String(email || "").toLowerCase();
    const updated = String(currentValue || "").replace(/(^|\s)@([^\s@]*)$/, `$1@${email} `);
    setRecentMentionEmails((prev) => [normalizedEmail, ...prev.filter((item) => item !== normalizedEmail)].slice(0, 12));
    setter(updated);
  };

  const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const removeMentionTokenFromText = (value, token) => {
    const normalizedToken = String(token || "").trim();
    if (!normalizedToken) {
      return String(value || "");
    }
    const pattern = new RegExp(`(^|\\s)@${escapeRegex(normalizedToken)}(?=\\s|$)`, "gi");
    return String(value || "")
      .replace(pattern, " ")
      .replace(/\s{2,}/g, " ")
      .trimStart();
  };

  const removeMention = (setter, currentValue, member) => {
    let nextValue = removeMentionTokenFromText(currentValue, member.email);
    nextValue = removeMentionTokenFromText(nextValue, member.nameToken);
    setter(nextValue);
  };

  const handleMentionKeyDown = (event, matches, activeIndex, setActiveIndex, setter, value) => {
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
        applyMention(setter, value, target.email);
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
      <CardHeader>
        <CardTitle>아이디어 스튜디오</CardTitle>
        <p className="text-sm text-[var(--muted)]">블록 기반 편집과 협업 피드백을 한 화면에서 관리</p>
      </CardHeader>
      <CardContent className="space-y-5">
        {!selectedIdea ? (
          <section className="space-y-3">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
              <div className="flex items-start gap-2">
                <Lightbulb className="mt-0.5 h-4 w-4 text-amber-600" />
                <div>
                  <p className="text-xs uppercase tracking-wide text-[var(--muted)]">바로 시작</p>
                  <p className="mt-1 text-sm text-[var(--muted)]">탐색/정렬/필터/저장된 뷰는 왼쪽 사이드바에서 관리됩니다. 여기서는 아이디어를 바로 열어 작업을 시작하세요.</p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-wide text-[var(--muted)]">현재 뷰 아이디어</p>
                <Badge>{`${recentIdeas.length}개`}</Badge>
              </div>

              {recentIdeas.length ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {recentIdeas.map((idea) => (
                    <button
                      key={`studio-idea-${idea.id}`}
                      type="button"
                      className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-left transition hover:border-[var(--border)] hover:bg-[var(--surface-strong)]"
                      onClick={() => selectIdea(idea.id)}
                    >
                      <div className="mb-1 flex items-start justify-between gap-2">
                        <p className="font-medium text-[var(--foreground)]">{idea.title}</p>
                        <Badge>{`${STATUS_META[idea.status]?.icon || "💡"} ${STATUS_META[idea.status]?.label || idea.status}`}</Badge>
                      </div>
                      <p className="text-xs text-[var(--muted)]">{categoryLabel(idea.category)}</p>
                      <p className="text-xs text-[var(--muted)]">{`${formatTime(idea.updatedAt)} · 💬 ${idea.commentCount || 0} · 👍 ${idea.reactionCount || 0} · 📄 ${idea.versionCount || 0}`}</p>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[var(--muted)]">사이드바 조건에 맞는 아이디어가 없습니다. 필터를 조정하거나 새 아이디어를 생성하세요.</p>
              )}
            </div>
          </section>
        ) : (
          <>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                <Badge>{`${STATUS_META[selectedIdea.status]?.icon || "💡"} ${STATUS_META[selectedIdea.status]?.label || selectedIdea.status}`}</Badge>
                <span>•</span>
                <span>{categoryLabel(selectedIdea.category)}</span>
                <span>•</span>
                <span>{formatTime(selectedIdea.updatedAt)}</span>
                <Button size="sm" variant="outline" onClick={onBackToList} className="ml-auto">
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  목록으로
                </Button>
              </div>

              <h2 className="mb-2 font-serif text-2xl font-bold tracking-tight text-[var(--foreground)]">{selectedIdea.title}</h2>

              <div className="mb-2 flex items-center gap-2 text-xs text-[var(--muted)]">
                <Lightbulb className="h-3.5 w-3.5" />
                <span>탭 전환 시 작성 내용 유지</span>
              </div>

              <div className="mt-3 flex flex-wrap gap-0 border-b border-[var(--border)]">
                <button
                  type="button"
                  className={`inline-flex items-center gap-1 border-b-2 px-3 py-2 text-sm ${studioTab === "editor" ? "border-[var(--accent)] text-[var(--foreground)]" : "border-transparent text-[var(--muted)]"}`}
                  onClick={() => setStudioTab("editor")}
                >
                  <SquarePen className="h-4 w-4" /> 편집
                </button>
                <button
                  type="button"
                  className={`inline-flex items-center gap-1 border-b-2 px-3 py-2 text-sm ${studioTab === "collab" ? "border-[var(--accent)] text-[var(--foreground)]" : "border-transparent text-[var(--muted)]"}`}
                  onClick={() => setStudioTab("collab")}
                >
                  <MessageSquareText className="h-4 w-4" /> 협업
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

            {studioTab === "editor" ? (
              <>
            <form className="grid gap-2" onSubmit={handleSaveIdea}>
              <Input
                value={selectedIdea.title}
                onChange={(event) => updateSelectedIdeaField("title", event.target.value)}
                required
              />
              <Input
                value={selectedIdea.category}
                onChange={(event) => updateSelectedIdeaField("category", event.target.value)}
              />
              <select
                className="h-10 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
                value={selectedIdea.status}
                onChange={(event) => updateSelectedIdeaField("status", event.target.value)}
              >
                {IDEA_STATUS.map((status) => (
                  <option key={status} value={status}>
                    {`${STATUS_META[status].icon} ${STATUS_META[status].label}`}
                  </option>
                ))}
              </select>
              <Button type="submit" disabled={busy}>
                아이디어 저장
              </Button>
            </form>

            <section className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] p-3">
              <div className="flex items-center justify-between">
                <p className="font-medium">블록 에디터</p>
                <Button variant="outline" onClick={addBlock}>
                  + 블록
                </Button>
              </div>
              <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-2">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">슬래시 팔레트</p>
                <div className="flex flex-wrap gap-2">
                  {BLOCK_TYPES.map((type) => (
                    <Button key={`palette-${type}`} type="button" variant="outline" size="sm" onClick={() => addBlock(type)}>
                      {`/${type}`}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="grid gap-2">
                {blocks.map((block, index) => (
                  <div key={block.id} className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-2">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <select
                        className="h-9 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-sm"
                        value={block.type}
                        onChange={(event) => updateBlock(index, { type: event.target.value })}
                      >
                        {BLOCK_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                      {block.type === "checklist" ? (
                        <label className="text-sm text-[var(--muted)]">
                          <input
                            type="checkbox"
                            className="mr-1"
                            checked={Boolean(block.checked)}
                            onChange={(event) => updateBlock(index, { checked: event.target.checked })}
                          />
                          완료
                        </label>
                      ) : null}
                      <BlockActionsMenu
                        canMoveUp={index > 0}
                        canMoveDown={index < blocks.length - 1}
                        onMoveUp={() => moveBlockUp(index)}
                        onMoveDown={() => moveBlockDown(index)}
                        onDuplicate={() => duplicateBlock(index)}
                        onDelete={() => removeBlock(index)}
                        onSetCommentTarget={() => setCommentBlockId(block.id)}
                      />
                    </div>
                    {block.type !== "divider" ? (
                      <textarea
                        className="min-h-20 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] p-2 text-sm"
                        placeholder="/text 내용 또는 /checklist todo 처럼 입력 가능"
                        value={block.content}
                        onChange={(event) => updateBlock(index, { content: event.target.value })}
                        onBlur={(event) => applySlashCommand(index, event.target.value)}
                      />
                    ) : null}
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] p-3">
              <div className="flex items-center justify-between">
                <p className="font-medium">AI 요약</p>
                <Button variant="outline" onClick={handleGenerateSummary}>
                  요약 생성
                </Button>
              </div>
              <p className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-3 text-sm">
                {selectedIdea.aiSummary || "요약 없음"}
              </p>
            </section>
              </>
            ) : null}

            {studioTab === "collab" ? (
              <>
            <section className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">댓글</p>
                <Badge>{`${comments.length}개 댓글`}</Badge>
              </div>
              <form className="flex flex-wrap gap-2" onSubmit={handleCreateComment}>
                <Input
                  className="min-w-[240px] flex-1"
                  value={commentDraft}
                  placeholder="댓글 입력 (@email 또는 @이름공백없이 멘션)"
                  aria-label="댓글 입력"
                  aria-haspopup="listbox"
                  aria-autocomplete="list"
                  aria-expanded={commentMentionMatches.length > 0}
                  aria-controls={commentMentionMatches.length ? commentMentionListboxId : undefined}
                  aria-activedescendant={commentMentionMatches.length ? activeCommentMentionOptionId : undefined}
                  aria-describedby={commentMentionMatches.length ? `comment-mention-help ${commentMentionStatusId}` : undefined}
                  onChange={(event) => {
                    setCommentDraft(event.target.value);
                    setCommentMentionIndex(0);
                  }}
                  onKeyDown={(event) =>
                    handleMentionKeyDown(
                      event,
                      commentMentionMatches,
                      activeCommentMentionIndex,
                      setCommentMentionIndex,
                      setCommentDraft,
                      commentDraft
                    )
                  }
                  required
                />
                <select
                  className="h-10 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
                  value={commentBlockId}
                  onChange={(event) => setCommentBlockId(event.target.value)}
                >
                  <option value="">아이디어 전체</option>
                  {blocks.map((block) => (
                    <option key={block.id} value={block.id}>
                      {block.id}
                    </option>
                  ))}
                </select>
                <Button type="submit">등록</Button>
              </form>
              <MentionAssistPanel
                matches={commentMentionMatches}
                activeIndex={activeCommentMentionIndex}
                setActiveIndex={setCommentMentionIndex}
                applyMention={applyMention}
                draft={commentDraft}
                setDraft={setCommentDraft}
                preview={commentMentionPreview}
                removeMention={removeMention}
                statusId={commentMentionStatusId}
                listboxId={commentMentionListboxId}
                activeOptionId={activeCommentMentionOptionId}
                announcement={commentMentionAnnouncement}
                helpId="comment-mention-help"
                helpText="멘션 자동완성 (화살표/엔터/탭 지원)"
                listboxLabel="댓글 멘션 후보"
                previewTitle="멘션 대상 미리보기"
              />
              <div className="flex items-center gap-2">
                <select
                  className="h-10 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
                  value={commentFilterBlockId}
                  onChange={(event) => setCommentFilterBlockId(event.target.value)}
                >
                  <option value="">전체 블록</option>
                  {blocks.map((block) => (
                    <option key={block.id} value={block.id}>
                      {block.id}
                    </option>
                  ))}
                </select>
                <Button variant="outline" onClick={applyCommentFilter}>
                  필터 적용
                </Button>
              </div>
              <div className="grid gap-2">
                {comments.length ? (
                  comments.map((comment) => (
                    <div key={comment.id} className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-2">
                      <p className="text-sm font-medium">{comment.userName}</p>
                      <p className="text-sm">{comment.content}</p>
                      <p className="text-xs text-[var(--muted)]">{`${comment.blockId || "아이디어"} · ${formatTime(comment.createdAt)}`}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[var(--muted)]">댓글 없음</p>
                )}
              </div>
            </section>

            <section className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] p-3">
              <p className="font-medium">리액션</p>
              <div className="flex items-center gap-2">
                {["👍", "🔥", "🤔", "✅"].map((emoji) => (
                  <Button key={emoji} variant="outline" size="sm" onClick={() => handleReaction(emoji)}>
                    {emoji}
                  </Button>
                ))}
              </div>
              <p className="text-sm text-[var(--muted)]">
                {reactions.reactions.length
                  ? reactions.reactions.map((item) => `${item.emoji} ${item.count}`).join(" | ")
                  : "리액션 없음"}
              </p>
            </section>

            <section className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] p-3">
              <p className="font-medium">투표</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => handleVote("binary", "approve")}>
                  찬성
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleVote("binary", "reject")}>
                  반대
                </Button>
                {[1, 2, 3, 4, 5].map((score) => (
                  <Button key={score} variant="outline" size="sm" onClick={() => handleVote("score", score)}>
                    {score}
                  </Button>
                ))}
              </div>
              <p className="text-sm text-[var(--muted)]">{`찬성 ${votes.binary.approve} / 반대 ${votes.binary.reject}`}</p>
              <p className="text-sm text-[var(--muted)]">{`평균 ${votes.score.average} (${votes.score.total}명)`}</p>
            </section>

            <section className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-[var(--foreground)]">토론 스레드</p>
                  <p className="text-xs text-[var(--muted)]">복잡한 생성/편집/댓글 워크플로우는 전용 패널에서 처리합니다.</p>
                </div>
                <Button type="button" size="sm" onClick={() => setThreadDrawerOpen(true)}>
                  스레드 패널 열기
                </Button>
              </div>
              <div className="flex flex-wrap gap-1">
                <Badge>{`전체 ${threads.length}`}</Badge>
                <Badge>{`진행 ${threadStatusCounts.active}`}</Badge>
                <Badge>{`해결 ${threadStatusCounts.resolved}`}</Badge>
                <Badge>{`보류 ${threadStatusCounts.on_hold}`}</Badge>
              </div>
              <p className="text-xs text-[var(--muted)]">
                {selectedThread ? `현재 선택: ${selectedThread.title}` : "현재 선택된 스레드가 없습니다."}
              </p>
            </section>

            <ThreadWorkflowDrawer
              open={threadDrawerOpen}
              onClose={() => setThreadDrawerOpen(false)}
              threads={threads}
              threadStatusCounts={threadStatusCounts}
              threadListFilter={threadListFilter}
              setThreadListFilter={setThreadListFilter}
              visibleThreads={visibleThreads}
              THREAD_STATUS={THREAD_STATUS}
              handleCreateThread={handleCreateThread}
              threadForm={threadForm}
              setThreadForm={setThreadForm}
              selectedThreadId={selectedThreadId}
              setSelectedThreadId={setSelectedThreadId}
              syncThreadEditor={syncThreadEditor}
              selectedIdeaId={selectedIdeaId}
              api={api}
              setThreadComments={setThreadComments}
              selectedThread={selectedThread}
              handleUpdateThread={handleUpdateThread}
              threadEdit={threadEdit}
              setThreadEdit={setThreadEdit}
              handleAddThreadComment={handleAddThreadComment}
              threadCommentDraft={threadCommentDraft}
              setThreadCommentDraft={setThreadCommentDraft}
              threadMentionMatches={threadMentionMatches}
              activeThreadMentionIndex={activeThreadMentionIndex}
              setThreadMentionIndex={setThreadMentionIndex}
              applyMention={applyMention}
              threadMentionPreview={threadMentionPreview}
              removeMention={removeMention}
              threadMentionAnnouncement={threadMentionAnnouncement}
              threadMentionStatusId={threadMentionStatusId}
              threadMentionListboxId={threadMentionListboxId}
              activeThreadMentionOptionId={activeThreadMentionOptionId}
              handleMentionKeyDown={handleMentionKeyDown}
              threadComments={threadComments}
              formatTime={formatTime}
            />
              </>
            ) : null}

            {studioTab === "docs" ? (
              <>
            <section className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] p-3">
              <p className="font-medium">기획서 버전</p>
              <form className="grid gap-2" onSubmit={handleCreateVersion}>
                <Input
                  placeholder="버전 이름"
                  value={versionForm.versionLabel}
                  onChange={(event) => setVersionForm((prev) => ({ ...prev, versionLabel: event.target.value }))}
                />
                <Input
                  placeholder="변경 메모"
                  value={versionForm.notes}
                  onChange={(event) => setVersionForm((prev) => ({ ...prev, notes: event.target.value }))}
                />
                <Input
                  type="file"
                  onChange={(event) => setVersionFile(event.target.files?.[0] || null)}
                />
                <Button type="submit">버전 등록</Button>
              </form>
              <div className="grid gap-2">
                {versions.length ? (
                  versions.map((version) => (
                    <div key={version.id} className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-2">
                      <p className="font-medium">{version.versionLabel}</p>
                      <p className="text-sm">{version.notes || "(메모 없음)"}</p>
                      {version.filePath ? (
                        <a className="text-sm text-[var(--foreground)] underline" href={version.filePath} target="_blank" rel="noreferrer">
                          {version.fileName}
                        </a>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[var(--muted)]">버전 없음</p>
                )}
              </div>
            </section>

            <section className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] p-3">
              <p className="font-medium">타임라인</p>
              <div className="grid gap-2">
                {timeline.length ? (
                  timeline.map((event) => (
                    <div key={event.id} className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-2">
                      <p className="font-medium">{timelineEventLabel(event.type)}</p>
                      <p className="text-xs text-[var(--muted)]">{event.actor}</p>
                      <p className="text-xs text-[var(--muted)]">{formatTime(event.createdAt)}</p>
                    </div>
                  ))
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
    </Card>
  );
}

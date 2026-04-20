export type IdeaStudioMentionCandidate = {
  userId: number;
  name: string;
  email: string;
  role: string;
  initials: string;
  nameToken: string;
  legacyNameToken: string;
};

export type IdeaStudioMentionCandidateSource = {
  userId: number;
  name: string;
  email: string;
  role?: string | null;
};

export type IdeaStudioMentionUiState = {
  matches: IdeaStudioMentionCandidate[];
  preview: IdeaStudioMentionCandidate[];
  activeIndex: number;
  listboxId: string;
  statusId: string;
  activeOptionId: string | undefined;
  announcement: string;
};

export type IdeaStudioCommentContentPart =
  | { type: "text"; key: string; text: string }
  | { type: "mention"; key: string; label: string; title: string };

const RECENT_MENTION_EMAILS_KEY = "mumur.mentions.recentEmails";

type ParsedMention = {
  start: number;
  end: number;
  token: string;
  rawMention: string;
};

type ThreadableComment = {
  id: number;
  parentId?: number | null;
  createdAt: number | string;
};

export function normalizeMentionNameToken(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}._-]+/gu, "");
}

export function mentionTokenForMember(name: unknown, email: unknown) {
  const displayNameToken = normalizeMentionNameToken(name);
  if (displayNameToken) {
    return displayNameToken;
  }
  return normalizeMentionNameToken(String(email || "").split("@")[0]);
}

export function getActiveMentionMatch(value: unknown) {
  return String(value || "").match(/(^|[\s([{])@([\p{L}\p{N}._-]+)$/u);
}

export function parseMentionsFromText(value: unknown) {
  const text = String(value || "");
  const pattern = /(^|[\s([{])@([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|[\p{L}\p{N}][\p{L}\p{N}._-]{0,62})(?=$|[\s),.!?:;\]}])/gu;
  const mentions: ParsedMention[] = [];
  let match: RegExpExecArray | null = pattern.exec(text);

  while (match) {
    const boundary = match[1] || "";
    const rawToken = String(match[2] || "");
    const start = match.index + boundary.length;
    mentions.push({
      start,
      end: start + rawToken.length + 1,
      token: rawToken.toLowerCase(),
      rawMention: `@${rawToken}`
    });
    match = pattern.exec(text);
  }

  return mentions;
}

export function mentionTokenFromText(value: unknown) {
  const match = getActiveMentionMatch(value);
  return match ? match[2].toLowerCase() : "";
}

export function extractMentionTokens(value: unknown) {
  return [...new Set(parseMentionsFromText(value).map((item) => item.token))];
}

export function hasMentionContextFromText(value: unknown) {
  return Boolean(getActiveMentionMatch(value)?.[2]);
}

export function createMentionLookup(mentionCandidates: IdeaStudioMentionCandidate[]) {
  const map = new Map<string, IdeaStudioMentionCandidate>();
  mentionCandidates.forEach((member) => {
    map.set(member.email.toLowerCase(), member);
    if (!map.has(member.nameToken)) {
      map.set(member.nameToken, member);
    }
    if (member.legacyNameToken && !map.has(member.legacyNameToken)) {
      map.set(member.legacyNameToken, member);
    }
  });
  return map;
}

export function buildMentionCandidates(teamMembers: IdeaStudioMentionCandidateSource[] | null | undefined) {
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
        nameToken: mentionTokenForMember(member.name, member.email),
        legacyNameToken: String(member.name || "").replace(/\s+/g, "").toLowerCase(),
      }))
    : [];
}

export function mentionMatches(
  token: string,
  hasContext: boolean,
  mentionCandidates: IdeaStudioMentionCandidate[],
  recentMentionEmails: string[]
) {
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
      const aRecent = recentRank.has(aEmail) ? recentRank.get(aEmail)! : Number.MAX_SAFE_INTEGER;
      const bRecent = recentRank.has(bEmail) ? recentRank.get(bEmail)! : Number.MAX_SAFE_INTEGER;
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
}

export function previewMentionMembers(value: unknown, mentionLookup: Map<string, IdeaStudioMentionCandidate>) {
  const tokens = extractMentionTokens(value);
  const collected: IdeaStudioMentionCandidate[] = [];
  const seen = new Set<number>();
  tokens.forEach((token) => {
    const member = mentionLookup.get(token);
    if (member && !seen.has(member.userId)) {
      seen.add(member.userId);
      collected.push(member);
    }
  });
  return collected;
}

export function buildMentionUiState(
  prefix: string,
  draft: unknown,
  activeIndex: number,
  mentionCandidates: IdeaStudioMentionCandidate[],
  recentMentionEmails: string[],
  mentionLookup: Map<string, IdeaStudioMentionCandidate>
): IdeaStudioMentionUiState {
  const token = mentionTokenFromText(draft);
  const context = hasMentionContextFromText(draft);
  const matches = mentionMatches(token, context, mentionCandidates, recentMentionEmails);
  const preview = previewMentionMembers(draft, mentionLookup);
  const safeActiveIndex = matches.length
    ? Math.min(activeIndex, matches.length - 1)
    : 0;
  const listboxId = `${prefix}-mention-listbox`;
  const statusId = `${prefix}-mention-status`;
  const activeOptionId = matches[safeActiveIndex]
    ? `${prefix}-mention-option-${matches[safeActiveIndex].userId}`
    : undefined;
  const announcement = matches.length
    ? `${matches.length}개의 멘션 추천이 있습니다. 현재 선택 ${safeActiveIndex + 1}번.`
    : "멘션 추천이 없습니다.";

  return {
    matches,
    preview,
    activeIndex: safeActiveIndex,
    listboxId,
    statusId,
    activeOptionId,
    announcement,
  };
}

export function readRecentMentionEmails() {
  if (typeof window === "undefined") {
    return [] as string[];
  }
  try {
    const raw = window.localStorage.getItem(RECENT_MENTION_EMAILS_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((item) => String(item).toLowerCase()) : [];
  } catch {
    return [];
  }
}

export function writeRecentMentionEmails(emails: string[]) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(RECENT_MENTION_EMAILS_KEY, JSON.stringify(emails));
}

export function applyMentionToDraft(value: unknown, member: Partial<IdeaStudioMentionCandidate> | null | undefined) {
  const normalizedEmail = String(member?.email || "").toLowerCase();
  const mentionToken = String(member?.nameToken || "");
  if (!mentionToken) {
    return null;
  }

  return {
    normalizedEmail,
    value: String(value || "").replace(/(^|[\s([{])@[\p{L}\p{N}._-]+$/u, `$1@${mentionToken} `),
  };
}

function escapeRegex(value: unknown) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function removeMentionTokenFromText(value: unknown, token: unknown) {
  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) {
    return String(value || "");
  }
  const pattern = new RegExp(`(^|[\\s([{])@${escapeRegex(normalizedToken)}(?=$|[\\s),.!?:;\\]}])`, "giu");
  return String(value || "")
    .replace(pattern, (_, boundary) => boundary)
    .replace(/\s{2,}/g, " ")
    .trimStart();
}

export function buildCommentContentParts(value: unknown, mentionLookup: Map<string, IdeaStudioMentionCandidate>): IdeaStudioCommentContentPart[] {
  const text = String(value || "");
  const mentions = parseMentionsFromText(text);
  const parts: IdeaStudioCommentContentPart[] = [];
  let cursor = 0;

  mentions.forEach((mention, index) => {
    if (mention.start > cursor) {
      parts.push({
        type: "text",
        key: `comment-text-${cursor}`,
        text: text.slice(cursor, mention.start),
      });
    }

    const member = mentionLookup.get(mention.token);
    const label = member ? `@${member.name}` : mention.rawMention;
    parts.push({
      type: "mention",
      key: `comment-mention-${mention.start}-${mention.token}-${index}`,
      label,
      title: member ? `${member.name}${member.email ? ` · ${member.email}` : ""}` : label,
    });

    cursor = mention.end;
  });

  if (cursor < text.length) {
    parts.push({
      type: "text",
      key: `comment-text-${cursor}`,
      text: text.slice(cursor),
    });
  }

  if (parts.length === 0) {
    parts.push({ type: "text", key: "comment-text-empty", text });
  }

  return parts;
}

export function buildThreadedComments<T extends ThreadableComment>(list: T[]): Array<{ comment: T; replies: T[] }> {
  const replyMap = new Map<number, T[]>();
  list.filter((comment) => comment.parentId).forEach((reply) => {
    const parentId = Number(reply.parentId);
    const arr = replyMap.get(parentId) ?? [];
    arr.push(reply);
    replyMap.set(parentId, arr);
  });

  return list
    .filter((comment) => !comment.parentId)
    .map((comment) => ({
      comment,
      replies: (replyMap.get(comment.id) ?? []).sort((a, b) => Number(a.createdAt) - Number(b.createdAt)),
    }));
}

export function previewFromVersion(version: { notes?: unknown } | null | undefined) {
  const raw = String(version?.notes || "").trim();
  if (!raw) {
    return "저장된 블록 미리보기가 없습니다.";
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const text = parsed
        .map((block) => String(block?.content || "").trim())
        .filter(Boolean)
        .slice(0, 3)
        .join("\n");
      return text || "본문 텍스트가 없는 스냅샷입니다.";
    }
  } catch {
    return raw.length > 240 ? `${raw.slice(0, 240)}...` : raw;
  }
  return raw.length > 240 ? `${raw.slice(0, 240)}...` : raw;
}

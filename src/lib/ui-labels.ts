export function priorityLabel(level: string) {
  if (level === "high") {
    return "높음";
  }
  if (level === "medium") {
    return "중간";
  }
  if (level === "low") {
    return "낮음";
  }
  return "보통";
}

export function roleLabel(role: string) {
  const map: Record<string, string> = {
    admin: "관리자",
    owner: "관리자",
    deleter: "편집+삭제",
    editor: "편집자",
    member: "편집자",
    viewer: "보기 전용",
  };
  return map[role] ?? role;
}

export function invitationStatusLabel(status: string) {
  if (status === "pending") {
    return "대기";
  }
  if (status === "accepted") {
    return "수락";
  }
  if (status === "canceled" || status === "cancelled") {
    return "취소";
  }
  return status;
}

export function threadStatusLabel(status: string) {
  if (status === "active") {
    return "진행";
  }
  if (status === "resolved") {
    return "해결";
  }
  if (status === "on_hold") {
    return "보류";
  }
  return status;
}

export function streamStatusLabel(status: string) {
  if (status === "online") {
    return "연결됨";
  }
  if (status === "offline") {
    return "끊김";
  }
  return "확인 중";
}

export function categoryLabel(value: string) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "미분류";
  }
  const key = raw.toLowerCase();
  const labels = {
    product: "제품",
    tech: "기술",
    growth: "성장",
    ops: "운영",
    qa: "품질",
    general: "일반",
    uncategorized: "미분류"
  };
  return labels[key] || raw;
}

export function notificationTypeLabel(type: string) {
  const labels = {
    "mention.created": "멘션",
    "comment.created": "댓글",
    "comment.updated": "댓글 수정",
    "comment.deleted": "댓글 삭제",
    "thread.created": "스레드 생성",
    "thread.comment.created": "스레드 댓글",
    "thread.comment.updated": "스레드 댓글 수정",
    "thread.comment.deleted": "스레드 댓글 삭제",
    "vote.created": "투표",
    "vote.updated": "투표 업데이트",
    "version.created": "버전 등록",
    "version.restored": "타임라인 복원",
    "integration.webhook.updated": "웹훅 업데이트",
    "idea.created": "아이디어 등록",
    "idea.updated": "아이디어 수정",
    "idea.deleted": "아이디어 삭제",
    "team.member.left": "팀 탈퇴"
  };
  return labels[type] || type;
}

export function activityTypeLabel(type: string) {
  return notificationTypeLabel(type);
}

export function timelineEventLabel(type: string) {
  const labels = {
    "idea.created": "아이디어 등록",
    "idea.updated": "아이디어 수정",
    "idea.deleted": "아이디어 삭제",
    "comment.created": "댓글 등록",
    "comment.updated": "댓글 수정",
    "comment.deleted": "댓글 삭제",
    "thread.created": "토론 스레드 생성",
    "thread.updated": "토론 스레드 업데이트",
    "thread.comment.created": "스레드 댓글 등록",
    "thread.comment.updated": "스레드 댓글 수정",
    "thread.comment.deleted": "스레드 댓글 삭제",
    "vote.created": "투표 등록",
    "vote.updated": "투표 업데이트",
    "reaction.added": "리액션 추가",
    "reaction.removed": "리액션 제거",
    "version.created": "기획서 버전 등록",
    "version.restored": "타임라인 복원",
    "summary.generated": "AI 요약 생성",
    "mention.created": "멘션",
    "team.member.left": "팀 탈퇴"
  };
  return labels[type] || type;
}

export function deliveryStatusLabel(status: string) {
  if (/(fail|error)/i.test(String(status || ""))) {
    return "실패";
  }
  if (/(success|ok)/i.test(String(status || ""))) {
    return "성공";
  }
  if (/(pending|retry)/i.test(String(status || ""))) {
    return "대기";
  }
  return status || "알 수 없음";
}

export function voteTypeLabel(type: string) {
  if (type === "binary") {
    return "찬반";
  }
  if (type === "score") {
    return "점수";
  }
  return type || "유형";
}

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
    "version.created": "버전 등록",
    "version.restored": "타임라인 복원",
    "integration.webhook.updated": "웹훅 업데이트",
    "idea.created": "아이디어 등록",
    "idea.updated": "아이디어 수정",
    "idea.deleted": "아이디어 삭제",
    "team.member.left": "팀 탈퇴",
    "team.invitation.pending": "팀 초대 발송",
    "team.invitation.accepted": "팀 초대 수락",
    "team.invitation.cancelled": "팀 초대 취소"
  };
  return labels[type] || type;
}

export function notificationReadLabel(read: boolean) {
  return read ? "읽음" : "읽지 않음";
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
    "reaction.added": "리액션 추가",
    "reaction.removed": "리액션 제거",
    "version.created": "기획서 버전 등록",
    "version.restored": "타임라인 복원",
    "mention.created": "멘션",
    "team.member.left": "팀 탈퇴",
    "team.invitation.pending": "팀 초대 발송",
    "team.invitation.accepted": "팀 초대 수락",
    "team.invitation.cancelled": "팀 초대 취소"
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

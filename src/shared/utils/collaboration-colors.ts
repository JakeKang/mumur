const COLLABORATION_PALETTE = [
  {
    accent: "#0ea5e9",
    bg: "rgba(14, 165, 233, 0.12)",
    border: "rgba(14, 165, 233, 0.28)",
    text: "#0369a1",
    rail: "rgba(14, 165, 233, 0.78)",
  },
  {
    accent: "#8b5cf6",
    bg: "rgba(139, 92, 246, 0.12)",
    border: "rgba(139, 92, 246, 0.28)",
    text: "#6d28d9",
    rail: "rgba(139, 92, 246, 0.78)",
  },
  {
    accent: "#f59e0b",
    bg: "rgba(245, 158, 11, 0.12)",
    border: "rgba(245, 158, 11, 0.28)",
    text: "#b45309",
    rail: "rgba(245, 158, 11, 0.78)",
  },
  {
    accent: "#ef4444",
    bg: "rgba(239, 68, 68, 0.12)",
    border: "rgba(239, 68, 68, 0.28)",
    text: "#b91c1c",
    rail: "rgba(239, 68, 68, 0.78)",
  },
  {
    accent: "#10b981",
    bg: "rgba(16, 185, 129, 0.12)",
    border: "rgba(16, 185, 129, 0.28)",
    text: "#047857",
    rail: "rgba(16, 185, 129, 0.78)",
  },
  {
    accent: "#ec4899",
    bg: "rgba(236, 72, 153, 0.12)",
    border: "rgba(236, 72, 153, 0.28)",
    text: "#be185d",
    rail: "rgba(236, 72, 153, 0.78)",
  },
];

const SELF_COLOR = {
  accent: "#10b981",
  bg: "rgba(16, 185, 129, 0.12)",
  border: "rgba(16, 185, 129, 0.28)",
  text: "#047857",
  rail: "rgba(16, 185, 129, 0.78)",
};

function hashUserId(userId: number | string) {
  const input = String(userId || "0");
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function getCollaborationColor(userId: number | string, isSelf = false) {
  if (isSelf) {
    return SELF_COLOR;
  }
  return COLLABORATION_PALETTE[hashUserId(userId) % COLLABORATION_PALETTE.length];
}

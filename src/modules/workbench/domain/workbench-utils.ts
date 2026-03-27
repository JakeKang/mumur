import type { LocalSyncState } from "@/modules/workbench/domain/workbench-types";

export function blockSeed(type = "paragraph") {
  return {
    id: `block-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
    type,
    content: "",
    checked: false,
  };
}

export function formatTime(value: number | string | null | undefined) {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString();
}

export function toMillisFromDateInput(value: string, endOfDay = false) {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }
  const date = endOfDay ? new Date(`${raw}T23:59:59.999`) : new Date(`${raw}T00:00:00.000`);
  const ts = date.getTime();
  return Number.isFinite(ts) ? ts : null;
}

export function syncStateLabel(state: LocalSyncState) {
  if (state === "pending") {
    return "저장 대기";
  }
  if (state === "syncing") {
    return "저장 중...";
  }
  if (state === "failed") {
    return "저장 실패";
  }
  return "저장됨";
}

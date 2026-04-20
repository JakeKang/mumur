/**
 * server-draft.ts
 * Replaces IndexedDB deprecated/local-first-indexeddb.ts — stores idea drafts via server-side SQLite API.
 * Drafts are authenticated and user-scoped on the server.
 */

export type IdeaSavePayload = {
  title: string;
  category: string;
  status: string;
  priority: "low" | "medium" | "high";
  blocks: Array<{ id: string; type: string; content: string; checked: boolean }>;
  baseUpdatedAt: number;
};

export type IdeaSaveContext = {
  baseSnapshot?: string;
  mode?: "collab" | "legacy";
};

export type IdeaDraftRecord = {
  ideaId: number;
  payload: IdeaSavePayload;
  updatedAt: number;
  context?: IdeaSaveContext;
};

export type IdeaSyncRecord = {
  ideaId: number;
  payload: IdeaSavePayload;
  queuedAt: number;
  mode: "collab" | "legacy";
  context?: IdeaSaveContext;
};

const LOCAL_DRAFT_KEY_PREFIX = "mumur.ideaDraft.";
const LOCAL_SYNC_QUEUE_KEY = "mumur.ideaSyncQueue";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function draftStorageKey(ideaId: number) {
  return `${LOCAL_DRAFT_KEY_PREFIX}${ideaId}`;
}

function normalizeIdeaSaveContext(context?: IdeaSaveContext): IdeaSaveContext | undefined {
  const baseSnapshot = typeof context?.baseSnapshot === "string" && context.baseSnapshot
    ? context.baseSnapshot
    : undefined;
  const mode = context?.mode === "collab" || context?.mode === "legacy"
    ? context.mode
    : undefined;

  if (!baseSnapshot && !mode) {
    return undefined;
  }

  return {
    ...(baseSnapshot ? { baseSnapshot } : {}),
    ...(mode ? { mode } : {}),
  };
}

function readLocalQueue(): IdeaSyncRecord[] {
  if (!canUseStorage()) {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(LOCAL_SYNC_QUEUE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as IdeaSyncRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalQueue(queue: IdeaSyncRecord[]) {
  if (!canUseStorage()) {
    return;
  }
  window.localStorage.setItem(LOCAL_SYNC_QUEUE_KEY, JSON.stringify(queue));
}

function writeLocalDraft(ideaId: number, payload: IdeaSavePayload, context?: IdeaSaveContext) {
  if (!canUseStorage()) {
    return;
  }
  const draft: IdeaDraftRecord = {
    ideaId,
    payload,
    updatedAt: Date.now(),
    context: normalizeIdeaSaveContext(context),
  };
  window.localStorage.setItem(draftStorageKey(ideaId), JSON.stringify(draft));
}

function readLocalDraft(ideaId: number): IdeaDraftRecord | null {
  if (!canUseStorage()) {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(draftStorageKey(ideaId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as IdeaDraftRecord;
    if (parsed?.ideaId !== ideaId) {
      return null;
    }
    return {
      ideaId,
      payload: parsed.payload,
      updatedAt: Number(parsed.updatedAt || 0),
      context: normalizeIdeaSaveContext(parsed.context),
    };
  } catch {
    return null;
  }
}

function removeLocalDraft(ideaId: number) {
  if (!canUseStorage()) {
    return;
  }
  window.localStorage.removeItem(draftStorageKey(ideaId));
}

/**
 * Save a draft to the server. Silently no-ops on network error to avoid
 * interrupting the editing experience — the next autosave will retry.
 */
export async function saveIdeaDraft(
  ideaId: number,
  payload: IdeaSavePayload,
  context?: IdeaSaveContext
): Promise<void> {
  writeLocalDraft(ideaId, payload, context);
  try {
    const res = await fetch(`/api/drafts/${ideaId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload }),
      credentials: "same-origin",
    });
    if (!res.ok) {
      return;
    }
  } catch {
    void 0;
  }
}

/**
 * Load a draft from the server. Returns null if no draft exists or on network error.
 */
export async function loadIdeaDraft(ideaId: number): Promise<IdeaDraftRecord | null> {
  const localDraft = readLocalDraft(ideaId);
  try {
    const res = await fetch(`/api/drafts/${ideaId}`, { credentials: "same-origin" });
    if (!res.ok) return localDraft;
    const data = (await res.json()) as { draft: IdeaDraftRecord | null };
    const remoteDraft = data.draft
      ? {
          ideaId,
          payload: data.draft.payload,
          updatedAt: Number(data.draft.updatedAt || 0),
          context: normalizeIdeaSaveContext(data.draft.context),
        }
      : null;

    if (!remoteDraft) {
      return localDraft;
    }
    if (!localDraft) {
      return remoteDraft;
    }

    return Number(localDraft.updatedAt || 0) >= Number(remoteDraft.updatedAt || 0)
      ? localDraft
      : remoteDraft;
  } catch {
    return localDraft;
  }
}

/**
 * Remove a draft after successful server sync.
 */
export async function removeIdeaDraft(ideaId: number): Promise<void> {
  try {
    await fetch(`/api/drafts/${ideaId}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
  } catch {}
  removeLocalDraft(ideaId);
}

/**
 * Sync queue is superseded by direct server persistence.
 * These are kept as no-ops for API compatibility.
 */
export async function enqueueIdeaSync(
  ideaId: number,
  payload: IdeaSavePayload,
  context?: IdeaSaveContext
): Promise<void> {
  const queue = readLocalQueue().filter((row) => Number(row.ideaId) !== Number(ideaId));
  queue.push({
    ideaId,
    payload,
    queuedAt: Date.now(),
    mode: context?.mode === "collab" ? "collab" : "legacy",
    context: normalizeIdeaSaveContext(context),
  });
  writeLocalQueue(queue);
}

export async function dequeueIdeaSync(ideaId: number): Promise<void> {
  const queue = readLocalQueue().filter((row) => Number(row.ideaId) !== Number(ideaId));
  writeLocalQueue(queue);
}

export async function listIdeaSyncQueue(): Promise<IdeaSyncRecord[]> {
  return readLocalQueue().sort((a, b) => a.queuedAt - b.queuedAt);
}

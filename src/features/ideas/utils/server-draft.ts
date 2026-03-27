/**
 * server-draft.ts
 * Replaces IndexedDB local-first.ts — stores idea drafts via server-side SQLite API.
 * Drafts are authenticated and user-scoped on the server.
 */

export type IdeaSavePayload = {
  title: string;
  category: string;
  status: string;
  blocks: Array<{ id: string; type: string; content: string; checked: boolean }>;
};

type IdeaDraftRecord = {
  ideaId: number;
  payload: IdeaSavePayload;
  updatedAt: number;
};

type IdeaSyncRecord = {
  ideaId: number;
  payload: IdeaSavePayload;
  queuedAt: number;
};

/**
 * Save a draft to the server. Silently no-ops on network error to avoid
 * interrupting the editing experience — the next autosave will retry.
 */
export async function saveIdeaDraft(
  ideaId: number,
  payload: IdeaSavePayload,
  _updatedAt?: number
): Promise<void> {
  try {
    await fetch(`/api/drafts/${ideaId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload }),
      credentials: "same-origin",
    });
  } catch {
    // Network failure — silently ignore, autosave will retry
  }
}

/**
 * Load a draft from the server. Returns null if no draft exists or on network error.
 */
export async function loadIdeaDraft(ideaId: number): Promise<IdeaDraftRecord | null> {
  try {
    const res = await fetch(`/api/drafts/${ideaId}`, { credentials: "same-origin" });
    if (!res.ok) return null;
    const data = (await res.json()) as { draft: IdeaDraftRecord | null };
    return data.draft ?? null;
  } catch {
    return null;
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
  } catch {
    // Ignore — draft will be overwritten on next save
  }
}

/**
 * Sync queue is superseded by direct server persistence.
 * These are kept as no-ops for API compatibility.
 */
export async function enqueueIdeaSync(
  _ideaId: number,
  _payload: IdeaSavePayload,
  _queuedAt?: number
): Promise<void> {}

export async function dequeueIdeaSync(_ideaId: number): Promise<void> {}

export async function listIdeaSyncQueue(): Promise<IdeaSyncRecord[]> {
  return [];
}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dequeueIdeaSync,
  enqueueIdeaSync,
  listIdeaSyncQueue,
  loadIdeaDraft,
  removeIdeaDraft,
  saveIdeaDraft,
} from "@/features/ideas/utils/server-draft";

const payload = {
  title: "Draft",
  category: "qa",
  status: "seed",
  priority: "medium" as const,
  blocks: [{ id: "b-1", type: "paragraph", content: "hello", checked: false }],
  baseUpdatedAt: 100,
};

function createLocalStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => void store.clear(),
  };
}

describe("server-draft local fallback", () => {
  const localStorageMock = createLocalStorageMock();

  beforeEach(() => {
    vi.stubGlobal("window", { localStorage: localStorageMock });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorageMock.clear();
  });

  it("stores and loads a local fallback draft when fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await saveIdeaDraft(1, payload, { mode: "collab" });
    const draft = await loadIdeaDraft(1);

    expect(draft?.ideaId).toBe(1);
    expect(draft?.payload).toEqual(payload);
  });

  it("keeps a local shadow draft after server draft saves succeed", async () => {
    const baseSnapshot = JSON.stringify({ title: "Base", blocks: payload.blocks, updatedAt: 100 });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new Error("offline")));

    await saveIdeaDraft(1, payload, { mode: "collab", baseSnapshot });
    const draft = await loadIdeaDraft(1);

    expect(draft?.ideaId).toBe(1);
    expect(draft?.payload).toEqual(payload);
    expect(draft?.context).toEqual({ mode: "collab", baseSnapshot });
  });

  it("persists queue entries with mode and removes them", async () => {
    const baseSnapshot = JSON.stringify({ title: "Base", blocks: payload.blocks, updatedAt: 100 });
    await enqueueIdeaSync(1, payload, { mode: "collab", baseSnapshot });
    await enqueueIdeaSync(2, { ...payload, title: "Second" }, { mode: "legacy" });

    const queued = await listIdeaSyncQueue();
    expect(queued).toHaveLength(2);
    expect(queued[0].mode).toBe("collab");
    expect(queued[0].payload.priority).toBe("medium");
    expect(queued[0].context).toEqual({ mode: "collab", baseSnapshot });
    expect(queued[1].mode).toBe("legacy");

    await dequeueIdeaSync(1);
    const remaining = await listIdeaSyncQueue();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].ideaId).toBe(2);
  });

  it("removes local fallback draft during cleanup", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await saveIdeaDraft(1, payload);
    await removeIdeaDraft(1);

    const draft = await loadIdeaDraft(1);
    expect(draft).toBeNull();
  });
});

/**
 * @deprecated This module used browser IndexedDB for local draft storage.
 * It has been superseded by server-draft.ts which persists drafts server-side
 * via authenticated SQLite-backed API endpoints.
 *
 * This file is kept for reference. Import from server-draft.ts instead.
 */

export type IdeaSavePayload = {
  title: string;
  category: string;
  status: string;
  blocks: Array<{ id: string; type: string; content: string; checked: boolean }>;
};

type IdeaDraftRecord = {
  id: number;
  payload: IdeaSavePayload;
  updatedAt: number;
};

type IdeaSyncRecord = {
  ideaId: number;
  payload: IdeaSavePayload;
  queuedAt: number;
};

const DB_NAME = "mumur-local-cache";
const DB_VERSION = 1;
const DRAFT_STORE = "idea_drafts";
const SYNC_STORE = "idea_sync_queue";

function hasIndexedDb() {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase | null> {
  if (!hasIndexedDb()) {
    return Promise.resolve(null);
  }
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DRAFT_STORE)) {
        db.createObjectStore(DRAFT_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(SYNC_STORE)) {
        db.createObjectStore(SYNC_STORE, { keyPath: "ideaId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("indexedDB open failed"));
  });
}

async function runTx<T>(
  storeName: string,
  mode: IDBTransactionMode,
  runner: (store: IDBObjectStore) => Promise<T>
): Promise<T> {
  const db = await openDb();
  if (!db) {
    throw new Error("indexedDB unavailable");
  }
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    runner(store)
      .then((result) => {
        tx.oncomplete = () => {
          resolve(result);
          db.close();
        };
        tx.onerror = () => {
          reject(tx.error || new Error("indexedDB transaction failed"));
          db.close();
        };
      })
      .catch((error) => {
        reject(error);
        db.close();
      });
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("indexedDB request failed"));
  });
}

export async function saveIdeaDraft(ideaId: number, payload: IdeaSavePayload, updatedAt = Date.now()) {
  if (!hasIndexedDb()) {
    return;
  }
  await runTx(DRAFT_STORE, "readwrite", async (store) => {
    await requestToPromise(store.put({ id: ideaId, payload, updatedAt } as IdeaDraftRecord));
  });
}

export async function loadIdeaDraft(ideaId: number): Promise<IdeaDraftRecord | null> {
  if (!hasIndexedDb()) {
    return null;
  }
  return runTx(DRAFT_STORE, "readonly", async (store) => {
    const row = await requestToPromise(store.get(ideaId));
    return (row as IdeaDraftRecord | undefined) ?? null;
  });
}

export async function removeIdeaDraft(ideaId: number) {
  if (!hasIndexedDb()) {
    return;
  }
  await runTx(DRAFT_STORE, "readwrite", async (store) => {
    await requestToPromise(store.delete(ideaId));
  });
}

export async function enqueueIdeaSync(ideaId: number, payload: IdeaSavePayload, queuedAt = Date.now()) {
  if (!hasIndexedDb()) {
    return;
  }
  await runTx(SYNC_STORE, "readwrite", async (store) => {
    await requestToPromise(store.put({ ideaId, payload, queuedAt } as IdeaSyncRecord));
  });
}

export async function dequeueIdeaSync(ideaId: number) {
  if (!hasIndexedDb()) {
    return;
  }
  await runTx(SYNC_STORE, "readwrite", async (store) => {
    await requestToPromise(store.delete(ideaId));
  });
}

export async function listIdeaSyncQueue(): Promise<IdeaSyncRecord[]> {
  if (!hasIndexedDb()) {
    return [];
  }
  return runTx(SYNC_STORE, "readonly", async (store) => {
    const rows = await requestToPromise(store.getAll());
    return (rows as IdeaSyncRecord[]).sort((a, b) => Number(a.queuedAt || 0) - Number(b.queuedAt || 0));
  });
}

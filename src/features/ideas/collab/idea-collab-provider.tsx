"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createIdeaCollabAdapter, type IdeaCollabAdapter } from "@/features/ideas/collab/idea-collab-adapter";
import { IdeaCollabDoc, decodeCollabUpdate, encodeCollabUpdate, type IdeaCollabSnapshot } from "@/features/ideas/collab/idea-collab-doc";

type IdeaCollabStatus = "disabled" | "connecting" | "connected" | "error";

type IdeaCollabContextValue = {
  enabled: boolean;
  status: IdeaCollabStatus;
  ideaId: number;
  snapshot: IdeaCollabSnapshot;
  adapter: IdeaCollabAdapter;
  document: IdeaCollabDoc | null;
  revision: number;
};

const IdeaCollabContext = createContext<IdeaCollabContextValue | null>(null);

type IdeaCollabProviderProps = {
  ideaId: number;
  initialSnapshot: IdeaCollabSnapshot;
  children: ReactNode;
};

type IdeaCollabMessagePayload = {
  snapshot?: Partial<IdeaCollabSnapshot> | null;
  checkpoint?: Partial<IdeaCollabSnapshot> | null;
  update?: string | null;
};

type MutableFlag = {
  current: boolean;
};

const IDEA_COLLAB_RECONNECT_BASE_DELAY_MS = 1000;
const IDEA_COLLAB_RECONNECT_MAX_DELAY_MS = 30000;

function normalizeSnapshot(snapshot: Partial<IdeaCollabSnapshot> | null | undefined): IdeaCollabSnapshot {
  return {
    title: String(snapshot?.title || ""),
    blocks: Array.isArray(snapshot?.blocks)
      ? snapshot.blocks.map((block) => ({
          id: String(block?.id || ""),
          type: String(block?.type || "paragraph"),
          content: String(block?.content || ""),
          checked: Boolean(block?.checked),
        }))
      : [],
  };
}

export function getIdeaCollabReconnectDelay(reconnectTry: number) {
  const safeTry = Number.isFinite(reconnectTry) ? Math.max(0, Math.trunc(reconnectTry)) : 0;
  return Math.min(IDEA_COLLAB_RECONNECT_MAX_DELAY_MS, IDEA_COLLAB_RECONNECT_BASE_DELAY_MS * 2 ** safeTry);
}

export function hydrateIdeaCollabDocument(
  document: IdeaCollabDoc,
  payload: IdeaCollabMessagePayload | null | undefined,
  suppressSocketBroadcastRef: MutableFlag,
) {
  const bootstrapSnapshot = payload?.snapshot ?? payload?.checkpoint;

  if (bootstrapSnapshot !== undefined) {
    const normalized = normalizeSnapshot(bootstrapSnapshot);
    suppressSocketBroadcastRef.current = true;
    try {
      document.setTitle(normalized.title);
      document.replaceBlocks(normalized.blocks);
    } finally {
      suppressSocketBroadcastRef.current = false;
    }
    return;
  }

  if (payload?.update) {
    document.applyUpdate(decodeCollabUpdate(String(payload.update)), "remote");
  }
}

export function IdeaCollabProvider({ ideaId, initialSnapshot, children }: IdeaCollabProviderProps) {
  const [status, setStatus] = useState<IdeaCollabStatus>("connecting");
  const [revision, setRevision] = useState(0);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTryRef = useRef(0);
  const hasBootstrappedRef = useRef(false);
  const localChangesWhileDisconnectedRef = useRef(false);
  const suppressSocketBroadcastRef = useRef(false);
  const [document] = useState(() => IdeaCollabDoc.fromSnapshot(initialSnapshot));
  const adapter = useMemo(() => createIdeaCollabAdapter(document), [document]);

  useEffect(() => {
    const handleUpdate = (update: Uint8Array, origin: unknown) => {
      setRevision((current) => current + 1);
      if (origin === "remote" || suppressSocketBroadcastRef.current) {
        return;
      }
      const ws = socketRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        localChangesWhileDisconnectedRef.current = hasBootstrappedRef.current;
        return;
      }
      ws.send(JSON.stringify({ event: "collab.update", payload: { update: encodeCollabUpdate(update) } }));
    };

    document.ydoc.on("update", handleUpdate);
    return () => {
      document.ydoc.off("update", handleUpdate);
    };
  }, [document]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let disposed = false;

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const resetReconnectBackoff = () => {
      reconnectTryRef.current = 0;
      clearReconnectTimer();
    };

    const closeSocket = (target: WebSocket | null = socketRef.current) => {
      if (!target) {
        return;
      }

      if (socketRef.current === target) {
        socketRef.current = null;
      }

      target.onopen = null;
      target.onmessage = null;
      target.onerror = null;
      target.onclose = null;

      if (target.readyState === WebSocket.CONNECTING || target.readyState === WebSocket.OPEN) {
        target.close();
      }
    };

    const scheduleReconnect = () => {
      if (disposed || reconnectTimerRef.current) {
        return;
      }

      const delay = getIdeaCollabReconnectDelay(reconnectTryRef.current);
      reconnectTryRef.current += 1;
      setStatus((current) => (current === "disabled" ? current : "connecting"));
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        openSocket();
      }, delay);
    };

    const handleDisconnect = (target: WebSocket) => {
      closeSocket(target);
      if (disposed) {
        return;
      }
      scheduleReconnect();
    };

    const openSocket = () => {
      if (disposed) {
        return;
      }

      clearReconnectTimer();
      closeSocket();

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/ideas/${ideaId}`);
      socketRef.current = ws;
      setStatus((current) => (current === "disabled" ? current : "connecting"));

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(String(event.data || "{}"));
          if (parsed?.event === "collab.connected") {
            resetReconnectBackoff();
            setStatus("connected");
            return;
          }
          if (parsed?.event === "collab.bootstrap") {
            const shouldHydrate = !hasBootstrappedRef.current || !localChangesWhileDisconnectedRef.current;
            if (shouldHydrate) {
              hydrateIdeaCollabDocument(document, parsed.payload, suppressSocketBroadcastRef);
            }
            hasBootstrappedRef.current = true;
            localChangesWhileDisconnectedRef.current = false;
            resetReconnectBackoff();
            setStatus("connected");
            return;
          }
          if (parsed?.event === "collab.update") {
            hydrateIdeaCollabDocument(document, parsed.payload, suppressSocketBroadcastRef);
          }
        } catch {
          setStatus("error");
        }
      };

      ws.onerror = () => {
        handleDisconnect(ws);
      };

      ws.onclose = () => {
        handleDisconnect(ws);
      };
    };

    openSocket();

    return () => {
      disposed = true;
      clearReconnectTimer();
      closeSocket();
      reconnectTryRef.current = 0;
      hasBootstrappedRef.current = false;
      localChangesWhileDisconnectedRef.current = false;
      suppressSocketBroadcastRef.current = false;
    };
  }, [document, ideaId]);

  const value = useMemo<IdeaCollabContextValue>(() => ({
    enabled: true,
    status,
    ideaId,
    snapshot: document.getSnapshot(),
    adapter,
    document,
    revision,
  }), [adapter, document, ideaId, revision, status]);

  return <IdeaCollabContext.Provider value={value}>{children}</IdeaCollabContext.Provider>;
}

export function useIdeaCollab() {
  return useContext(IdeaCollabContext);
}

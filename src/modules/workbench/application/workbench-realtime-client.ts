import { reportClientIssue } from "@/shared/lib/observability";

type RealtimeHandler = (payload: unknown) => void;

type ListenerMap = Map<string, Set<RealtimeHandler>>;

type WorkbenchRealtimeClient = {
  retain: () => void;
  release: () => void;
  subscribe: (eventName: string, handler: RealtimeHandler) => () => void;
};

type GlobalRealtimeState = {
  client?: WorkbenchRealtimeClient;
};

const globalState = globalThis as typeof globalThis & GlobalRealtimeState;

function createWorkbenchRealtimeClient(): WorkbenchRealtimeClient {
  let socket: WebSocket | null = null;
  let source: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectTry = 0;
  let retainCount = 0;
  const listeners: ListenerMap = new Map();
  const wiredEvents = new Set<string>();

  const emitEvent = (eventName: string, payload: unknown) => {
    listeners.get(eventName)?.forEach((handler) => {
      try {
        handler(payload);
      } catch (error) {
        reportClientIssue("workbench-realtime", `listener failed for ${eventName}`, { error });
      }
    });
  };

  const ensureEventListener = (eventName: string) => {
    if (!source || wiredEvents.has(eventName)) {
      return;
    }
    source.addEventListener(eventName, (event: MessageEvent<string>) => {
      let payload: unknown = null;
      try {
        payload = event.data ? JSON.parse(event.data) : null;
      } catch {
        payload = event.data;
      }
      emitEvent(eventName, payload);
    });
    wiredEvents.add(eventName);
  };

  const clearReconnectTimer = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const closeSource = () => {
    if (source) {
      source.close();
      source = null;
    }
    wiredEvents.clear();
  };

  const closeSocket = () => {
    if (socket) {
      socket.close();
      socket = null;
    }
  };

  const scheduleReconnect = () => {
    if (retainCount <= 0 || reconnectTimer || typeof window === "undefined") {
      return;
    }
    const delay = Math.min(30000, 1000 * 2 ** reconnectTry);
    reconnectTry += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (typeof window !== "undefined" && "WebSocket" in window) {
        openSocket();
      } else {
        openSource();
      }
    }, delay);
  };

  const openSource = () => {
    if (retainCount <= 0 || typeof window === "undefined" || source) {
      return;
    }

    clearReconnectTimer();
    const nextSource = new EventSource("/api/notifications/stream");
    source = nextSource;

    listeners.forEach((_, eventName) => {
      ensureEventListener(eventName);
    });

    nextSource.addEventListener("connected", (event: MessageEvent<string>) => {
      reconnectTry = 0;
      let payload: unknown = null;
      try {
        payload = event.data ? JSON.parse(event.data) : null;
      } catch {
        payload = event.data;
      }
      emitEvent("connected", payload);
    });

      nextSource.onerror = () => {
        console.warn("[workbench-realtime] event source connection lost");
        closeSource();
        scheduleReconnect();
      };
  };

  const openSocket = () => {
    if (retainCount <= 0 || typeof window === "undefined" || socket) {
      return;
    }
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    socket = ws;

    ws.onopen = () => {
      reconnectTry = 0;
    };

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(String(event.data || "{}"));
        emitEvent(String(parsed.event || "message"), parsed.payload ?? null);
      } catch (error) {
        reportClientIssue("workbench-realtime", "failed to parse websocket message", { error });
      }
    };

    ws.onerror = () => {
      reportClientIssue("workbench-realtime", "websocket connection error");
      closeSocket();
      scheduleReconnect();
    };

    ws.onclose = () => {
      closeSocket();
      scheduleReconnect();
    };
  };

  return {
    retain() {
      retainCount += 1;
      if (typeof window !== "undefined" && "WebSocket" in window) {
        openSocket();
      } else {
        openSource();
      }
    },
    release() {
      retainCount = Math.max(0, retainCount - 1);
      if (retainCount === 0) {
        clearReconnectTimer();
        closeSocket();
        closeSource();
      }
    },
    subscribe(eventName, handler) {
      if (!listeners.has(eventName)) {
        listeners.set(eventName, new Set());
      }
      listeners.get(eventName)?.add(handler);
      ensureEventListener(eventName);
      return () => {
        const eventListeners = listeners.get(eventName);
        if (!eventListeners) {
          return;
        }
        eventListeners.delete(handler);
        if (eventListeners.size === 0) {
          listeners.delete(eventName);
        }
      };
    },
  };
}

export function getWorkbenchRealtimeClient() {
  if (!globalState.client) {
    globalState.client = createWorkbenchRealtimeClient();
  }
  return globalState.client;
}

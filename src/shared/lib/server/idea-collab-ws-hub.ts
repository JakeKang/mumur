import type WebSocket from "ws";
import type { Block } from "@/shared/types";
import { IdeaCollabDoc, decodeCollabUpdate, encodeCollabUpdate, type IdeaCollabSnapshot } from "@/features/ideas/collab/idea-collab-doc";

export type IdeaCollabCheckpointState = {
  title: string;
  blocks: Block[];
  updatedAt: number;
};

export type IdeaCollabSocketClient = {
  socket: WebSocket;
  userId: number;
  teamId: number;
  ideaId: number;
  role?: string;
  canPublish?: boolean;
};

type IdeaRoomKey = `${number}:${number}`;
type IdeaRoomState = {
  doc: IdeaCollabDoc;
  clients: Map<string, IdeaCollabSocketClient>;
  checkpoint: IdeaCollabCheckpointState;
};
type IdeaRoomMap = Map<IdeaRoomKey, IdeaRoomState>;

const globalRef = globalThis as typeof globalThis & {
  __mumurIdeaCollabWsClients?: IdeaRoomMap;
};

if (!globalRef.__mumurIdeaCollabWsClients) {
  globalRef.__mumurIdeaCollabWsClients = new Map();
}

const roomClients = globalRef.__mumurIdeaCollabWsClients;

const COLLAB_ROLE_LEVEL: Record<string, number> = {
  viewer: 0,
  editor: 1,
  member: 1,
  deleter: 2,
  admin: 3,
  owner: 3,
};

function normalizeBlocks(blocks: Array<Partial<Block>> | undefined) {
  return Array.isArray(blocks)
    ? blocks.map((block) => ({
        id: String(block?.id || ""),
        type: String(block?.type || "paragraph"),
        content: String(block?.content || ""),
        checked: Boolean(block?.checked),
      }))
    : [];
}

function normalizeCheckpoint(snapshot: Partial<IdeaCollabCheckpointState> = {}): IdeaCollabCheckpointState {
  return {
    title: String(snapshot.title || ""),
    blocks: normalizeBlocks(snapshot.blocks),
    updatedAt: Number(snapshot.updatedAt || 0),
  };
}

function cloneCheckpoint(snapshot: IdeaCollabCheckpointState): IdeaCollabCheckpointState {
  return normalizeCheckpoint(snapshot);
}

function roomKey(teamId: number, ideaId: number): IdeaRoomKey {
  return `${teamId}:${ideaId}`;
}

function ideaRoomSet(teamId: number, ideaId: number) {
  const key = roomKey(teamId, ideaId);
  if (!roomClients.has(key)) {
    const checkpoint = normalizeCheckpoint();
    roomClients.set(key, {
      doc: IdeaCollabDoc.fromSnapshot(checkpoint),
      clients: new Map(),
      checkpoint,
    });
  }
  return roomClients.get(key)!;
}

export function canPublishIdeaCollab(role: string | null | undefined) {
  return (COLLAB_ROLE_LEVEL[String(role || "")] ?? -1) >= COLLAB_ROLE_LEVEL.editor;
}

export function ensureIdeaCollabRoom(teamId: number, ideaId: number, snapshot: Partial<IdeaCollabCheckpointState> & IdeaCollabSnapshot) {
  const room = ideaRoomSet(teamId, ideaId);
  const checkpoint = normalizeCheckpoint(snapshot);
  if (!room.clients.size) {
    room.doc = IdeaCollabDoc.fromSnapshot(checkpoint);
    room.checkpoint = checkpoint;
    return room;
  }
  if (checkpoint.updatedAt > room.checkpoint.updatedAt) {
    room.checkpoint = checkpoint;
  }
  return room;
}

export function getIdeaCollabRoomState(teamId: number, ideaId: number) {
  return ideaRoomSet(teamId, ideaId);
}

export function getIdeaCollabCheckpointState(teamId: number, ideaId: number) {
  return cloneCheckpoint(ideaRoomSet(teamId, ideaId).checkpoint);
}

export function syncIdeaCollabCheckpointState(teamId: number, ideaId: number, checkpoint: Partial<IdeaCollabCheckpointState> & IdeaCollabSnapshot) {
  const room = ideaRoomSet(teamId, ideaId);
  room.checkpoint = normalizeCheckpoint(checkpoint);
  return cloneCheckpoint(room.checkpoint);
}

export function registerIdeaCollabSocketClient(teamId: number, ideaId: number, clientId: string, client: IdeaCollabSocketClient) {
  ideaRoomSet(teamId, ideaId).clients.set(clientId, client);
}

export function unregisterIdeaCollabSocketClient(teamId: number, ideaId: number, clientId: string) {
  const key = roomKey(teamId, ideaId);
  const room = roomClients.get(key);
  if (!room) {
    return;
  }
  room.clients.delete(clientId);
  if (!room.clients.size) {
    roomClients.delete(key);
  }
}

export function applyIdeaCollabUpdate(teamId: number, ideaId: number, encodedUpdate: string) {
  const room = ideaRoomSet(teamId, ideaId);
  room.doc.applyUpdate(decodeCollabUpdate(encodedUpdate), "remote");
  return {
    snapshot: room.doc.getSnapshot(),
    checkpoint: cloneCheckpoint(room.checkpoint),
  };
}

export function ideaCollabBootstrapPayload(teamId: number, ideaId: number) {
  const room = ideaRoomSet(teamId, ideaId);
  return {
    update: encodeCollabUpdate(room.doc.encodeState()),
    snapshot: room.doc.getSnapshot(),
    checkpoint: cloneCheckpoint(room.checkpoint),
  };
}

export function broadcastIdeaCollabSocketEvent(
  teamId: number,
  ideaId: number,
  eventName: string,
  payload: unknown,
  shouldSend?: (client: IdeaCollabSocketClient, clientId: string) => boolean
) {
  const room = roomClients.get(roomKey(teamId, ideaId));
  const clients = room?.clients;
  if (!clients || !clients.size) {
    return;
  }

  const message = JSON.stringify({ event: eventName, payload });
  clients.forEach((client, clientId) => {
    if (shouldSend && !shouldSend(client, clientId)) {
      return;
    }
    if (client.socket.readyState !== client.socket.OPEN) {
      unregisterIdeaCollabSocketClient(teamId, ideaId, clientId);
      return;
    }
    try {
      client.socket.send(message);
    } catch (error) {
      console.warn(`[idea-collab-ws-hub] failed to send ${eventName} to client ${clientId}`, error);
      unregisterIdeaCollabSocketClient(teamId, ideaId, clientId);
    }
  });
}

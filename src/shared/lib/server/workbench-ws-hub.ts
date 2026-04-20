import type WebSocket from "ws";

import { reportServerIssue } from "../observability";

export type WorkbenchSocketClient = {
  socket: WebSocket;
  userId: number;
};

type SocketTeamMap = Map<number, Map<string, WorkbenchSocketClient>>;

const globalRef = globalThis as typeof globalThis & {
  __mumurWsClients?: SocketTeamMap;
};

if (!globalRef.__mumurWsClients) {
  globalRef.__mumurWsClients = new Map();
}

const socketClients = globalRef.__mumurWsClients;

function teamSocketSet(teamId: number) {
  if (!socketClients.has(teamId)) {
    socketClients.set(teamId, new Map());
  }
  return socketClients.get(teamId)!;
}

export function registerWorkbenchSocketClient(teamId: number, clientId: string, client: WorkbenchSocketClient) {
  teamSocketSet(teamId).set(clientId, client);
}

export function unregisterWorkbenchSocketClient(teamId: number, clientId: string) {
  const teamClients = socketClients.get(teamId);
  if (!teamClients) {
    return;
  }
  teamClients.delete(clientId);
  if (!teamClients.size) {
    socketClients.delete(teamId);
  }
}

export function broadcastWorkbenchSocketEvent(
  teamId: number,
  eventName: string,
  payload: unknown,
  shouldSend?: (client: WorkbenchSocketClient) => boolean
) {
  const teamClients = socketClients.get(teamId);
  if (!teamClients || !teamClients.size) {
    return;
  }

  const message = JSON.stringify({ event: eventName, payload });
  teamClients.forEach((client, clientId) => {
    if (shouldSend && !shouldSend(client)) {
      return;
    }
    if (client.socket.readyState !== client.socket.OPEN) {
      unregisterWorkbenchSocketClient(teamId, clientId);
      return;
    }
    try {
      client.socket.send(message);
    } catch (error) {
      reportServerIssue("workbench-ws-hub", `failed to send ${eventName} to client ${clientId}`, {
        teamId,
        clientId,
        eventName,
        error
      });
      unregisterWorkbenchSocketClient(teamId, clientId);
    }
  });
}

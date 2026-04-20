import './src/shared/lib/server/install-async-local-storage';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import next from 'next';
import { WebSocketServer } from 'ws';
import type { IncomingMessage } from 'node:http';
import { parse as parseUrl } from 'node:url';
import {
  assertSessionSecretConfigured,
} from './src/shared/lib/server/auth';
import { authContext } from './src/shared/lib/server/api-session';
import {
  getDatabaseClient,
  getQueryAdapter,
} from './src/shared/lib/server/database-client';
import {
  registerWorkbenchSocketClient,
  unregisterWorkbenchSocketClient,
} from './src/shared/lib/server/workbench-ws-hub';
import {
  applyIdeaCollabUpdate,
  broadcastIdeaCollabSocketEvent,
  canPublishIdeaCollab,
  ensureIdeaCollabRoom,
  ideaCollabBootstrapPayload,
  registerIdeaCollabSocketClient,
  unregisterIdeaCollabSocketClient,
} from './src/shared/lib/server/idea-collab-ws-hub';

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = Number(process.env.PORT || 3100);

assertSessionSecretConfigured();

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();
const queryAdapter = getQueryAdapter();
const db = getDatabaseClient();
const uploadsDir = path.join(process.cwd(), 'public', 'uploads');

function contentTypeForUpload(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.heic':
      return 'image/heic';
    case '.mp4':
      return 'video/mp4';
    case '.mov':
      return 'video/quicktime';
    case '.webm':
      return 'video/webm';
    case '.txt':
      return 'text/plain; charset=utf-8';
    case '.pdf':
      return 'application/pdf';
    default:
      return 'application/octet-stream';
  }
}

function resolveSocketAuth(req: IncomingMessage) {
  const headers = new Headers();
  Object.entries(req.headers).forEach(([name, value]) => {
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        headers.append(name, entry);
      });
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  });

  return authContext(db, queryAdapter, {
    headers,
    url: `http://${req.headers.host || `${hostname}:${port}`}${req.url || '/'}`,
  } as Request);
}

function sendSocketEvent(
  socket: { send: (data: string) => void },
  eventName: string,
  payload: unknown,
) {
  socket.send(
    JSON.stringify({
      event: eventName,
      payload,
    }),
  );
}

function sendIdeaCollabError(
  socket: { send: (data: string) => void },
  ideaId: number,
  code: string,
  message: string,
) {
  sendSocketEvent(socket, 'collab.error', {
    ok: false,
    ideaId,
    code,
    message,
  });
}

function isIdeaCollabUpdateEnvelope(payload: unknown): payload is {
  event: 'collab.update';
  payload: { update: string };
} {
  return Boolean(
    payload
      && typeof payload === 'object'
      && (payload as { event?: unknown }).event === 'collab.update'
      && typeof (payload as { payload?: { update?: unknown } }).payload?.update === 'string'
      && (payload as { payload?: { update?: string } }).payload?.update,
  );
}

function resolveIdeaRoom(req: IncomingMessage, teamId: number, userId: number) {
  const { pathname } = parseUrl(req.url || '/', true);
  const match = pathname?.match(/^\/ws\/ideas\/(\d+)$/);
  if (!match) {
    return null;
  }

  const ideaId = Number(match[1]);
  if (!Number.isInteger(ideaId) || ideaId <= 0) {
    return { error: 'invalid-idea-id' as const };
  }

  const membership = db
    .prepare('SELECT role FROM workspace_members WHERE team_id = ? AND user_id = ?')
    .get(teamId, userId) as { role: string } | undefined;
  if (!membership) {
    return { error: 'forbidden' as const };
  }

  const idea = db
    .prepare('SELECT id, team_id, title, blocks_json, updated_at FROM ideas WHERE id = ? AND team_id = ?')
    .get(ideaId, teamId) as { id: number; team_id: number; title: string; blocks_json: string | null; updated_at: number } | undefined;
  if (!idea) {
    return { error: 'not-found' as const };
  }

  const blocks = (() => {
    try {
      const parsed = JSON.parse(idea.blocks_json || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();

  return {
    ideaId: idea.id,
    teamId: idea.team_id,
    title: idea.title,
    blocks,
    checkpointUpdatedAt: Number(idea.updated_at || 0),
    role: membership.role,
    canPublish: canPublishIdeaCollab(membership.role),
  };
}

void app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parseUrl(req.url || '/', true);

    if (parsedUrl.pathname?.startsWith('/uploads/')) {
      const relativePath = decodeURIComponent(
        parsedUrl.pathname.replace(/^\/uploads\//, ''),
      );
      const safeName = path.basename(relativePath);
      const absolutePath = path.join(uploadsDir, safeName);
      if (!existsSync(absolutePath)) {
        res.statusCode = 404;
        res.end('Not Found');
        return;
      }

      const stats = statSync(absolutePath);
      res.statusCode = 200;
      res.setHeader('Content-Type', contentTypeForUpload(absolutePath));
      res.setHeader('Content-Length', String(stats.size));
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      createReadStream(absolutePath).pipe(res);
      return;
    }

    void handle(req, res, parsedUrl);
  });

  const wss = new WebSocketServer({ noServer: true });
  const nextUpgradeHandler = (
    app as unknown as {
      getUpgradeHandler?: () => (
        req: IncomingMessage,
        socket: any,
        head: Buffer,
      ) => void;
    }
  ).getUpgradeHandler?.();

  server.on('upgrade', (req, socket, head) => {
    const { pathname } = parseUrl(req.url || '/', true);

    const isWorkbenchSocket = pathname === '/ws';
    const isIdeaRoomSocket = /^\/ws\/ideas\/\d+$/.test(pathname || '');

    if (!isWorkbenchSocket && !isIdeaRoomSocket) {
      if (nextUpgradeHandler) {
        nextUpgradeHandler(req, socket, head);
        return;
      }
      socket.destroy();
      return;
    }

    const auth = resolveSocketAuth(req);
    if (!auth) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    if (isIdeaRoomSocket) {
      const room = resolveIdeaRoom(req, auth.session.teamId, auth.user.id);
      if (!room || 'error' in room) {
        const status = room?.error === 'not-found' ? '404 Not Found' : room?.error === 'invalid-idea-id' ? '400 Bad Request' : '403 Forbidden';
        socket.write(`HTTP/1.1 ${status}\r\n\r\n`);
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        const clientId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
        ensureIdeaCollabRoom(room.teamId, room.ideaId, {
          title: room.title,
          blocks: room.blocks,
          updatedAt: room.checkpointUpdatedAt,
        });
        registerIdeaCollabSocketClient(room.teamId, room.ideaId, clientId, {
          socket: ws,
          userId: auth.user.id,
          teamId: room.teamId,
          ideaId: room.ideaId,
          role: room.role,
          canPublish: room.canPublish,
        });

        sendSocketEvent(ws, 'collab.connected', {
          ok: true,
          teamId: room.teamId,
          ideaId: room.ideaId,
          title: room.title,
          user: { userId: auth.user.id, name: auth.user.name },
          permissions: {
            role: room.role,
            canPublish: room.canPublish,
          },
        });

        sendSocketEvent(ws, 'collab.bootstrap', ideaCollabBootstrapPayload(room.teamId, room.ideaId));

        ws.on('message', (raw) => {
          try {
            const parsed = JSON.parse(String(raw || '{}'));
            if (!isIdeaCollabUpdateEnvelope(parsed)) {
              return;
            }

            if (!room.canPublish) {
              sendIdeaCollabError(ws, room.ideaId, 'forbidden', '편집 권한이 없습니다');
              return;
            }

            const liveState = applyIdeaCollabUpdate(room.teamId, room.ideaId, parsed.payload.update);
            broadcastIdeaCollabSocketEvent(
              room.teamId,
              room.ideaId,
              'collab.update',
              {
                update: parsed.payload.update,
                actorUserId: auth.user.id,
                snapshot: liveState.snapshot,
                checkpoint: liveState.checkpoint,
              },
              (_client, targetClientId) => targetClientId !== clientId,
            );
          } catch {
            sendIdeaCollabError(ws, room.ideaId, 'invalid-update', '유효한 협업 업데이트가 필요합니다');
          }
        });

        ws.on('close', () => {
          unregisterIdeaCollabSocketClient(room.teamId, room.ideaId, clientId);
        });

        ws.on('error', () => {
          unregisterIdeaCollabSocketClient(room.teamId, room.ideaId, clientId);
        });
      });
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      const clientId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
      registerWorkbenchSocketClient(auth.session.teamId, clientId, {
        socket: ws,
        userId: auth.user.id,
      });

      sendSocketEvent(ws, 'connected', {
        ok: true,
        teamId: auth.session.teamId,
        user: { userId: auth.user.id, name: auth.user.name },
      });

      ws.on('close', () => {
        unregisterWorkbenchSocketClient(auth.session.teamId, clientId);
      });

      ws.on('error', () => {
        unregisterWorkbenchSocketClient(auth.session.teamId, clientId);
      });
    });
  });

  server.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});

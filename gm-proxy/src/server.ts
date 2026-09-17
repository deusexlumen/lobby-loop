/*
 * PURPOSE: Zero-Dep-HTTP-Server (node:http) für /gm/action, /gm/result, /minigame/round, /minigame/judge, /run/epitaph
 * ARCHITECTURE: gm-proxy/transport
 * DEPENDENCIES: node:http, node:path, node:url, ./chronicle.js, ./errors.js, ./gemini.js, ./llm-handlers.js, ./types.js, ./validate.js
 * PIPELINE: runtime, test
 * LAST_VALIDATED: 2026-09-17
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createFileChronicleStore } from './chronicle.js';
import { GmUnavailableError, HttpError } from './errors.js';
import { createGeminiLlmCaller } from './gemini.js';
import { createGmHandlers } from './llm-handlers.js';
import type { GmHandlers } from './types.js';
import {
  validateActionRequest,
  validateEpitaphRequest,
  validateMinigameJudgeRequest,
  validateMinigameRoundRequest,
  validateResultRequest,
} from './validate.js';

const DEFAULT_PORT = 8787;
const MAX_BODY_BYTES = 1_000_000;

type RouteHandler = (body: unknown) => Promise<unknown>;

const readJsonBody = async (req: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(400, 'Request-Body zu groß.');
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (raw.length === 0) throw new HttpError(400, 'Request-Body fehlt.');
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'Request-Body ist kein gültiges JSON.');
  }
};

const sendJson = (res: ServerResponse, status: number, payload: unknown): void => {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
};

/**
 * Server-Factory mit injizierbaren Handlern (Tests: Mock; Produktion: LLM).
 * Fehler-Mapping: HttpError → Status, GmUnavailableError → 503 {fallback: true},
 * sonst 500.
 */
export function createGmServer(handlers: GmHandlers, log: (msg: string) => void = () => undefined): Server {
  const routes: Record<string, RouteHandler> = {
    '/gm/action': async (body) => {
      const req = validateActionRequest(body);
      if (req === null) throw new HttpError(400, 'Ungültiger /gm/action-Request.');
      return handlers.action(req);
    },
    '/gm/result': async (body) => {
      const req = validateResultRequest(body);
      if (req === null) throw new HttpError(400, 'Ungültiger /gm/result-Request.');
      return handlers.result(req);
    },
    '/minigame/round': async (body) => {
      const req = validateMinigameRoundRequest(body);
      if (req === null) throw new HttpError(400, 'Ungültiger /minigame/round-Request.');
      return handlers.minigameRound(req);
    },
    '/minigame/judge': async (body) => {
      const req = validateMinigameJudgeRequest(body);
      if (req === null) throw new HttpError(400, 'Ungültiger /minigame/judge-Request.');
      return handlers.minigameJudge(req);
    },
    '/run/epitaph': async (body) => {
      const req = validateEpitaphRequest(body);
      if (req === null) throw new HttpError(400, 'Ungültiger /run/epitaph-Request.');
      return handlers.epitaph(req);
    },
  };
  return createServer(async (req, res) => {
    const method = req.method ?? 'GET';
    const path = (req.url ?? '/').split('?')[0];

    if (method === 'GET' && path === '/health') {
      sendJson(res, 200, { ok: true });
      return;
    }

    const handler = routes[path];
    if (handler === undefined || method !== 'POST') {
      sendJson(res, 404, { error: `Route nicht gefunden: ${method} ${path}` });
      return;
    }

    try {
      const body = await readJsonBody(req);
      const payload = await handler(body);
      sendJson(res, 200, payload);
    } catch (err) {
      if (err instanceof HttpError) {
        sendJson(res, err.status, { error: err.message });
      } else if (err instanceof GmUnavailableError) {
        log(`[gm-proxy] LLM unverfügbar: ${err.message}`);
        sendJson(res, 503, { error: err.message, fallback: true });
      } else {
        log(`[gm-proxy] interner Fehler: ${err instanceof Error ? err.stack : String(err)}`);
        sendJson(res, 500, { error: 'Interner Server-Fehler.' });
      }
    }
  });
}

const isMainModule = (): boolean => {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(resolve(entry)).href;
  } catch {
    return false;
  }
};

if (isMainModule()) {
  try {
    process.loadEnvFile();
  } catch {
    // .env ist optional — echte Env-Variablen gelten trotzdem.
  }
  const port = Number(process.env.GM_PROXY_PORT ?? DEFAULT_PORT);
  const chronicleDir = resolve(process.env.GM_CHRONICLE_DIR ?? 'gm-proxy/data/chronicles');
  const server = createGmServer(
    createGmHandlers(createGeminiLlmCaller(), createFileChronicleStore(chronicleDir, console.warn)),
    console.warn,
  );
  server.listen(port, () => {
    console.log(`[gm-proxy] LOBBY-LOOP GM-Proxy lauscht auf http://localhost:${port}`);
  });
}

/*
 * PURPOSE: HTTP-Integrationstests: 4 Endpoints Happy Path, 400/404, 503 bei LLM-Ausfall
 * ARCHITECTURE: gm-proxy/tests
 * DEPENDENCIES: node:http, node:test, node:assert/strict, ../src/errors.js, ../src/server.js, ../src/types.js
 * PIPELINE: test
 * LAST_VALIDATED: 2026-09-17
 */
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import test from 'node:test';
import { GmUnavailableError } from '../src/errors.js';
import { createGmServer } from '../src/server.js';
import type { GmHandlers } from '../src/types.js';

const ACTION_RESPONSE = {
  gm_dialogue: 'Der Aktenkoffer rattert.',
  required_roll: 'W20',
  difficulty_class: 12,
  trigger_event: null,
};

const mockHandlers = (overrides: Partial<GmHandlers> = {}): GmHandlers => ({
  action: async () => ACTION_RESPONSE,
  result: async () => ({ ...ACTION_RESPONSE, gm_dialogue: 'Ergebnis erzählt.' }),
  minigameRound: async () => ({
    accusation: 'Sie haben unterschrieben!',
    phrases: ['eins', 'zwei', 'drei'],
  }),
  minigameJudge: async () => ({ correct: true, correct_index: 0, commentary: 'Unangreifbar.' }),
  epitaph: async () => ({
    epitaph: 'Mandat erloschen. Die Akte ist zu.',
    highlights: ['eins', 'zwei', 'drei'],
  }),
  ...overrides,
});

interface Fixture {
  server: Server;
  baseUrl: string;
}

async function startServer(handlers: GmHandlers): Promise<Fixture> {
  const server = createGmServer(handlers);
  await new Promise<void>((resolveListen) => server.listen(0, resolveListen));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Server meldet keine TCP-Adresse.');
  }
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

const post = async (baseUrl: string, path: string, body: unknown): Promise<Response> =>
  fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

test('POST /gm/action — Happy Path', async () => {
  const { server, baseUrl } = await startServer(mockHandlers());
  try {
    const res = await post(baseUrl, '/gm/action', {
      player_inventory: ['unschuldsvermutung', 'schwarzer_koffer'],
      current_scene: 'untersuchungsausschuss',
      alignment_score: -4,
      fraktionsdisziplin: 5,
      player_input: 'Ich biete dem Vorsitzenden einen Aufsichtsratsposten an.',
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /application\/json/);
    const payload = (await res.json()) as Record<string, unknown>;
    assert.equal(payload.difficulty_class, 12);
    assert.equal(payload.trigger_event, null);
  } finally {
    server.close();
  }
});

test('POST /gm/result — Happy Path mit Roll', async () => {
  const { server, baseUrl } = await startServer(mockHandlers());
  try {
    const res = await post(baseUrl, '/gm/result', {
      player_inventory: [],
      current_scene: 'untersuchungsausschuss',
      alignment_score: -4,
      player_input: 'Aufsichtsratsposten anbieten.',
      roll: {
        dice: 'W20',
        value: 13,
        bonuses: [{ source: 'berufspolitischer_bonus', value: 3 }],
        total: 16,
        difficulty_class: 12,
        success: true,
      },
    });
    assert.equal(res.status, 200);
    const payload = (await res.json()) as Record<string, unknown>;
    assert.equal(payload.gm_dialogue, 'Ergebnis erzählt.');
  } finally {
    server.close();
  }
});

test('POST /minigame/round — Happy Path', async () => {
  const { server, baseUrl } = await startServer(mockHandlers());
  try {
    const res = await post(baseUrl, '/minigame/round', {
      current_scene: 'untersuchungsausschuss',
      alignment_score: -4,
      round: 1,
      won_rounds: 0,
      lost_rounds: 0,
    });
    assert.equal(res.status, 200);
    const payload = (await res.json()) as { accusation: string; phrases: string[] };
    assert.equal(payload.phrases.length, 3);
  } finally {
    server.close();
  }
});

test('POST /minigame/judge — Happy Path', async () => {
  const { server, baseUrl } = await startServer(mockHandlers());
  try {
    const res = await post(baseUrl, '/minigame/judge', {
      accusation: 'Sie haben unterschrieben!',
      chosen_index: 0,
      phrase: 'eins',
    });
    assert.equal(res.status, 200);
    const payload = (await res.json()) as { correct: boolean; correct_index: number };
    assert.equal(payload.correct, true);
    assert.equal(payload.correct_index, 0);
  } finally {
    server.close();
  }
});

test('GET /health antwortet 200', async () => {
  const { server, baseUrl } = await startServer(mockHandlers());
  try {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
  } finally {
    server.close();
  }
});

test('unbekannte Route → 404', async () => {
  const { server, baseUrl } = await startServer(mockHandlers());
  try {
    const res = await post(baseUrl, '/gm/undefined', {});
    assert.equal(res.status, 404);
    const payload = (await res.json()) as { error: string };
    assert.match(payload.error, /nicht gefunden/);
  } finally {
    server.close();
  }
});

test('GET auf POST-Route → 404', async () => {
  const { server, baseUrl } = await startServer(mockHandlers());
  try {
    const res = await fetch(`${baseUrl}/gm/action`);
    assert.equal(res.status, 404);
  } finally {
    server.close();
  }
});

test('ungültiger Request-Body → 400', async () => {
  const { server, baseUrl } = await startServer(mockHandlers());
  try {
    const res = await post(baseUrl, '/gm/action', { player_input: '' });
    assert.equal(res.status, 400);
    const payload = (await res.json()) as { error: string };
    assert.match(payload.error, /Ungültiger/);
  } finally {
    server.close();
  }
});

test('kaputter JSON-Body → 400', async () => {
  const { server, baseUrl } = await startServer(mockHandlers());
  try {
    const res = await fetch(`${baseUrl}/gm/action`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"player_input": ',
    });
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});

test('LLM-Ausfall → 503 mit fallback-Flag', async () => {
  const { server, baseUrl } = await startServer(
    mockHandlers({
      action: async () => {
        throw new GmUnavailableError('LLM-Antwort nach 2 Versuchen ungültig.');
      },
    }),
  );
  try {
    const res = await post(baseUrl, '/gm/action', {
      player_inventory: [],
      current_scene: 'kommunalpolitik',
      alignment_score: 0,
      player_input: 'Test.',
    });
    assert.equal(res.status, 503);
    const payload = (await res.json()) as { error: string; fallback: boolean };
    assert.equal(payload.fallback, true);
    assert.match(payload.error, /ungültig/);
  } finally {
    server.close();
  }
});

const VALID_EPITAPH_BODY = {
  session_id: 'savegame_1',
  stats: {
    rolls: [{ dice: 'W20', value: 3, total: 3, difficulty_class: 14, success: false }],
    items_burned: ['schwarzer_koffer'],
    minigame: { won: 1, lost: 3 },
    alignment_timeline: [0, -4, -9],
    started_at: '2026-09-17T10:00:00.000Z',
  },
};

test('POST /run/epitaph — Happy Path mit Karriere-Akte', async () => {
  const { server, baseUrl } = await startServer(mockHandlers());
  try {
    const res = await post(baseUrl, '/run/epitaph', VALID_EPITAPH_BODY);
    assert.equal(res.status, 200);
    const payload = (await res.json()) as { epitaph: string; highlights: string[] };
    assert.match(payload.epitaph, /Akte/);
    assert.equal(payload.highlights.length, 3);
  } finally {
    server.close();
  }
});

test('POST /run/epitaph — ungültige Stats → 400', async () => {
  const { server, baseUrl } = await startServer(mockHandlers());
  try {
    const res = await post(baseUrl, '/run/epitaph', { stats: { rolls: 'kaputt' } });
    assert.equal(res.status, 400);
    const payload = (await res.json()) as { error: string };
    assert.match(payload.error, /epitaph/);
  } finally {
    server.close();
  }
});

test('POST /run/epitaph — LLM-Ausfall → 503 mit fallback-Flag', async () => {
  const { server, baseUrl } = await startServer(
    mockHandlers({
      epitaph: async () => {
        throw new GmUnavailableError('LLM-Antwort nach 2 Versuchen ungültig.');
      },
    }),
  );
  try {
    const res = await post(baseUrl, '/run/epitaph', VALID_EPITAPH_BODY);
    assert.equal(res.status, 503);
    const payload = (await res.json()) as { fallback: boolean };
    assert.equal(payload.fallback, true);
  } finally {
    server.close();
  }
});

test('POST /gm/action toleriert optionale session_id', async () => {
  const { server, baseUrl } = await startServer(mockHandlers());
  try {
    const res = await post(baseUrl, '/gm/action', {
      player_inventory: [],
      current_scene: 'kommunalpolitik',
      alignment_score: 0,
      player_input: 'Test.',
      session_id: 'savegame_1',
    });
    assert.equal(res.status, 200);
  } finally {
    server.close();
  }
});

test('POST /gm/action lehnt ungültige session_id ab', async () => {
  const { server, baseUrl } = await startServer(mockHandlers());
  try {
    const res = await post(baseUrl, '/gm/action', {
      player_inventory: [],
      current_scene: 'kommunalpolitik',
      alignment_score: 0,
      player_input: 'Test.',
      session_id: '',
    });
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});

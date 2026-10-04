import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TOKEN_BUDGETS,
  createLLMOrchestrator,
  nextRetryBudget,
  type ExecutorRequest,
} from '../src/orchestrator.js';
import { ContentRejectedError } from '../src/errors.js';
import type { FetchFn } from '../src/provider-chain.js';
import { PT_NOON, makeClock } from './helpers.js';

interface FakeClient { key: string }

function fakeFetch(handler: (url: string) => { ok: boolean; text?: string }): FetchFn {
  return (async (input: unknown) => {
    const res = handler(String(input));
    // A real Response so res.body.getReader() exists and the SSE parser runs.
    return new Response(res.text ?? null, { status: res.ok ? 200 : 503 });
  }) as unknown as FetchFn;
}

const sse = (content: string): string =>
  `data: {"choices":[{"delta":{"content":"${content}"}}]}\ndata: [DONE]\n`;

test('provider chain hit: the key-pool router is never touched', async () => {
  const clock = makeClock(PT_NOON);
  let execCalls = 0;
  let clientsCreated = 0;
  const orch = createLLMOrchestrator<FakeClient>({
    providers: [{ name: 'local', url: 'http://ok', apiKey: 'k', model: 'm' }],
    apiKeys: ['gkey1'],
    getModelChainConfig: () => ({ primary: 'gm1', fallbacks: ['gm2'] }),
    createClient: (key) => { clientsCreated += 1; return { key }; },
    exec: () => { execCalls += 1; return Promise.resolve({ text: 'gemini', finishReason: 'STOP' }); },
    fetch: fakeFetch((url) =>
      url.endsWith('/v1/models') ? { ok: true } : { ok: true, text: sse('from-chain') }),
    routerOptions: { now: clock.now, sleep: clock.sleep },
  });

  const res = await orch.callLLMWithMeta('prompt');
  assert.equal(res.text, 'from-chain');
  assert.equal(res.provider, 'local');
  assert.equal(execCalls, 0);
  assert.equal(clientsCreated, 0);
});

test('provider chain null: falls back to the key-pool router; clients are cached per key', async () => {
  const clock = makeClock(PT_NOON);
  const created: string[] = [];
  const requests: ExecutorRequest[] = [];
  const usedKeys: string[] = [];
  const orch = createLLMOrchestrator<FakeClient>({
    providers: [{ name: 'down', url: 'http://down', apiKey: 'k', model: 'm' }],
    apiKeys: ['k1', 'k2'],
    getModelChainConfig: () => ({ primary: 'gm1' }),
    createClient: (key) => { created.push(key); return { key }; },
    exec: (client, req) => {
      usedKeys.push(client.key);
      requests.push(req);
      return Promise.resolve({ text: 'ok', finishReason: 'STOP' });
    },
    fetch: fakeFetch(() => ({ ok: false })),
    routerOptions: { now: clock.now, sleep: clock.sleep },
  });

  const r1 = await orch.callLLMWithMeta('a');
  await orch.callLLMWithMeta('b'); // round-robin → k2, new client
  await orch.callLLMWithMeta('c'); // back to k1 — cached client

  assert.equal(r1.provider, 'key-pool:gm1');
  assert.deepEqual(created, ['k1', 'k2']); // exactly one client per key
  assert.deepEqual(usedKeys, ['k1', 'k2', 'k1']);
  assert.deepEqual(requests.map((r) => r.model), ['gm1', 'gm1', 'gm1']);
});

test('no provider chain configured: goes straight to the router', async () => {
  const clock = makeClock(PT_NOON);
  const usedKeys: string[] = [];
  const orch = createLLMOrchestrator<FakeClient>({
    apiKeys: ['k1'],
    getModelChainConfig: () => ({ primary: 'gm1' }),
    createClient: (key) => ({ key }),
    exec: (client) => {
      usedKeys.push(client.key);
      return Promise.resolve({ text: 'direct', finishReason: 'STOP' });
    },
    routerOptions: { now: clock.now, sleep: clock.sleep },
  });
  assert.equal(orch.hasProviderChainConfigured(), false);
  const text = await orch.callLLM('p');
  assert.equal(text, 'direct');
  assert.deepEqual(usedKeys, ['k1']);
});

test('no keys and no reachable provider: throws a clear error', async () => {
  const clock = makeClock(PT_NOON);
  const orch = createLLMOrchestrator<FakeClient>({
    apiKeys: [null, undefined, ''],
    getModelChainConfig: () => ({ primary: 'gm1' }),
    createClient: (key) => ({ key }),
    exec: () => Promise.resolve({ text: 'x' }),
    routerOptions: { now: clock.now, sleep: clock.sleep },
  });
  await assert.rejects(orch.callLLM('p'), /No API key configured/);
});

test('MAX_TOKENS: exactly one retry with a doubled budget', async () => {
  const clock = makeClock(PT_NOON);
  const budgets: number[] = [];
  let calls = 0;
  const orch = createLLMOrchestrator<FakeClient>({
    apiKeys: ['k1'],
    getModelChainConfig: () => ({ primary: 'gm1' }),
    createClient: (key) => ({ key }),
    exec: (_client, req) => {
      budgets.push(req.maxTokens);
      calls += 1;
      return Promise.resolve(
        calls === 1
          ? { text: '', finishReason: 'MAX_TOKENS' }
          : { text: 'full answer', finishReason: 'STOP' },
      );
    },
    routerOptions: { now: clock.now, sleep: clock.sleep },
  });

  const res = await orch.callLLMWithMeta('p', { maxTokens: 512 });
  assert.deepEqual(budgets, [512, 1024]); // doubled, structured floor
  assert.equal(calls, 2); // exactly one retry
  assert.equal(res.retried, true);
  assert.equal(res.text, 'full answer');
});

test('MAX_TOKENS twice in a row: no third attempt', async () => {
  const clock = makeClock(PT_NOON);
  let calls = 0;
  const orch = createLLMOrchestrator<FakeClient>({
    apiKeys: ['k1'],
    getModelChainConfig: () => ({ primary: 'gm1' }),
    createClient: (key) => ({ key }),
    exec: () => {
      calls += 1;
      return Promise.resolve({ text: 'still truncated', finishReason: 'MAX_TOKENS' });
    },
    routerOptions: { now: clock.now, sleep: clock.sleep },
  });
  const res = await orch.callLLMWithMeta('p', { maxTokens: 2048 });
  assert.equal(calls, 2);
  assert.equal(res.text, 'still truncated');
});

test('nextRetryBudget: doubles with structured floor and retryCap ceiling', () => {
  assert.equal(nextRetryBudget(512), 1024);
  assert.equal(nextRetryBudget(2048), 4096);
  assert.equal(nextRetryBudget(4096), 4096);
  assert.deepEqual(TOKEN_BUDGETS, { micro: 512, structured: 1024, chat: 2048, retryCap: 4096 });
});

test('system and schema reach the executor request untouched', async () => {
  const clock = makeClock(PT_NOON);
  const requests: ExecutorRequest[] = [];
  const schema = { type: 'object', properties: { ok: { type: 'boolean' } } };
  const orch = createLLMOrchestrator<FakeClient>({
    apiKeys: ['k1'],
    getModelChainConfig: () => ({ primary: 'gm1' }),
    createClient: (key) => ({ key }),
    exec: (_c, req) => { requests.push(req); return Promise.resolve({ text: '{"ok":true}', finishReason: 'STOP' }); },
    routerOptions: { now: clock.now, sleep: clock.sleep },
  });

  await orch.callLLM('the task', { system: 'be terse', schema });
  assert.equal(requests[0].system, 'be terse');
  assert.deepEqual(requests[0].schema, schema);

  // Omitted, not undefined-valued: an executor spreading the request into an
  // SDK config must not send empty keys for options the caller never set.
  await orch.callLLM('the task');
  assert.ok(!('system' in requests[1]));
  assert.ok(!('schema' in requests[1]));
});

test('a rejected answer costs the candidate, not the pair: next model, nothing locked', async () => {
  const clock = makeClock(PT_NOON);
  const seen: string[] = [];
  const orch = createLLMOrchestrator<FakeClient>({
    apiKeys: ['k1'],
    getModelChainConfig: () => ({ primary: 'gm1', fallbacks: ['gm2'] }),
    createClient: (key) => ({ key }),
    exec: (_c, req) => {
      seen.push(req.model);
      return Promise.resolve({ text: req.model === 'gm1' ? 'not json' : '{"ok":true}', finishReason: 'STOP' });
    },
    routerOptions: { now: clock.now, sleep: clock.sleep },
  });

  const res = await orch.callLLMWithMeta('p', { model: 'gm1', validate: (t) => t.startsWith('{') });
  assert.equal(res.text, '{"ok":true}');
  assert.equal(res.provider, 'key-pool:gm2');
  assert.deepEqual(seen, ['gm1', 'gm2']);
  // No cooldown was booked, so gm1 is a candidate again right away.
  assert.deepEqual(clock.sleeps, []);
});

test('the last candidate rejecting throws ContentRejectedError', async () => {
  const clock = makeClock(PT_NOON);
  const orch = createLLMOrchestrator<FakeClient>({
    apiKeys: ['k1'],
    getModelChainConfig: () => ({ primary: 'gm1' }),
    createClient: (key) => ({ key }),
    exec: () => Promise.resolve({ text: 'not json', finishReason: 'STOP' }),
    routerOptions: { now: clock.now, sleep: clock.sleep },
  });

  await assert.rejects(
    orch.callLLM('p', { validate: (t) => t.startsWith('{') }),
    (err: unknown) => err instanceof ContentRejectedError && /gm1/.test((err as Error).message),
  );
});

test('validation runs after the truncation retry, never instead of it', async () => {
  const clock = makeClock(PT_NOON);
  const budgets: number[] = [];
  const orch = createLLMOrchestrator<FakeClient>({
    apiKeys: ['k1'],
    getModelChainConfig: () => ({ primary: 'gm1' }),
    createClient: (key) => ({ key }),
    exec: (_c, req) => {
      budgets.push(req.maxTokens);
      // First answer is truncated mid-JSON; the doubled budget completes it.
      return Promise.resolve(budgets.length === 1
        ? { text: '{"ok":tr', finishReason: 'MAX_TOKENS' }
        : { text: '{"ok":true}', finishReason: 'STOP' });
    },
    routerOptions: { now: clock.now, sleep: clock.sleep },
  });

  const text = await orch.callLLM('p', { maxTokens: 64, validate: (t) => t.endsWith('}') });
  assert.equal(text, '{"ok":true}');
  assert.deepEqual(budgets, [64, nextRetryBudget(64, TOKEN_BUDGETS)]);
});

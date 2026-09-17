import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TOKEN_BUDGETS,
  createLLMOrchestrator,
  nextRetryBudget,
  type ExecutorRequest,
} from '../src/orchestrator.js';
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

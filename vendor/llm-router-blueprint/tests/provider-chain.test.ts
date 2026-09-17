import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  callWithProviderChain,
  providerCallTimeoutMs,
  stripThinkBlock,
  type FetchFn,
} from '../src/provider-chain.js';

interface FakeResponse {
  ok: boolean;
  text?: string;
}

function fakeFetch(handler: (url: string, init?: RequestInit) => FakeResponse): { fetchFn: FetchFn; urls: string[] } {
  const urls: string[] = [];
  const fetchFn = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    urls.push(url);
    const res = handler(url, init);
    // A real Response so res.body.getReader() exists and the SSE parser runs.
    return new Response(res.text ?? null, { status: res.ok ? 200 : 503 });
  }) as unknown as FetchFn;
  return { fetchFn, urls };
}

const sse = (content: string): string =>
  `data: {"choices":[{"delta":{"content":"${content}"}}]}\ndata: [DONE]\n`;

const twoProviders = [
  { name: 'p1', url: 'http://p1', apiKey: 'x', model: 'm' },
  { name: 'p2', url: 'http://p2', apiKey: 'x', model: 'm' },
];

test('probe failure fails over to the next provider without calling its chat endpoint', async () => {
  const { fetchFn, urls } = fakeFetch((url) => {
    if (url === 'http://p1/v1/models') return { ok: false };
    if (url === 'http://p2/v1/models') return { ok: true };
    if (url === 'http://p2/v1/chat/completions') return { ok: true, text: sse('hello') };
    throw new Error(`unexpected fetch: ${url}`);
  });
  const hit = await callWithProviderChain(twoProviders, 'prompt', {}, { fetch: fetchFn });
  assert.equal(hit?.text, 'hello');
  assert.equal(hit?.providerIndex, 1);
  assert.ok(!urls.includes('http://p1/v1/chat/completions'));
});

test('validate hook: a rejected answer counts as a transport failure and fails over', async () => {
  const { fetchFn } = fakeFetch((url) => {
    if (url.endsWith('/v1/models')) return { ok: true };
    if (url === 'http://p1/v1/chat/completions') return { ok: true, text: sse('bad') };
    if (url === 'http://p2/v1/chat/completions') return { ok: true, text: sse('good') };
    throw new Error(`unexpected fetch: ${url}`);
  });
  const hit = await callWithProviderChain(twoProviders, 'prompt', { validate: (t) => t === 'good' }, { fetch: fetchFn });
  assert.equal(hit?.text, 'good');
  assert.equal(hit?.providerIndex, 1);
});

test('an empty answer falls through to the next provider', async () => {
  const { fetchFn } = fakeFetch((url) => {
    if (url.endsWith('/v1/models')) return { ok: true };
    if (url === 'http://p1/v1/chat/completions') return { ok: true, text: sse('') };
    if (url === 'http://p2/v1/chat/completions') return { ok: true, text: sse('filled') };
    throw new Error(`unexpected fetch: ${url}`);
  });
  const hit = await callWithProviderChain(twoProviders, 'prompt', {}, { fetch: fetchFn });
  assert.equal(hit?.text, 'filled');
  assert.equal(hit?.providerIndex, 1);
});

test('a successful first provider means the second is never touched', async () => {
  const { fetchFn, urls } = fakeFetch((url) => {
    if (url === 'http://p1/v1/models') return { ok: true };
    if (url === 'http://p1/v1/chat/completions') return { ok: true, text: sse('first') };
    throw new Error(`unexpected fetch: ${url}`);
  });
  const hit = await callWithProviderChain(twoProviders, 'prompt', {}, { fetch: fetchFn });
  assert.equal(hit?.text, 'first');
  assert.equal(hit?.providerIndex, 0);
  assert.ok(!urls.some((u) => u.startsWith('http://p2')));
});

test('all providers failing returns null (fallback decision belongs to the caller)', async () => {
  const { fetchFn } = fakeFetch(() => ({ ok: false }));
  const hit = await callWithProviderChain(twoProviders, 'prompt', {}, { fetch: fetchFn });
  assert.equal(hit, null);
});

test('the probe sends the Bearer token (auth-protected endpoints answer 401 without it)', async () => {
  const { fetchFn, urls } = fakeFetch((url, init) => {
    if (url === 'http://p1/v1/models') {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      return headers['Authorization'] === 'Bearer secret' ? { ok: true } : { ok: false };
    }
    if (url === 'http://p1/v1/chat/completions') return { ok: true, text: sse('authed') };
    throw new Error(`unexpected fetch: ${url}`);
  });
  const hit = await callWithProviderChain(
    [{ name: 'p1', url: 'http://p1', apiKey: 'secret', model: 'm' }],
    'prompt',
    {},
    { fetch: fetchFn },
  );
  assert.equal(hit?.text, 'authed');
  assert.deepEqual(urls, ['http://p1/v1/models', 'http://p1/v1/chat/completions']);
});

test('stripThinkBlock cuts complete think blocks and blanks interrupted ones', () => {
  assert.equal(stripThinkBlock('<think>secret reasoning</think> visible answer'), 'visible answer');
  assert.equal(stripThinkBlock('<think>budget died mid-thinking'), '');
  assert.equal(stripThinkBlock('  plain answer  '), 'plain answer');
});

test('the timeout budget scales with maxTokens (TTFB + per-token)', () => {
  assert.equal(providerCallTimeoutMs(2048), 180_000 + 2048 * 150);
  assert.equal(providerCallTimeoutMs(0), 180_000);
});

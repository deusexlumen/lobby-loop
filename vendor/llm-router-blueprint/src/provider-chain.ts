/**
 * provider-chain.ts — sequential failover across OpenAI-compatible endpoints.
 *
 * A configured chain of providers (e.g. a tunnel to a remote GPU box, then a
 * local LLM) is probed in order: a fast 3-second probe (GET {base}/v1/models
 * with Bearer auth — without it an auth-protected endpoint answers 401 and
 * would be misread as "down"), then a streaming chat call. Unreachable or
 * empty/invalid answer → next provider. The fallback decision when the whole
 * chain yields nothing belongs to the caller (typically the key-pool router).
 *
 * Timeouts scale with the requested output budget: TTFB covers connect +
 * prefill of a large prompt, then 150 ms per output token (worst-case slow
 * local hardware). A dead endpoint still falls out fast via the probe.
 *
 * Streaming is mandatory: without stream=true the server holds the
 * connection until the full answer is done, and a proxy in between times
 * out waiting for response headers on long reasoning answers.
 *
 * fetch and log are injectable — tests fake providers up/down/empty without
 * touching the network, and there is no process.env access in here.
 */

export const PROBE_TIMEOUT_MS = 3_000;
export const TTFB_TIMEOUT_MS = 180_000;
export const PER_TOKEN_TIMEOUT_MS = 150;

/** Time budget for one chat call: connect + prefill, then per output token. */
export function providerCallTimeoutMs(maxTokens: number): number {
  return TTFB_TIMEOUT_MS + maxTokens * PER_TOKEN_TIMEOUT_MS;
}

export type FetchFn = typeof fetch;

export interface ChainHooks {
  fetch?: FetchFn;
  log?: (message: string) => void;
}

export interface ProviderCallConfig {
  temperature?: number;
  maxTokens?: number;
  /**
   * Optional content validation. Returning false counts as a transport
   * failure — the next provider is tried. Background: some endpoints answer
   * structured calls with short non-empty acknowledgements that pass a
   * plain emptiness check but are useless to the caller.
   */
  validate?: (text: string) => boolean;
}

/** Target of a single OpenAI-compatible endpoint. */
export interface ProviderTarget {
  url: string;
  apiKey: string;
  model: string;
}

/** Provider in the chain — `name` lands in the success log. */
export interface ProviderConfig extends ProviderTarget {
  name: string;
}

export interface ProviderChainResult {
  text: string;
  providerIndex: number;
}

export function normalizeBaseUrl(url: string): string {
  return url.replace(/\/v1\/?$/, '').replace(/\/$/, '');
}

/**
 * Reachability probe: GET {baseUrl}/v1/models with a short timeout and the
 * provider's Bearer token.
 */
export async function probeProvider(
  baseUrl: string | null | undefined,
  apiKey?: string,
  hooks: ChainHooks = {},
): Promise<boolean> {
  if (!baseUrl) return false;
  const fetchFn = hooks.fetch ?? fetch;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    const headers: Record<string, string> = {};
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    const res = await fetchFn(`${baseUrl}/v1/models`, { headers, signal: controller.signal });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Cuts a raw `<think>...</think>` reasoning block that reasoning-capable
 * models prepend unmasked to the actual answer. Without the cut, a tight
 * max_tokens budget yields an answer consisting only of the thinking phase.
 * An INTERRUPTED think block (budget died mid-thinking, no closing tag)
 * counts as an empty answer ('') — the raw thinking note must not leak
 * through as the reply.
 */
export function stripThinkBlock(text: string): string {
  const marker = '</think>';
  const idx = text.indexOf(marker);
  if (idx === -1) {
    if (text.trimStart().startsWith('<think>')) return '';
    return text.trim();
  }
  return text.slice(idx + marker.length).trim();
}

/**
 * Reads an OpenAI-compatible SSE chat-completion response (`data: {...}`
 * per line, terminated by `data: [DONE]`) and concatenates the
 * `delta.content` pieces.
 */
async function readSSEContent(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return (await res.text()).trim();

  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const parsed = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> };
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) content += delta;
      } catch {
        // incomplete JSON fragment at the buffer edge — the next chunk completes it
      }
    }
  }
  return content;
}

/**
 * Single streaming chat-completion call. Returns the think-block-stripped,
 * trimmed content or null (HTTP error, empty answer, timeout/abort,
 * network failure).
 */
export async function callProviderChat(
  provider: ProviderTarget,
  prompt: string,
  config: ProviderCallConfig = {},
  hooks: ChainHooks = {},
): Promise<string | null> {
  const fetchFn = hooks.fetch ?? fetch;
  const controller = new AbortController();
  const maxTokens = config.maxTokens ?? 256;
  const timeout = setTimeout(() => controller.abort(), providerCallTimeoutMs(maxTokens));
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (provider.apiKey) headers['Authorization'] = `Bearer ${provider.apiKey}`;
    const res = await fetchFn(`${provider.url}/v1/chat/completions`, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: provider.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: config.temperature ?? 0.7,
        max_tokens: maxTokens,
        stream: true,
      }),
    });
    if (!res.ok) return null;
    const raw = await readSSEContent(res);
    const cleaned = stripThinkBlock(raw);
    return cleaned || null;
  } catch (err) {
    hooks.log?.(`[provider-chain] call to ${provider.url} failed: ${String(err)}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Tries the providers in order: unreachable or null/empty → next. Returns
 * the first hit with its index, else null (the fallback decision — e.g. the
 * key-pool router — belongs to the caller).
 */
export async function callWithProviderChain(
  providers: ProviderConfig[],
  prompt: string,
  config: ProviderCallConfig = {},
  hooks: ChainHooks = {},
): Promise<ProviderChainResult | null> {
  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i];
    if (!(await probeProvider(provider.url, provider.apiKey, hooks))) continue;
    const text = await callProviderChat(provider, prompt, config, hooks);
    if (text && config.validate && !config.validate(text)) {
      hooks.log?.(`[provider-chain] ${provider.name}: answer rejected by content validation — next provider`);
      continue;
    }
    if (text) {
      hooks.log?.(`[provider-chain] used ${provider.name} provider`);
      return { text, providerIndex: i };
    }
  }
  return null;
}

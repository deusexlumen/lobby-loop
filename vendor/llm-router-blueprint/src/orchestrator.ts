/**
 * orchestrator.ts — single decision point "provider chain first, key-pool
 * router as fallback", plus the MAX_TOKENS retry safety net.
 *
 * Every LLM path of an app should route through this one seam so the two
 * transports cannot drift apart. The orchestrator ships without any SDK:
 * the app injects `createClient(apiKey)` (clients are cached per key in a
 * closure map — the client is stateless, rebuilding it per request is
 * pointless GC pressure) and `exec(client, request)`, which performs one
 * generation and reports `finishReason` so the retry can fire.
 *
 * MAX_TOKENS safety net: some providers (e.g. Gemini 3.x) let thinking
 * tokens share the output budget with the visible answer, so a truncated
 * answer must never reach the user. Exactly one retry with a doubled budget
 * (floor `structured`, ceiling `retryCap`). It is a safety net, not a
 * strategy: if it fires in normal operation, every call costs TWO model
 * requests. Length limits belong in the prompt, not in the token cap —
 * a higher budget costs nothing while answers stay short.
 */
import {
  createKeyPoolRouter,
  maskApiKey,
  resolveApiKeys,
  resolveModelChain,
  type KeyPoolRouter,
  type KeyPoolRouterOptions,
  type ModelChainConfig,
} from './key-pool-router.js';
import {
  callWithProviderChain,
  type FetchFn,
  type ProviderConfig,
} from './provider-chain.js';

/** Output token budgets per call class. */
export interface TokenBudgets {
  /** One sentence to a short paragraph of visible prose. */
  micro: number;
  /** Fixed output shape: JSON, lists, structured grading. */
  structured: number;
  /** Visible chat answer. */
  chat: number;
  /** Ceiling for the single MAX_TOKENS retry. */
  retryCap: number;
}

export const TOKEN_BUDGETS: TokenBudgets = {
  micro: 512,
  structured: 1024,
  chat: 2048,
  retryCap: 4096,
};

/**
 * Budget for the one retry after finishReason MAX_TOKENS. Doubles, with
 * `structured` as the floor (a tiny start budget should not end in an
 * equally tiny retry) and `retryCap` as the ceiling.
 */
export function nextRetryBudget(startBudget: number, budgets: TokenBudgets = TOKEN_BUDGETS): number {
  return Math.min(Math.max(startBudget * 2, budgets.structured), budgets.retryCap);
}

export interface ExecutorRequest {
  model: string;
  prompt: string;
  temperature: number;
  maxTokens: number;
}

export interface ExecutorResult {
  text: string;
  /** Surface the provider's finish reason; 'MAX_TOKENS' triggers the retry. */
  finishReason?: string;
}

export type Executor<C> = (client: C, request: ExecutorRequest) => Promise<ExecutorResult>;

export interface OrchestratorDeps<C> {
  /** OpenAI-compatible provider chain, tried first when configured. */
  providers?: ProviderConfig[];
  /** Live getter — the app config may be assigned after this factory runs. */
  getModelChainConfig?: () => ModelChainConfig | null | undefined;
  /** Key sources (each may carry several keys, comma/semicolon/whitespace-separated). */
  apiKeys: Array<string | null | undefined> | (() => Array<string | null | undefined>);
  /** Used when neither the config nor the call names a model. */
  defaultModel?: string;
  createClient: (apiKey: string) => C;
  exec: Executor<C>;
  /** Bring your own router (e.g. with a JsonFileStore), or configure the default one. */
  router?: KeyPoolRouter;
  routerOptions?: KeyPoolRouterOptions;
  tokenBudgets?: TokenBudgets;
  fetch?: FetchFn;
  log?: (message: string) => void;
}

export interface OrchestratorCallConfig {
  temperature?: number;
  maxTokens?: number;
  /** Explicit model: replaces the primary, keeps the fallbacks. */
  model?: string;
  validate?: (text: string) => boolean;
}

export interface OrchestratorResult {
  text: string;
  /** Provider-chain name, or `key-pool:<model>` when the router answered. */
  provider: string;
  finishReason?: string;
  retried?: boolean;
}

export interface LLMOrchestrator {
  hasProviderChainConfigured: () => boolean;
  callLLM: (prompt: string, config?: OrchestratorCallConfig) => Promise<string>;
  callLLMWithMeta: (prompt: string, config?: OrchestratorCallConfig) => Promise<OrchestratorResult>;
}

export function createLLMOrchestrator<C>(deps: OrchestratorDeps<C>): LLMOrchestrator {
  const log = deps.log ?? ((): void => undefined);
  const budgets = deps.tokenBudgets ?? TOKEN_BUDGETS;
  const router = deps.router ?? createKeyPoolRouter({ ...deps.routerOptions, log: deps.routerOptions?.log ?? log });

  const clients = new Map<string, C>();
  const getClient = (apiKey: string): C => {
    let client = clients.get(apiKey);
    if (!client) {
      client = deps.createClient(apiKey);
      clients.set(apiKey, client);
    }
    return client;
  };

  const resolveKeys = (): string[] => {
    const sources = typeof deps.apiKeys === 'function' ? deps.apiKeys() : deps.apiKeys;
    return resolveApiKeys(...sources);
  };

  async function execWithRetry(
    model: string,
    apiKey: string,
    prompt: string,
    config: OrchestratorCallConfig,
  ): Promise<ExecutorResult & { retried: boolean }> {
    const startBudget = config.maxTokens ?? budgets.micro;
    let budget = startBudget;
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await deps.exec(getClient(apiKey), {
        model,
        prompt,
        temperature: config.temperature ?? 0.7,
        maxTokens: budget,
      });
      if (res.finishReason === 'MAX_TOKENS' && attempt === 0) {
        budget = nextRetryBudget(startBudget, budgets);
        log(`[orchestrator] ${model}: answer truncated at ${startBudget} tokens (MAX_TOKENS) — one retry with ${budget}`);
        continue;
      }
      return { ...res, retried: attempt > 0 };
    }
    throw new Error('unreachable');
  }

  async function callLLMWithMeta(prompt: string, config: OrchestratorCallConfig = {}): Promise<OrchestratorResult> {
    const providers = deps.providers ?? [];
    const hit = await callWithProviderChain(providers, prompt, {
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      validate: config.validate,
    }, { fetch: deps.fetch, log });
    if (hit) return { text: hit.text, provider: providers[hit.providerIndex]?.name ?? 'provider-chain' };

    // Fallback: the key-pool router. Background traffic (no explicit
    // config.model) starts at the fallbacks so the primary model's narrow
    // daily budget stays reserved for foreground calls.
    const apiKeys = resolveKeys();
    if (apiKeys.length === 0) throw new Error('No API key configured and provider chain unavailable.');
    const chain = resolveModelChain(deps.getModelChainConfig?.(), {
      backgroundFirst: !config.model,
      overrideModel: config.model,
      defaultModel: deps.defaultModel,
    });
    log('[orchestrator] provider chain unavailable — key-pool router fallback');
    const { result, model, apiKey } = await router.call(chain, apiKeys, (m, k) => execWithRetry(m, k, prompt, config));
    if (model !== chain[0] || apiKey !== apiKeys[0]) {
      log(`[orchestrator] router failover active: ${model} (key ${maskApiKey(apiKey)})`);
    }
    return { text: result.text, provider: `key-pool:${model}`, finishReason: result.finishReason, retried: result.retried };
  }

  return {
    hasProviderChainConfigured: () => (deps.providers ?? []).some((p) => !!p.url),
    callLLM: async (prompt, config = {}) => (await callLLMWithMeta(prompt, config)).text,
    callLLMWithMeta,
  };
}

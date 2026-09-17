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
import { type KeyPoolRouter, type KeyPoolRouterOptions, type ModelChainConfig } from './key-pool-router.js';
import { type FetchFn, type ProviderConfig } from './provider-chain.js';
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
export declare const TOKEN_BUDGETS: TokenBudgets;
/**
 * Budget for the one retry after finishReason MAX_TOKENS. Doubles, with
 * `structured` as the floor (a tiny start budget should not end in an
 * equally tiny retry) and `retryCap` as the ceiling.
 */
export declare function nextRetryBudget(startBudget: number, budgets?: TokenBudgets): number;
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
export declare function createLLMOrchestrator<C>(deps: OrchestratorDeps<C>): LLMOrchestrator;

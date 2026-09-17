import { type StateStore } from './state-store.js';
export interface ModelChainConfig {
    primary?: string;
    fallbacks?: string[];
}
/** Masks an API key for logs (never log the whole key). */
export declare function maskApiKey(key: string): string;
/**
 * Resolves API keys from multiple sources. Each source may itself carry
 * several keys (comma-, semicolon- or whitespace-separated); duplicates are
 * removed, order is preserved. Works for `MY_KEYS=k1,k2,k3` env lists and
 * for a multi-key entry pasted into a single config field alike.
 */
export declare function resolveApiKeys(...sources: Array<string | null | undefined>): string[];
/**
 * Builds the ordered model chain. Default: [primary, ...fallbacks].
 * `backgroundFirst` (background traffic like summaries/extraction) starts at
 * the quota-richest end — the fallbacks in reverse, the primary model stays
 * the last resort so its narrow daily budget is reserved for foreground
 * traffic. `overrideModel` replaces the primary but keeps the fallbacks as
 * a safety net.
 */
export declare function resolveModelChain(cfg: ModelChainConfig | null | undefined, opts?: {
    backgroundFirst?: boolean;
    overrideModel?: string;
    defaultModel?: string;
}): string[];
export interface KeyPoolRouterOptions {
    /** Wait before the single retry on the last chain link (RPM burst buffer). Default 15 s. */
    retryAfterMs?: number;
    /** Lock time for a pair after an RPM 429. Default 60 s. */
    rpmCooldownMs?: number;
    /** Lock time after a transient overload (503). Default 30 s — shorter than RPM, the situation is more volatile. */
    transientCooldownMs?: number;
    /** Quota-state persistence. Default: InMemoryStore (original behavior). */
    stateStore?: StateStore;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
    log?: (message: string) => void;
}
export interface KeyPoolRouteResult<T> {
    result: T;
    model: string;
    apiKey: string;
}
export interface KeyPoolRouter {
    call<T>(chain: string[], apiKeys: string[], exec: (model: string, apiKey: string) => Promise<T>): Promise<KeyPoolRouteResult<T>>;
}
export declare function createKeyPoolRouter(opts?: KeyPoolRouterOptions): KeyPoolRouter;
/**
 * One-shot convenience wrapper around createKeyPoolRouter. Note: without an
 * injected `stateStore` each invocation starts with empty quota memory —
 * long-lived apps should create ONE router via createKeyPoolRouter and
 * reuse it so cooldowns and dead keys/models accumulate across calls.
 */
export declare function callWithKeyPool<T>(chain: string[], apiKeys: string[], exec: (model: string, apiKey: string) => Promise<T>, opts?: KeyPoolRouterOptions): Promise<KeyPoolRouteResult<T>>;

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
export declare const PROBE_TIMEOUT_MS = 3000;
export declare const TTFB_TIMEOUT_MS = 180000;
export declare const PER_TOKEN_TIMEOUT_MS = 150;
/** Time budget for one chat call: connect + prefill, then per output token. */
export declare function providerCallTimeoutMs(maxTokens: number): number;
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
export declare function normalizeBaseUrl(url: string): string;
/**
 * Reachability probe: GET {baseUrl}/v1/models with a short timeout and the
 * provider's Bearer token.
 */
export declare function probeProvider(baseUrl: string | null | undefined, apiKey?: string, hooks?: ChainHooks): Promise<boolean>;
/**
 * Cuts a raw `<think>...</think>` reasoning block that reasoning-capable
 * models prepend unmasked to the actual answer. Without the cut, a tight
 * max_tokens budget yields an answer consisting only of the thinking phase.
 * An INTERRUPTED think block (budget died mid-thinking, no closing tag)
 * counts as an empty answer ('') — the raw thinking note must not leak
 * through as the reply.
 */
export declare function stripThinkBlock(text: string): string;
/**
 * Single streaming chat-completion call. Returns the think-block-stripped,
 * trimmed content or null (HTTP error, empty answer, timeout/abort,
 * network failure).
 */
export declare function callProviderChat(provider: ProviderTarget, prompt: string, config?: ProviderCallConfig, hooks?: ChainHooks): Promise<string | null>;
/**
 * Tries the providers in order: unreachable or null/empty → next. Returns
 * the first hit with its index, else null (the fallback decision — e.g. the
 * key-pool router — belongs to the caller).
 */
export declare function callWithProviderChain(providers: ProviderConfig[], prompt: string, config?: ProviderCallConfig, hooks?: ChainHooks): Promise<ProviderChainResult | null>;

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
    /**
     * System-level instructions, kept apart from `prompt` so the executor can
     * map them to its provider's dedicated slot (a system instruction, a
     * system message). Separating them is what binds persona and output
     * contract more firmly than prepending them to the user turn — and it
     * keeps untrusted input out of the instruction role.
     */
    system?: string;
    /**
     * Requested response schema, passed through verbatim. Deliberately
     * `unknown`: the shape belongs to the provider (a JSON Schema for
     * structured output, a response_format object), and this blueprint stays
     * provider-agnostic. The executor maps it or ignores it.
     */
    schema?: unknown;
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
    /** System instructions — see ExecutorRequest.system. */
    system?: string;
    /** Requested response schema — see ExecutorRequest.schema. */
    schema?: unknown;
    /**
     * Content validation. A rejected answer is not a provider failure, but it
     * is not usable either: both paths fail over to the next candidate rather
     * than returning it (provider chain → next provider, key-pool router →
     * next Model×Key pair). The last candidate's rejection is thrown as a
     * ContentRejectedError.
     */
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

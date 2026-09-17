export interface PairQuotaState {
    /** RPM lock: timestamp (ms) from which the pair is tried again. */
    cooldownUntil: number;
    /** RPD lock: PT date (YYYY-MM-DD) on which the daily quota fell. */
    exhaustedOnPtDate: string | null;
}
export interface PersistedRouterState {
    /** Keyed by pair id `${model}::${apiKey}`. */
    quotaState: Record<string, PairQuotaState>;
    deadKeys: string[];
    deadModels: string[];
}
export declare function emptyRouterState(): PersistedRouterState;
export interface StateStore {
    load(): Promise<PersistedRouterState>;
    save(state: PersistedRouterState): Promise<void>;
}
export declare class InMemoryStore implements StateStore {
    private state;
    load(): Promise<PersistedRouterState>;
    save(state: PersistedRouterState): Promise<void>;
}
export declare class JsonFileStore implements StateStore {
    private readonly filePath;
    private queue;
    constructor(filePath: string);
    load(): Promise<PersistedRouterState>;
    save(state: PersistedRouterState): Promise<void>;
}

/**
 * state-store.ts — persistence seam for router quota state.
 *
 * The router loads its state once at start and saves after every mutation,
 * so quota locks (RPM cooldowns, RPD day markers) and dead keys/models
 * survive a process restart instead of being re-discovered the expensive
 * way (one burned request per pair).
 *
 * Invariants:
 * - `InMemoryStore` is the default and reproduces the original in-process
 *   behavior exactly.
 * - `JsonFileStore` writes atomically (tmp file + rename): a crash mid-write
 *   never leaves a truncated state file. Reads are tolerant: a missing or
 *   corrupt file loads as empty state, never throws.
 * - Saves are serialized through a promise chain so out-of-order writes
 *   cannot clobber newer state with older snapshots.
 */
import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';

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

export function emptyRouterState(): PersistedRouterState {
  return { quotaState: {}, deadKeys: [], deadModels: [] };
}

export interface StateStore {
  load(): Promise<PersistedRouterState>;
  save(state: PersistedRouterState): Promise<void>;
}

export class InMemoryStore implements StateStore {
  private state: PersistedRouterState = emptyRouterState();

  load(): Promise<PersistedRouterState> {
    return Promise.resolve(this.state);
  }

  save(state: PersistedRouterState): Promise<void> {
    this.state = state;
    return Promise.resolve();
  }
}

export class JsonFileStore implements StateStore {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async load(): Promise<PersistedRouterState> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<PersistedRouterState>;
      return {
        quotaState: parsed.quotaState && typeof parsed.quotaState === 'object' ? parsed.quotaState : {},
        deadKeys: Array.isArray(parsed.deadKeys) ? parsed.deadKeys.filter((k): k is string => typeof k === 'string') : [],
        deadModels: Array.isArray(parsed.deadModels) ? parsed.deadModels.filter((m): m is string => typeof m === 'string') : [],
      };
    } catch {
      return emptyRouterState();
    }
  }

  save(state: PersistedRouterState): Promise<void> {
    const run = this.queue.then(async () => {
      await fs.mkdir(dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(state), 'utf8');
      await fs.rename(tmp, this.filePath);
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
}

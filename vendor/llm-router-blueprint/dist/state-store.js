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
export function emptyRouterState() {
    return { quotaState: {}, deadKeys: [], deadModels: [] };
}
export class InMemoryStore {
    state = emptyRouterState();
    load() {
        return Promise.resolve(this.state);
    }
    save(state) {
        this.state = state;
        return Promise.resolve();
    }
}
export class JsonFileStore {
    filePath;
    queue = Promise.resolve();
    constructor(filePath) {
        this.filePath = filePath;
    }
    async load() {
        try {
            const raw = await fs.readFile(this.filePath, 'utf8');
            const parsed = JSON.parse(raw);
            return {
                quotaState: parsed.quotaState && typeof parsed.quotaState === 'object' ? parsed.quotaState : {},
                deadKeys: Array.isArray(parsed.deadKeys) ? parsed.deadKeys.filter((k) => typeof k === 'string') : [],
                deadModels: Array.isArray(parsed.deadModels) ? parsed.deadModels.filter((m) => typeof m === 'string') : [],
            };
        }
        catch {
            return emptyRouterState();
        }
    }
    save(state) {
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

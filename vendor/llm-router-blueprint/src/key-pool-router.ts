/**
 * key-pool-router.ts — quota arbitrage across Model×Key pairs.
 *
 * Background: free-tier quotas differ massively per model, and every API key
 * is its own project with its own quota. A single configured model + single
 * key is either good and empty after ~N requests/day, or generous but weak.
 * This router chains models (primary first, fallbacks on quota failure) and,
 * per model, tries EVERY key in the pool before advancing (model-major).
 * Locks are booked per Model×Key pair: an RPM 429 sets a short cooldown, an
 * RPD 429 marks the pair exhausted until the Pacific-Time day flips (daily
 * quotas reset at midnight America/Los_Angeles). A 404 kills the model for
 * all keys, a 401/403 kills the key across all models. A transient 5xx /
 * timeout / network failure locks the whole MODEL briefly — overload is
 * shared provider-side capacity, not project quota, so retrying the same
 * model on the next key would hit the same wall.
 *
 * The router is provider-agnostic: it never sees an SDK. The caller injects
 * `exec(model, apiKey)` plus now/sleep/log, and error semantics come from
 * classifyError (errors.ts).
 *
 * Invariants:
 * - Candidate selection, cursor advance and every state mutation run under
 *   one promise-chain mutex. A picked pair is claimed (in-flight) and
 *   invisible to parallel callers until released — two concurrent calls
 *   never execute on the same pair at the same time.
 * - Failover happens only for the four classified error kinds; anything
 *   else is thrown immediately.
 * - On success the short cooldown and the overload lock are cleared, but a
 *   set exhaustedOnPtDate marker survives until the PT day flips (the
 *   original this is ported from deleted the whole pair entry, marker
 *   included).
 * - Total exhaustion waits only on the earliest short lock (at most
 *   rpmCooldownMs) or on an in-flight release — never on day locks.
 * - Every mutation is persisted through the injected StateStore
 *   (InMemoryStore by default = original in-process behavior).
 */
import { classifyError } from './errors.js';
import { InMemoryStore, type PersistedRouterState, type StateStore } from './state-store.js';

export interface ModelChainConfig {
  primary?: string;
  fallbacks?: string[];
}

/** Masks an API key for logs (never log the whole key). */
export function maskApiKey(key: string): string {
  if (!key) return '(no key)';
  return key.length > 4 ? `…${key.slice(-4)}` : '***';
}

/**
 * Resolves API keys from multiple sources. Each source may itself carry
 * several keys (comma-, semicolon- or whitespace-separated); duplicates are
 * removed, order is preserved. Works for `MY_KEYS=k1,k2,k3` env lists and
 * for a multi-key entry pasted into a single config field alike.
 */
export function resolveApiKeys(...sources: Array<string | null | undefined>): string[] {
  const keys = sources
    .flatMap((s) => (s ?? '').split(/[,\s;]+/))
    .map((k) => k.trim())
    .filter(Boolean);
  return [...new Set(keys)];
}

/**
 * Builds the ordered model chain. Default: [primary, ...fallbacks].
 * `backgroundFirst` (background traffic like summaries/extraction) starts at
 * the quota-richest end — the fallbacks in reverse, the primary model stays
 * the last resort so its narrow daily budget is reserved for foreground
 * traffic. `overrideModel` replaces the primary but keeps the fallbacks as
 * a safety net.
 */
export function resolveModelChain(
  cfg: ModelChainConfig | null | undefined,
  opts: { backgroundFirst?: boolean; overrideModel?: string; defaultModel?: string } = {},
): string[] {
  const strip = (m: string): string => m.replace(/^models\//, '').trim();
  const primary = strip(opts.overrideModel || cfg?.primary || opts.defaultModel || '');
  const fallbacks = (cfg?.fallbacks ?? []).map(strip).filter(Boolean);
  const ordered = opts.overrideModel
    ? [primary, ...fallbacks]
    : opts.backgroundFirst
      ? [...fallbacks.slice().reverse(), primary]
      : [primary, ...fallbacks];
  return [...new Set(ordered.filter(Boolean))];
}

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
  call<T>(
    chain: string[],
    apiKeys: string[],
    exec: (model: string, apiKey: string) => Promise<T>,
  ): Promise<KeyPoolRouteResult<T>>;
}

/** Daily provider quotas reset at midnight Pacific Time. */
function pacificDateString(nowMs: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(nowMs));
}

interface PairQuotaState {
  cooldownUntil: number;
  exhaustedOnPtDate: string | null;
}

export function createKeyPoolRouter(opts: KeyPoolRouterOptions = {}): KeyPoolRouter {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const log = opts.log ?? ((): void => undefined);
  const retryAfterMs = opts.retryAfterMs ?? 15_000;
  const rpmCooldownMs = opts.rpmCooldownMs ?? 60_000;
  const transientCooldownMs = opts.transientCooldownMs ?? 30_000;
  const store = opts.stateStore ?? new InMemoryStore();

  const quotaState = new Map<string, PairQuotaState>();
  /** Models that returned 404 — dead for the process lifetime. */
  const deadModels = new Set<string>();
  /** Keys that returned 401/403 — dead across all models. */
  const deadKeys = new Set<string>();
  /**
   * Models in a transient overload lock (503), release time in ms. Deliberately
   * per MODEL, not per pair: "high demand" is shared provider-side capacity,
   * not project quota — the same call on the next key returns the same 503.
   */
  const overloadedModels = new Map<string, number>();
  /** Pairs currently executing — claimed under the mutex, released in finally. */
  const inFlight = new Set<string>();
  const waiters = new Set<() => void>();
  /** Round-robin cursor for key selection (spreads load across projects). */
  let keyCursor = 0;

  // One promise-chain mutex serializes candidate selection, cursor advance
  // and state mutation. exec() runs OUTSIDE it — holding it across the
  // network call would serialize all traffic.
  let queue: Promise<unknown> = Promise.resolve();
  const withMutex = <T>(fn: () => T | Promise<T>): Promise<T> => {
    const run = queue.then(fn);
    queue = run.catch(() => undefined);
    return run;
  };

  const initPromise = store.load()
    .then((s) => {
      for (const [pair, qs] of Object.entries(s.quotaState ?? {})) {
        quotaState.set(pair, {
          cooldownUntil: typeof qs.cooldownUntil === 'number' ? qs.cooldownUntil : 0,
          exhaustedOnPtDate: qs.exhaustedOnPtDate ?? null,
        });
      }
      for (const k of s.deadKeys ?? []) deadKeys.add(k);
      for (const m of s.deadModels ?? []) deadModels.add(m);
    })
    .catch((err: unknown) => log(`[router] state load failed, starting empty: ${String(err)}`));

  const snapshot = (): PersistedRouterState => ({
    quotaState: Object.fromEntries(quotaState),
    deadKeys: [...deadKeys],
    deadModels: [...deadModels],
  });

  // Persisted under the mutex and awaited: mutations hit the store in order,
  // and a restarted process sees every lock the previous one booked.
  // Persistence failures are logged, never fatal to the call.
  const persistLocked = async (): Promise<void> => {
    try {
      await store.save(snapshot());
    } catch (err) {
      log(`[router] state save failed: ${String(err)}`);
    }
  };

  const pairId = (m: string, k: string): string => `${m}::${k}`;
  const stateOf = (m: string, k: string): PairQuotaState =>
    quotaState.get(pairId(m, k)) ?? { cooldownUntil: 0, exhaustedOnPtDate: null };

  const release = (pair: string): void => {
    inFlight.delete(pair);
    for (const w of waiters) w();
    waiters.clear();
  };

  const onRelease = (): Promise<void> => new Promise<void>((resolve) => { waiters.add(resolve); });

  interface Pick { model: string; apiKey: string; isLast: boolean }

  // Free keys of a model in round-robin order, so consecutive calls spread
  // load across projects instead of grilling the same key first every time.
  const pickLocked = (chain: string[], apiKeys: string[]): Pick | null => {
    const ptToday = pacificDateString(now());
    const freeKeysFor = (m: string): string[] => {
      const avail = apiKeys.filter((k) => {
        if (deadKeys.has(k)) return false;
        if (inFlight.has(pairId(m, k))) return false;
        const s = stateOf(m, k);
        return s.exhaustedOnPtDate !== ptToday && s.cooldownUntil <= now();
      });
      if (avail.length > 1) {
        const off = keyCursor % avail.length;
        return [...avail.slice(off), ...avail.slice(0, off)];
      }
      return avail;
    };
    const modelOverloaded = (m: string): boolean => (overloadedModels.get(m) ?? 0) > now();
    const candidates: Array<{ model: string; apiKey: string }> = chain
      .filter((m) => !deadModels.has(m) && !modelOverloaded(m))
      .flatMap((m) => freeKeysFor(m).map((apiKey) => ({ model: m, apiKey })));
    const first = candidates[0];
    if (!first) return null;
    inFlight.add(pairId(first.model, first.apiKey));
    return { ...first, isLast: candidates.length === 1 };
  };

  interface WaitTarget {
    /** Remaining short-lock time in ms; null = only an in-flight release can help. */
    ms: number | null;
    model?: string;
    apiKey?: string;
  }

  // Nothing is free: wait only on an expiring short lock (never on day
  // locks) or on an in-flight pair being released by a parallel call.
  const waitLocked = (chain: string[], apiKeys: string[]): WaitTarget | null => {
    const ptToday = pacificDateString(now());
    let earliest = Infinity;
    let earliestPair: { model: string; apiKey: string } | undefined;
    for (const m of chain) {
      if (deadModels.has(m)) continue;
      const overloadUntil = overloadedModels.get(m) ?? 0;
      for (const k of apiKeys) {
        if (deadKeys.has(k)) continue;
        if (inFlight.has(pairId(m, k))) continue;
        const s = stateOf(m, k);
        if (s.exhaustedOnPtDate === ptToday) continue;
        // Both locks can hold at once — the pair is free when the later one ends.
        const until = Math.max(s.cooldownUntil, overloadUntil);
        if (until > now() && until < earliest) {
          earliest = until;
          earliestPair = { model: m, apiKey: k };
        }
      }
    }
    const hasInFlight = inFlight.size > 0;
    if (earliest === Infinity && !hasInFlight) return null;
    if (earliest !== Infinity && earliest - now() > rpmCooldownMs && !hasInFlight) return null;
    return {
      ms: earliest === Infinity ? null : Math.max(earliest - now(), 0),
      model: earliestPair?.model,
      apiKey: earliestPair?.apiKey,
    };
  };

  async function call<T>(
    chain: string[],
    apiKeys: string[],
    exec: (model: string, apiKey: string) => Promise<T>,
  ): Promise<KeyPoolRouteResult<T>> {
    await initPromise;
    if (chain.length === 0) throw new Error('key-pool router: empty model chain');
    if (apiKeys.length === 0) throw new Error('key-pool router: no API keys in pool');

    let lastErr: unknown = null;
    let attempted = false;

    while (true) {
      const pick = await withMutex(() => pickLocked(chain, apiKeys));
      if (!pick) {
        // Once this call has tried candidates, failing them all is final —
        // the wait logic below only applies when NOTHING was free up front.
        if (attempted) throw lastErr instanceof Error ? lastErr : new Error('key-pool router: all candidates failed');
        const wait = await withMutex(() => waitLocked(chain, apiKeys));
        if (!wait) {
          throw new Error(`key-pool router: quota exhausted on every model (${chain.join(', ')})`);
        }
        if (wait.ms !== null) {
          log(`[router] all models/keys locked — waiting ${Math.ceil(wait.ms / 1000)}s for ${wait.model ?? 'the earliest short lock'}${wait.apiKey ? ` (key ${maskApiKey(wait.apiKey)})` : ''}`);
          await Promise.race([sleep(wait.ms), onRelease()]);
        } else {
          // A parallel call holds the only candidates — wake when it releases.
          await onRelease();
        }
        continue;
      }

      attempted = true;
      const { model, apiKey, isLast } = pick;
      const pair = pairId(model, apiKey);
      // The last available pair gets exactly one retry after retryAfterMs
      // (burst buffer for simultaneous foreground + background traffic).
      const maxAttempts = isLast ? 2 : 1;
      try {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          try {
            const result = await exec(model, apiKey);
            await withMutex(async () => {
              keyCursor++;
              // Success clears the short cooldown and the overload lock, but
              // a set exhaustedOnPtDate marker survives until the PT day
              // flips (the original deleted the whole pair entry here).
              const s = quotaState.get(pair);
              if (s) quotaState.set(pair, { cooldownUntil: 0, exhaustedOnPtDate: s.exhaustedOnPtDate });
              overloadedModels.delete(model);
              await persistLocked();
            });
            return { result, model, apiKey };
          } catch (err) {
            const cls = classifyError(err);
            // Unknown error: never fail over — a real defect must not be
            // mistaken for rate limiting. The finally below releases the claim.
            if (!cls) throw err;
            lastErr = err;

            if (cls.class === 'invalid-model') {
              await withMutex(async () => { deadModels.add(model); await persistLocked(); });
              log(`[router] ${model}: model unavailable (404) — permanently skipped, next model`);
              break;
            }
            if (cls.class === 'invalid-key') {
              await withMutex(async () => { deadKeys.add(apiKey); await persistLocked(); });
              log(`[router] key ${maskApiKey(apiKey)}: invalid/unauthorized — permanently skipped, next key`);
              break;
            }
            if (cls.class === 'transient') {
              if (attempt + 1 < maxAttempts) {
                log(`[router] ${model}: transient error — one retry in ${Math.round(retryAfterMs / 1000)}s`);
                await sleep(retryAfterMs);
                continue;
              }
              await withMutex(() => { overloadedModels.set(model, now() + transientCooldownMs); });
              log(`[router] ${model}: transient error — model locked ${Math.round(transientCooldownMs / 1000)}s (all keys), next model`);
              break;
            }

            // quota
            if (cls.quota === 'rpd') {
              await withMutex(async () => {
                quotaState.set(pair, { ...stateOf(model, apiKey), exhaustedOnPtDate: pacificDateString(now()) });
                await persistLocked();
              });
              log(`[router] ${model} (key ${maskApiKey(apiKey)}): daily quota exhausted — skipped until midnight PT`);
              break;
            }
            await withMutex(async () => {
              quotaState.set(pair, { ...stateOf(model, apiKey), cooldownUntil: now() + rpmCooldownMs });
              await persistLocked();
            });
            if (attempt + 1 < maxAttempts) {
              log(`[router] ${model} (key ${maskApiKey(apiKey)}): 429 (RPM) — one retry in ${Math.round(retryAfterMs / 1000)}s`);
              await sleep(retryAfterMs);
            } else {
              log(`[router] ${model} (key ${maskApiKey(apiKey)}): 429 (RPM) — cooldown ${Math.round(rpmCooldownMs / 1000)}s, next candidate`);
            }
          }
        }
      } finally {
        release(pair);
      }
    }
  }

  return { call };
}

/**
 * One-shot convenience wrapper around createKeyPoolRouter. Note: without an
 * injected `stateStore` each invocation starts with empty quota memory —
 * long-lived apps should create ONE router via createKeyPoolRouter and
 * reuse it so cooldowns and dead keys/models accumulate across calls.
 */
export async function callWithKeyPool<T>(
  chain: string[],
  apiKeys: string[],
  exec: (model: string, apiKey: string) => Promise<T>,
  opts: KeyPoolRouterOptions = {},
): Promise<KeyPoolRouteResult<T>> {
  return createKeyPoolRouter(opts).call(chain, apiKeys, exec);
}

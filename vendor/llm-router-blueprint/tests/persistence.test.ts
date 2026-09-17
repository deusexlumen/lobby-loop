import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createKeyPoolRouter } from '../src/key-pool-router.js';
import { JsonFileStore, emptyRouterState } from '../src/state-store.js';
import { PT_NEXT_DAY, PT_NOON, makeClock, rpdError } from './helpers.js';

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'llm-router-blueprint-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('rpd exhaustion survives a simulated restart; the PT day flip frees the pair', async () => {
  await withTempDir(async (dir) => {
    const file = join(dir, 'router-state.json');
    const clock = makeClock(PT_NOON);
    const storePath = (): JsonFileStore => new JsonFileStore(file);

    // Router instance 1: k1 hits the daily quota, k2 serves.
    const router1 = createKeyPoolRouter({ stateStore: storePath(), now: clock.now, sleep: clock.sleep });
    const r1 = await router1.call(['m1'], ['k1', 'k2'], async (_m, k) => {
      if (k === 'k1') throw rpdError();
      return 'ok';
    });
    assert.equal(r1.apiKey, 'k2');

    // Simulated restart: a new router over the same file keeps k1 locked.
    const callsAfterRestart: string[] = [];
    const router2 = createKeyPoolRouter({ stateStore: storePath(), now: clock.now, sleep: clock.sleep });
    const r2 = await router2.call(['m1'], ['k1', 'k2'], async (_m, k) => {
      callsAfterRestart.push(k);
      return 'ok';
    });
    assert.deepEqual(callsAfterRestart, ['k2']);
    assert.equal(r2.apiKey, 'k2');

    // After midnight PT a fresh process finds the pair eligible again.
    const clockNext = makeClock(PT_NEXT_DAY);
    const callsNextDay: string[] = [];
    const router3 = createKeyPoolRouter({ stateStore: storePath(), now: clockNext.now, sleep: clockNext.sleep });
    const r3 = await router3.call(['m1'], ['k1', 'k2'], async (_m, k) => {
      callsNextDay.push(k);
      return 'ok';
    });
    assert.equal(callsNextDay[0], 'k1');
    assert.equal(r3.apiKey, 'k1');
  });
});

test('semantics fix: success clears the cooldown but keeps an exhaustedOnPtDate marker', async () => {
  await withTempDir(async (dir) => {
    const file = join(dir, 'router-state.json');
    // Preload: the pair has an already-expired cooldown and a stale day marker.
    const staleDate = '2020-01-01';
    await new JsonFileStore(file).save({
      quotaState: { 'm1::k1': { cooldownUntil: 1, exhaustedOnPtDate: staleDate } },
      deadKeys: [],
      deadModels: [],
    });

    const clock = makeClock(PT_NOON);
    const router = createKeyPoolRouter({ stateStore: new JsonFileStore(file), now: clock.now, sleep: clock.sleep });
    const r = await router.call(['m1'], ['k1'], async () => 'ok');
    assert.equal(r.result, 'ok');

    // The original this is ported from deleted the whole pair entry on
    // success (quotaState.delete), marker included. The fix clears only the
    // cooldown; the day marker survives until the PT day flips.
    const persisted = JSON.parse(await readFile(file, 'utf8')) as {
      quotaState: Record<string, { cooldownUntil: number; exhaustedOnPtDate: string | null }>;
    };
    assert.equal(persisted.quotaState['m1::k1'].exhaustedOnPtDate, staleDate);
    assert.equal(persisted.quotaState['m1::k1'].cooldownUntil, 0);
  });
});

test('JsonFileStore: missing or corrupt file loads as empty state', async () => {
  await withTempDir(async (dir) => {
    const missing = new JsonFileStore(join(dir, 'nope.json'));
    assert.deepEqual(await missing.load(), emptyRouterState());

    const corruptPath = join(dir, 'corrupt.json');
    await writeFile(corruptPath, '{ not json', 'utf8');
    assert.deepEqual(await new JsonFileStore(corruptPath).load(), emptyRouterState());
  });
});

test('dead keys and dead models persist across restarts', async () => {
  await withTempDir(async (dir) => {
    const file = join(dir, 'router-state.json');
    const clock = makeClock(PT_NOON);

    const router1 = createKeyPoolRouter({ stateStore: new JsonFileStore(file), now: clock.now, sleep: clock.sleep });
    await assert.rejects(
      router1.call(['m1'], ['k1'], async () => {
        throw Object.assign(new Error('403 PERMISSION_DENIED'), { status: 403 });
      }),
      /403/,
    );

    const calls: string[] = [];
    const router2 = createKeyPoolRouter({ stateStore: new JsonFileStore(file), now: clock.now, sleep: clock.sleep });
    // k1 is dead on disk: the restarted router reports total exhaustion
    // without ever executing.
    await assert.rejects(
      router2.call(['m1'], ['k1'], async () => { calls.push('k1'); return 'ok'; }),
      /quota exhausted on every model/,
    );
    assert.deepEqual(calls, []);
  });
});

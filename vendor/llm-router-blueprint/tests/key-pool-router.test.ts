import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createKeyPoolRouter,
  maskApiKey,
  resolveApiKeys,
  resolveModelChain,
} from '../src/key-pool-router.js';
import {
  PT_NEXT_DAY,
  PT_NOON,
  invalidKeyError,
  makeClock,
  notFoundError,
  rpmError,
  rpdError,
  transientError,
} from './helpers.js';

test('rpm 429: pair cools down for rpmCooldownMs, the next key takes over', async () => {
  const clock = makeClock(PT_NOON);
  const router = createKeyPoolRouter({ now: clock.now, sleep: clock.sleep });
  let k1Fails = true;
  const calls: string[] = [];
  const exec = async (_m: string, k: string): Promise<string> => {
    calls.push(k);
    if (k === 'k1' && k1Fails) throw rpmError();
    return 'ok';
  };

  const r1 = await router.call(['m1'], ['k1', 'k2'], exec);
  assert.equal(r1.apiKey, 'k2');
  assert.deepEqual(calls, ['k1', 'k2']);

  // 1 s later k1 is still cooling — k2 serves directly, no retry on k1.
  calls.length = 0;
  clock.set(PT_NOON + 1_000);
  await router.call(['m1'], ['k1', 'k2'], exec);
  assert.deepEqual(calls, ['k2']);

  // After the 60 s cooldown k1 is eligible again (round-robin points at it).
  k1Fails = false;
  calls.length = 0;
  clock.set(PT_NOON + 61_000);
  const r3 = await router.call(['m1'], ['k1', 'k2'], exec);
  assert.equal(r3.apiKey, 'k1');
  assert.deepEqual(clock.sleeps, []);
});

test('rpd 429: pair is locked until the PT day flips; day locks are never awaited', async () => {
  const clock = makeClock(PT_NOON);
  const router = createKeyPoolRouter({ now: clock.now, sleep: clock.sleep });

  await assert.rejects(
    router.call(['m1'], ['k1'], async () => { throw rpdError(); }),
    /429/,
  );

  // 10 h later, same PT day (22:00 PT): still locked → immediate exhaustion error.
  clock.set(PT_NOON + 10 * 3_600_000);
  await assert.rejects(
    router.call(['m1'], ['k1'], async () => 'never called'),
    /quota exhausted on every model/,
  );
  // Day locks are never awaited — no sleep in the whole test.
  assert.deepEqual(clock.sleeps, []);

  // Midnight PT passed: the pair is free again.
  clock.set(PT_NEXT_DAY);
  const r = await router.call(['m1'], ['k1'], async () => 'ok');
  assert.equal(r.result, 'ok');
});

test('404: the model dies for all keys; the cascade moves to the next model', async () => {
  const clock = makeClock(PT_NOON);
  const router = createKeyPoolRouter({ now: clock.now, sleep: clock.sleep });
  const calls: string[] = [];
  const exec = async (m: string, k: string): Promise<string> => {
    calls.push(`${m}::${k}`);
    if (m === 'm1') throw notFoundError();
    return 'ok';
  };

  const r1 = await router.call(['m1', 'm2'], ['k1', 'k2'], exec);
  assert.equal(r1.model, 'm2');
  assert.deepEqual(calls, ['m1::k1', 'm2::k1']); // m1::k2 was never tried

  // The dead model is skipped entirely on later calls.
  calls.length = 0;
  await router.call(['m1', 'm2'], ['k1', 'k2'], exec);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].startsWith('m2::'));
});

test('401/403: the key dies across all models', async () => {
  const clock = makeClock(PT_NOON);
  const router = createKeyPoolRouter({ now: clock.now, sleep: clock.sleep });
  const calls: string[] = [];
  const exec = async (m: string, k: string): Promise<string> => {
    calls.push(`${m}::${k}`);
    if (k === 'k1') throw invalidKeyError();
    return 'ok';
  };

  const r1 = await router.call(['m1', 'm2'], ['k1', 'k2'], exec);
  assert.deepEqual(calls, ['m1::k1', 'm1::k2']);
  assert.equal(r1.apiKey, 'k2');

  // Even on a different model the dead key is never used again.
  calls.length = 0;
  const r2 = await router.call(['m2'], ['k1', 'k2'], exec);
  assert.deepEqual(calls, ['m2::k2']);
  assert.equal(r2.apiKey, 'k2');
});

test('transient 503 on a non-last candidate: no retry, model-wide lock, next model', async () => {
  const clock = makeClock(PT_NOON);
  const router = createKeyPoolRouter({
    now: clock.now,
    sleep: clock.sleep,
    retryAfterMs: 1_000,
    transientCooldownMs: 2_000,
  });
  const calls: string[] = [];
  const exec = async (m: string, k: string): Promise<string> => {
    calls.push(`${m}::${k}`);
    if (m === 'm1') throw transientError();
    return 'ok';
  };

  // m1::k1 is not the last candidate (m2::k1 follows) → no retry.
  const r1 = await router.call(['m1', 'm2'], ['k1'], exec);
  assert.equal(r1.model, 'm2');
  assert.deepEqual(calls, ['m1::k1', 'm2::k1']);
  assert.deepEqual(clock.sleeps, []);

  // The model-wide lock skips m1 immediately (its other keys are not tried).
  calls.length = 0;
  await router.call(['m1', 'm2'], ['k1'], exec);
  assert.deepEqual(calls, ['m2::k1']);
});

test('transient 503 on the last candidate: exactly one retry after retryAfterMs', async () => {
  const clock = makeClock(PT_NOON);
  const router = createKeyPoolRouter({ now: clock.now, sleep: clock.sleep, retryAfterMs: 1_000 });
  const calls: string[] = [];
  let failures = 1;
  const exec = async (m: string, k: string): Promise<string> => {
    calls.push(`${m}::${k}`);
    if (failures > 0) {
      failures -= 1;
      throw transientError();
    }
    return 'recovered';
  };

  const r = await router.call(['m1'], ['k1'], exec);
  assert.equal(r.result, 'recovered');
  assert.deepEqual(calls, ['m1::k1', 'm1::k1']);
  assert.deepEqual(clock.sleeps, [1_000]);
});

test('round-robin rotates keys across consecutive successful calls', async () => {
  const clock = makeClock(PT_NOON);
  const router = createKeyPoolRouter({ now: clock.now, sleep: clock.sleep });
  const seen: string[] = [];
  for (let i = 0; i < 4; i++) {
    await router.call(['m1'], ['k1', 'k2', 'k3'], async (_m, k) => {
      seen.push(k);
      return 'ok';
    });
  }
  assert.deepEqual(seen, ['k1', 'k2', 'k3', 'k1']);
});

test('model-major: every key of the first model is tried before the next model', async () => {
  const clock = makeClock(PT_NOON);
  const router = createKeyPoolRouter({ now: clock.now, sleep: clock.sleep });
  const calls: string[] = [];
  const r = await router.call(['m1', 'm2'], ['k1', 'k2'], async (m, k) => {
    calls.push(`${m}::${k}`);
    if (m === 'm1') throw rpmError();
    return 'ok';
  });
  assert.deepEqual(calls, ['m1::k1', 'm1::k2', 'm2::k1']);
  assert.equal(r.model, 'm2');
});

test('resolveModelChain: backgroundFirst reverses, overrideModel replaces only the primary', () => {
  const cfg = { primary: 'p', fallbacks: ['f1', 'f2'] };
  assert.deepEqual(resolveModelChain(cfg), ['p', 'f1', 'f2']);
  assert.deepEqual(resolveModelChain(cfg, { backgroundFirst: true }), ['f2', 'f1', 'p']);
  assert.deepEqual(resolveModelChain(cfg, { overrideModel: 'o' }), ['o', 'f1', 'f2']);
  // overrideModel wins over backgroundFirst and keeps the fallbacks.
  assert.deepEqual(resolveModelChain(cfg, { overrideModel: 'o', backgroundFirst: true }), ['o', 'f1', 'f2']);
  assert.deepEqual(resolveModelChain(null, { defaultModel: 'd' }), ['d']);
  assert.deepEqual(resolveModelChain({ primary: 'models/p' }), ['p']);
});

test('resolveApiKeys merges, splits and dedupes sources; maskApiKey hides the key', () => {
  assert.deepEqual(resolveApiKeys('a,b', 'b; c', 'a  d', null, undefined), ['a', 'b', 'c', 'd']);
  assert.equal(maskApiKey('abcdefgh'), '…efgh');
  assert.equal(maskApiKey('abcd'), '***');
  assert.equal(maskApiKey(''), '(no key)');
});

test('mutex: two parallel calls with a single free pair never run on it concurrently', async () => {
  const clock = makeClock(PT_NOON);
  const router = createKeyPoolRouter({ now: clock.now, sleep: clock.sleep });
  let active = 0;
  let maxActive = 0;
  const order: string[] = [];
  let releaseFirst!: () => void;
  const gate = new Promise<void>((resolve) => { releaseFirst = resolve; });

  const exec = async (_m: string, k: string): Promise<string> => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    order.push(`start:${k}`);
    if (order.length === 1) await gate; // the first call holds the pair
    active -= 1;
    order.push(`end:${k}`);
    return 'ok';
  };

  const p1 = router.call(['m1'], ['k1'], exec);
  const p2 = router.call(['m1'], ['k1'], exec);
  // Let p2 reach its wait state before releasing p1.
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(maxActive, 1);

  releaseFirst();
  const [r1, r2] = await Promise.all([p1, p2]);
  assert.equal(r1.apiKey, 'k1');
  assert.equal(r2.apiKey, 'k1');
  assert.equal(maxActive, 1);
  // The second call waited for the release, then used the same pair.
  assert.deepEqual(order, ['start:k1', 'end:k1', 'start:k1', 'end:k1']);
});

test('parallel calls spread across free pairs instead of piling onto one', async () => {
  const clock = makeClock(PT_NOON);
  const router = createKeyPoolRouter({ now: clock.now, sleep: clock.sleep });
  let active = 0;
  let maxActive = 0;
  const used: string[] = [];
  const exec = async (_m: string, k: string): Promise<string> => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    used.push(k);
    await new Promise((resolve) => setImmediate(resolve));
    active -= 1;
    return 'ok';
  };

  const [r1, r2] = await Promise.all([
    router.call(['m1'], ['k1', 'k2'], exec),
    router.call(['m1'], ['k1', 'k2'], exec),
  ]);
  assert.equal(maxActive, 2); // genuinely parallel
  assert.notEqual(r1.apiKey, r2.apiKey);
  assert.deepEqual([...used].sort(), ['k1', 'k2']);
});

test('total exhaustion with only short locks: waits for the earliest release', async () => {
  const clock = makeClock(PT_NOON);
  const router = createKeyPoolRouter({
    now: clock.now,
    sleep: clock.sleep,
    retryAfterMs: 1_000,
    rpmCooldownMs: 5_000,
  });

  // First call burns the only pair: retry after 1 s, then a 5 s cooldown.
  await assert.rejects(
    router.call(['m1'], ['k1'], async () => { throw rpmError(); }),
    /429/,
  );
  assert.deepEqual(clock.sleeps, [1_000]);
  // now = PT_NOON + 1_000, k1 cooling until PT_NOON + 6_000.

  const r = await router.call(['m1'], ['k1'], async () => 'ok');
  assert.equal(r.result, 'ok');
  // Waited exactly the remaining 5 s of the cooldown, never longer.
  assert.deepEqual(clock.sleeps, [1_000, 5_000]);
});

test('unknown errors are thrown immediately — no failover, no state mutation', async () => {
  const clock = makeClock(PT_NOON);
  const router = createKeyPoolRouter({ now: clock.now, sleep: clock.sleep });
  const unknown = Object.assign(new Error('400 invalid argument'), { status: 400 });
  const calls: string[] = [];
  await assert.rejects(
    router.call(['m1', 'm2'], ['k1', 'k2'], async (m, k) => {
      calls.push(`${m}::${k}`);
      throw unknown;
    }),
    (err: unknown) => err === unknown,
  );
  assert.deepEqual(calls, ['m1::k1']); // one attempt, no failover
  assert.deepEqual(clock.sleeps, []);
});

test('empty chain or empty key pool are rejected up front', async () => {
  const router = createKeyPoolRouter({ now: makeClock(PT_NOON).now });
  await assert.rejects(router.call([], ['k1'], async () => 'x'), /empty model chain/);
  await assert.rejects(router.call(['m1'], [], async () => 'x'), /no API keys/);
});

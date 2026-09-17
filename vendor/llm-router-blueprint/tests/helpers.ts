/** Shared test helpers: a controllable clock whose sleep advances time. */

// January: America/Los_Angeles is UTC-8, so 20:00 UTC = 12:00 PT.
export const PT_NOON = Date.parse('2026-01-10T20:00:00.000Z');
export const PT_NEXT_DAY = Date.parse('2026-01-11T20:00:00.000Z');

export function makeClock(startMs: number): {
  now: () => number;
  set: (ms: number) => void;
  sleeps: number[];
  sleep: (ms: number) => Promise<void>;
} {
  let now = startMs;
  const sleeps: number[] = [];
  return {
    now: () => now,
    set: (ms: number) => { now = ms; },
    sleeps,
    sleep: (ms: number) => {
      sleeps.push(ms);
      now += ms;
      return Promise.resolve();
    },
  };
}

export const silentLog = (): void => undefined;

export function errorWith(message: string, fields: Record<string, unknown> = {}): Error {
  return Object.assign(new Error(message), fields);
}

export const rpmError = (): Error => errorWith('429 quota exceeded for metric: generate_requests_per_model_per_minute', { status: 429 });
export const rpdError = (): Error => errorWith('429 RESOURCE_EXHAUSTED — quota exceeded for metric: generate_requests_per_model_per_day', { status: 429 });
export const notFoundError = (): Error => errorWith('404 models/m1 is not found for API version v1beta', { status: 404 });
export const invalidKeyError = (): Error => errorWith('403 PERMISSION_DENIED: API key not valid', { status: 403 });
export const transientError = (): Error => errorWith('503 UNAVAILABLE: experiencing high demand', { status: 503 });

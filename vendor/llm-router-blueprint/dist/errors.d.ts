/**
 * errors.ts — structured error classification for provider failover.
 *
 * Four disjoint classes decide the router's reaction:
 * - 'quota' (rpm | rpd): rate limit; locks the Model×Key pair (short
 *   cooldown for per-minute, until the PT day flips for per-day).
 * - 'invalid-model' (404): the model does not exist for this API — kills the
 *   model for every key; it will not recover within the process lifetime.
 * - 'invalid-key' (401/403): the key is invalid or lacks permission — kills
 *   the key across all models; the pool moves to the next project.
 * - 'transient': 5xx overload, client-side timeout abort, network failure —
 *   neither quota nor defect; the model recovers by itself.
 * null: unknown error. The router must throw it immediately and never fail
 * over — a real bug must not masquerade as rate limiting.
 *
 * Classification prefers structured fields (error.status / error.code /
 * error.response.status, or a nested Google-style error.error.{code,status}
 * body — e.g. an SDK ApiError carrying `status: 429`). Message-string
 * matching is the fallback when no structure is present.
 */
export type QuotaKind = 'rpm' | 'rpd';
export type ErrorClass = 'quota' | 'invalid-model' | 'invalid-key' | 'transient';
export interface ClassifiedError {
    class: ErrorClass;
    /** Only set when class === 'quota'. */
    quota?: QuotaKind;
}
/**
 * Classifies an error thrown by an executor. Structured fields win over
 * string matching; the message regexes mirror the battle-tested string
 * classifier this blueprint is ported from, so unstructured errors behave
 * exactly as before. A 429 without a per-day hint is conservatively treated
 * as a per-minute limit (cheaper to wait a minute than to burn a day).
 */
export declare function classifyError(err: unknown): ClassifiedError | null;

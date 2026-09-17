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

const DAY_QUOTA_RE = /per[-_ ]?day|daily/i;
const NETWORK_RE = /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|EPIPE|UND_ERR|socket hang up/i;
const ABORT_RE = /AbortError|operation was aborted/i;

interface ErrorFields {
  status?: number;
  code?: string;
  name?: string;
  message: string;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function extractFields(err: unknown): ErrorFields {
  const e = (err ?? {}) as Record<string, unknown>;
  const nested = (e.error ?? {}) as Record<string, unknown>;
  const response = (e.response ?? {}) as Record<string, unknown>;
  const message = err instanceof Error
    ? err.message
    : readString(e.message) ?? readString(nested.message) ?? String(err);
  return {
    // Numeric status: SDK ApiError `status`, fetch-style `statusCode`,
    // axios-style `response.status`, Google JSON body `error.code`.
    status: readNumber(e.status) ?? readNumber(e.statusCode) ?? readNumber(response.status) ?? readNumber(nested.code),
    // String code: gRPC-style `code`, `statusText`, Google JSON `error.status`.
    code: readString(e.code) ?? readString(e.statusText) ?? readString(nested.status),
    name: err instanceof Error ? err.name : readString(e.name),
    message,
  };
}

/**
 * Classifies an error thrown by an executor. Structured fields win over
 * string matching; the message regexes mirror the battle-tested string
 * classifier this blueprint is ported from, so unstructured errors behave
 * exactly as before. A 429 without a per-day hint is conservatively treated
 * as a per-minute limit (cheaper to wait a minute than to burn a day).
 */
export function classifyError(err: unknown): ClassifiedError | null {
  const { status, code, name, message } = extractFields(err);
  const codeUp = code?.toUpperCase();

  if (
    status === 429 || codeUp === 'RESOURCE_EXHAUSTED'
    || message.includes('429') || message.includes('RESOURCE_EXHAUSTED')
  ) {
    return { class: 'quota', quota: DAY_QUOTA_RE.test(message) ? 'rpd' : 'rpm' };
  }

  if (
    status === 404 || codeUp === 'NOT_FOUND'
    || (message.includes('404') && (/not[-_ ]?found/i.test(message) || message.includes('NOT_FOUND')))
  ) {
    return { class: 'invalid-model' };
  }

  if (
    status === 401 || status === 403
    || codeUp === 'UNAUTHENTICATED' || codeUp === 'PERMISSION_DENIED'
    || /API[-_ ]?key not valid|API_KEY_INVALID|PERMISSION_DENIED/i.test(message)
    || /\b401\b/.test(message) || /\b403\b/.test(message)
  ) {
    return { class: 'invalid-key' };
  }

  if (
    (status !== undefined && status >= 500 && status < 600)
    || codeUp === 'UNAVAILABLE' || codeUp === 'INTERNAL'
    || name === 'AbortError'
    || /\b(500|502|503|504)\b/.test(message) || /UNAVAILABLE|INTERNAL/.test(message)
    || ABORT_RE.test(message) || NETWORK_RE.test(message)
  ) {
    return { class: 'transient' };
  }

  return null;
}

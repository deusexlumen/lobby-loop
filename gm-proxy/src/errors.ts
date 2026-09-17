/*
 * PURPOSE: Fehlertypen des GM-Proxy (HTTP-400/503 vs. LLM-Ausfall)
 * ARCHITECTURE: gm-proxy/errors
 * DEPENDENCIES: none
 * PIPELINE: runtime, test
 * LAST_VALIDATED: 2026-09-17
 */

/** Client-Fehler (Bad Request) — führt zu HTTP 400 mit {"error": ...}. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** LLM-Ausfall nach strukturiertem Retry — führt zu HTTP 503 mit {"error": ..., "fallback": true}. */
export class GmUnavailableError extends Error {
  constructor(
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'GmUnavailableError';
  }
}

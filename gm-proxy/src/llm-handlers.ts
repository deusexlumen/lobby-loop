/*
 * PURPOSE: LLM-gestützte GmHandlers — Prompt → Call → JSON-Extraktion → Validierung, genau ein Retry, sonst 503
 * ARCHITECTURE: gm-proxy/llm-core
 * DEPENDENCIES: ./errors.js, ./json-extract.js, ./prompt.js, ./types.js, ./validate.js
 * PIPELINE: runtime, test
 * LAST_VALIDATED: 2026-09-17
 */
import { GmUnavailableError } from './errors.js';
import { extractJsonObject } from './json-extract.js';
import {
  buildActionPrompt,
  buildMinigameJudgePrompt,
  buildMinigameRoundPrompt,
  buildResultPrompt,
  loadSystemPrompt,
} from './prompt.js';
import type { GmHandlers } from './types.js';
import {
  validateGmResponse,
  validateMinigameJudgeResponse,
  validateMinigameRoundResponse,
} from './validate.js';

export interface LlmCallOptions {
  maxTokens?: number;
  temperature?: number;
}

/** Der injizierbare Seam: ein Prompt rein, Rohtext eines LLM-Aufrufs raus. */
export type LlmCaller = (prompt: string, options?: LlmCallOptions) => Promise<string>;

const RETRY_ATTEMPTS = 2;

const describe = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

/**
 * Baut die produktiven Handler über einen beliebigen LlmCaller
 * (Produktion: Gemini via llm-router-blueprint; Tests: Mock).
 */
export function createGmHandlers(call: LlmCaller): GmHandlers {
  const systemPrompt = loadSystemPrompt();

  const run = async <T>(
    buildPrompt: () => string,
    validate: (candidate: unknown) => T | null,
    options: LlmCallOptions,
  ): Promise<T> => {
    const prompt = `${systemPrompt}\n\n---\n\n${buildPrompt()}`;
    let lastIssue = 'unbekannt';
    for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
      let text: string;
      try {
        text = await call(prompt, options);
      } catch (err) {
        throw new GmUnavailableError(`LLM-Aufruf fehlgeschlagen: ${describe(err)}`, { cause: err });
      }
      const candidate = extractJsonObject(text);
      if (candidate === null) {
        lastIssue = 'kein parsebares JSON';
        continue;
      }
      const parsed = validate(candidate);
      if (parsed === null) {
        lastIssue = 'Schema-Verletzung';
        continue;
      }
      return parsed;
    }
    throw new GmUnavailableError(
      `LLM-Antwort nach ${RETRY_ATTEMPTS} Versuchen ungültig (${lastIssue}).`,
    );
  };

  return {
    action: (req) =>
      run(() => buildActionPrompt(req), validateGmResponse, { maxTokens: 400, temperature: 0.8 }),
    result: (req) =>
      run(() => buildResultPrompt(req), validateGmResponse, { maxTokens: 400, temperature: 0.8 }),
    minigameRound: (req) =>
      run(
        () => buildMinigameRoundPrompt(req),
        validateMinigameRoundResponse,
        { maxTokens: 512, temperature: 0.9 },
      ),
    minigameJudge: (req) =>
      run(
        () => buildMinigameJudgePrompt(req),
        validateMinigameJudgeResponse,
        { maxTokens: 256, temperature: 0.6 },
      ),
  };
}

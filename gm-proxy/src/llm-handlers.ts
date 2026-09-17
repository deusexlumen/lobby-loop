/*
 * PURPOSE: LLM-gestützte GmHandlers — Prompt → Call → JSON-Extraktion → Validierung, genau ein Retry, sonst 503
 * ARCHITECTURE: gm-proxy/llm-core
 * DEPENDENCIES: ./chronicle.js, ./errors.js, ./json-extract.js, ./prompt.js, ./types.js, ./validate.js
 * PIPELINE: runtime, test
 * LAST_VALIDATED: 2026-09-17
 */
import {
  createMemoryChronicleStore,
  sanitizeSessionId,
  type ChronicleEntry,
  type ChronicleStore,
} from './chronicle.js';
import { GmUnavailableError } from './errors.js';
import { extractJsonObject } from './json-extract.js';
import {
  buildActionPrompt,
  buildEpitaphPrompt,
  buildMinigameJudgePrompt,
  buildMinigameRoundPrompt,
  buildResultPrompt,
  loadEpitaphPrompt,
  loadSystemPrompt,
} from './prompt.js';
import type { GmActionRequest, GmHandlers, GmResultRequest } from './types.js';
import {
  validateEpitaphResponse,
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
/** Wieviele Chronik-Einträge in den Prompt injiziert werden. */
const CHRONICLE_PROMPT_LIMIT = 10;

const describe = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

/**
 * Baut die produktiven Handler über einen beliebigen LlmCaller
 * (Produktion: Gemini via llm-router-blueprint; Tests: Mock).
 * Optional ein ChronicleStore — Default In-Memory; niemals blockierend.
 */
export function createGmHandlers(call: LlmCaller, chronicle: ChronicleStore = createMemoryChronicleStore()): GmHandlers {
  const systemPrompt = loadSystemPrompt();
  const epitaphPrompt = loadEpitaphPrompt();

  const run = async <T>(
    buildPrompt: () => string,
    validate: (candidate: unknown) => T | null,
    options: LlmCallOptions,
    system: string = systemPrompt,
  ): Promise<T> => {
    const prompt = `${system}\n\n---\n\n${buildPrompt()}`;
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

  /** Lädt die Chronik-Sektion für einen Request (nur bei gültiger, sanitisierter Session-ID). */
  const chronicleFor = (req: GmActionRequest | GmResultRequest): ChronicleEntry[] => {
    if (req.session_id === undefined) return [];
    const sessionId = sanitizeSessionId(req.session_id);
    if (sessionId === null) return [];
    return chronicle.recent(sessionId, CHRONICLE_PROMPT_LIMIT);
  };

  /** Merkt ein validiertes Event als Fakten-Eintrag — best-effort, kehrt niemals werfend zurück. */
  const remember = (req: GmActionRequest | GmResultRequest, triggerEvent: unknown): void => {
    if (req.session_id === undefined) return;
    const sessionId = sanitizeSessionId(req.session_id);
    if (sessionId === null) return;
    chronicle.append(sessionId, {
      ts: new Date().toISOString(),
      scene: req.current_scene,
      player_input: req.player_input,
      trigger_event: triggerEvent,
      alignment: req.alignment_score,
      discipline: req.fraktionsdisziplin ?? null,
    });
  };

  return {
    action: async (req) => {
      const history = chronicleFor(req);
      const res = await run(
        () => buildActionPrompt(req, history),
        validateGmResponse,
        { maxTokens: 400, temperature: 0.8 },
      );
      remember(req, res.trigger_event);
      return res;
    },
    result: async (req) => {
      const history = chronicleFor(req);
      const res = await run(
        () => buildResultPrompt(req, history),
        validateGmResponse,
        { maxTokens: 400, temperature: 0.8 },
      );
      remember(req, res.trigger_event);
      return res;
    },
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
    epitaph: (req) =>
      run(
        () => buildEpitaphPrompt(req),
        validateEpitaphResponse,
        { maxTokens: 400, temperature: 0.8 },
        epitaphPrompt,
      ),
  };
}

/*
 * PURPOSE: LLM-gestützte GmHandlers — Prompt → Call → JSON-Extraktion → Validierung, genau ein Retry, sonst 503
 * ARCHITECTURE: gm-proxy/llm-core
 * DEPENDENCIES: ./chronicle.js, ./errors.js, ./json-extract.js, ./prompt.js, ./schemas.js, ./types.js, ./validate.js
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
import {
  EPITAPH_SCHEMA,
  GM_RESPONSE_SCHEMA,
  MINIGAME_JUDGE_SCHEMA,
  MINIGAME_ROUND_SCHEMA,
} from './schemas.js';
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
  /**
   * System-Prompt, getrennt vom Task-Prompt. Ein Caller ohne eigenen
   * Instruktions-Slot darf ihn dem Prompt voranstellen; der Gemini-Caller
   * reicht ihn an `systemInstruction` weiter.
   */
  system?: string;
  /** JSON-Schema der erwarteten Antwort (Structured Output), falls unterstützt. */
  schema?: unknown;
  /**
   * Vorprüfung der Rohantwort im Transport. Der Router wertet ein `false` als
   * verbrauchten Kandidaten und wechselt Modell/Key, statt die kaputte
   * Antwort hierher zurückzugeben.
   */
  validate?: (text: string) => boolean;
}

/** Der injizierbare Seam: ein Prompt rein, Rohtext eines LLM-Aufrufs raus. */
export type LlmCaller = (prompt: string, options?: LlmCallOptions) => Promise<string>;

/**
 * Versuche auf Handler-Ebene. Zwei Ebenen, zwei Aufgaben: Der Router wechselt
 * innerhalb EINES Aufrufs den Kandidaten (anderes Modell, anderer Key), dieser
 * Retry zieht eine frische Stichprobe — denselben Kandidaten noch einmal, was
 * der Router pro Aufruf bewusst nicht tut.
 */
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
    const prompt = buildPrompt();
    // Dieselbe Prüfung, die unten das typisierte Objekt liefert — hier nur als
    // Ja/Nein für den Transport, damit der Router failovern kann, bevor die
    // unbrauchbare Antwort überhaupt hier ankommt.
    const accepts = (text: string): boolean => {
      const candidate = extractJsonObject(text);
      return candidate !== null && validate(candidate) !== null;
    };
    let lastIssue = 'unbekannt';
    for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
      let text: string;
      try {
        text = await call(prompt, { ...options, system, validate: accepts });
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
        { maxTokens: 400, temperature: 0.8, schema: GM_RESPONSE_SCHEMA },
      );
      remember(req, res.trigger_event);
      return res;
    },
    result: async (req) => {
      const history = chronicleFor(req);
      const res = await run(
        () => buildResultPrompt(req, history),
        validateGmResponse,
        { maxTokens: 400, temperature: 0.8, schema: GM_RESPONSE_SCHEMA },
      );
      remember(req, res.trigger_event);
      return res;
    },
    minigameRound: (req) =>
      run(
        () => buildMinigameRoundPrompt(req),
        validateMinigameRoundResponse,
        { maxTokens: 512, temperature: 0.9, schema: MINIGAME_ROUND_SCHEMA },
      ),
    minigameJudge: (req) =>
      run(
        () => buildMinigameJudgePrompt(req),
        validateMinigameJudgeResponse,
        { maxTokens: 256, temperature: 0.6, schema: MINIGAME_JUDGE_SCHEMA },
      ),
    epitaph: (req) =>
      run(
        () => buildEpitaphPrompt(req),
        validateEpitaphResponse,
        { maxTokens: 400, temperature: 0.8, schema: EPITAPH_SCHEMA },
        epitaphPrompt,
      ),
  };
}

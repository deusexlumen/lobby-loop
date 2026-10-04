/*
 * PURPOSE: Gemini-LlmCaller via llm-router-blueprint (Model-Chain, Key-Pool, JsonFileStore-State)
 * ARCHITECTURE: gm-proxy/llm-transport
 * DEPENDENCIES: @google/genai, llm-router-blueprint, ./llm-handlers.js
 * PIPELINE: runtime
 * LAST_VALIDATED: 2026-09-17
 */
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { JsonFileStore, createLLMOrchestrator } from 'llm-router-blueprint';
import type { LlmCallOptions, LlmCaller } from './llm-handlers.js';

/*
 * Modellkette: Die 2.5er-Generation laeuft auf der Developer API aus
 * (gemini-2.5-flash zum 16.10.2026, flash-lite bereits deprecated), und der
 * Free Tier fuehrt nur noch Flash und Flash-Lite. Beide IDs sind per Env
 * ueberschreibbar — bei einer Umbenennung reicht GEMINI_MODEL_PRIMARY.
 */
const DEFAULT_PRIMARY = 'gemini-3-flash';
const DEFAULT_FALLBACK = 'gemini-3.1-flash-lite';
const ROUTER_STATE_FILE = 'gm-proxy/router-state.json';

/**
 * Verdrahtet den Blueprint-Orchestrator mit @google/genai:
 * Primary/Fallback aus Env, Key-Pool aus GEMINI_API_KEY/GEMINI_API_KEYS,
 * Thinking-Konfiguration modellpräfix-abhängig, Quota-State persistent.
 */
export function createGeminiLlmCaller(env: NodeJS.ProcessEnv = process.env): LlmCaller {
  const orchestrator = createLLMOrchestrator<GoogleGenAI>({
    apiKeys: () => [env.GEMINI_API_KEY, env.GEMINI_API_KEYS],
    getModelChainConfig: () => ({
      primary: env.GEMINI_MODEL_PRIMARY ?? DEFAULT_PRIMARY,
      fallbacks: [env.GEMINI_MODEL_FALLBACK ?? DEFAULT_FALLBACK],
    }),
    createClient: (apiKey) => new GoogleGenAI({ apiKey }),
    exec: async (ai, req) => {
      const isGemini3 = req.model.startsWith('gemini-3');
      const response = await ai.models.generateContent({
        model: req.model,
        contents: req.prompt,
        config: {
          // Fuer 3.x bewusst NICHT gesetzt: Google empfiehlt die Defaults und
          // nennt Werte unter 1.0 ausdruecklich als Ursache von Loops und
          // schwaecherer Instruktionstreue. Bei uns hiesse ein Loop:
          // MAX_TOKENS -> unparsebares JSON -> 503 -> Offline-Modus, also ein
          // Parameterproblem, das wie ein API-Ausfall aussieht.
          ...(isGemini3 ? {} : { temperature: req.temperature }),
          maxOutputTokens: req.maxTokens,
          // 2.5er verstehen nur thinkingBudget (0 = aus), 3er nur thinkingLevel.
          ...(isGemini3
            ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
            : req.model.startsWith('gemini-2.5')
              ? { thinkingConfig: { thinkingBudget: 0 } }
              : {}),
          // Rolle und Output-Vertrag in den Instruktions-Slot; die freie
          // Spielereingabe bleibt im User-Turn.
          ...(req.system === undefined ? {} : { systemInstruction: req.system }),
          // responseJsonSchema verlangt zwingend einen responseMimeType.
          ...(req.schema === undefined
            ? {}
            : { responseMimeType: 'application/json', responseJsonSchema: req.schema }),
        },
      });
      return {
        text: response.text ?? '',
        finishReason: response.candidates?.[0]?.finishReason,
      };
    },
    routerOptions: { stateStore: new JsonFileStore(ROUTER_STATE_FILE), log: console.warn },
  });

  return (prompt, options: LlmCallOptions = {}) =>
    orchestrator.callLLM(prompt, {
      maxTokens: options.maxTokens ?? 512,
      temperature: options.temperature ?? 0.7,
      system: options.system,
      schema: options.schema,
      // Eine schemawidrige Antwort kostet im Router den Kandidaten: Das
      // schwaechere Fallback-Modell weicht dem naechsten, statt den Handler
      // in seinen eigenen Retry zu zwingen.
      validate: options.validate,
    });
}

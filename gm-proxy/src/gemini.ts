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

const DEFAULT_PRIMARY = 'gemini-2.5-flash';
const DEFAULT_FALLBACK = 'gemini-2.5-flash-lite';
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
      const response = await ai.models.generateContent({
        model: req.model,
        contents: req.prompt,
        config: {
          temperature: req.temperature,
          maxOutputTokens: req.maxTokens,
          // 2.5er verstehen nur thinkingBudget (0 = aus), 3er nur thinkingLevel.
          ...(req.model.startsWith('gemini-3')
            ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
            : req.model.startsWith('gemini-2.5')
              ? { thinkingConfig: { thinkingBudget: 0 } }
              : {}),
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
    });
}

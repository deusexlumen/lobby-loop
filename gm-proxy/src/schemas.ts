/*
 * PURPOSE: JSON-Schemas der GM-Antworten für Geminis Structured Output (responseJsonSchema)
 * ARCHITECTURE: gm-proxy/contracts
 * DEPENDENCIES: none
 * PIPELINE: runtime, test
 * LAST_VALIDATED: 2026-10-04
 */

/**
 * Diese Schemas erzwingen die Form, die `validate.ts` prüft — sie ersetzen
 * sie nicht. Das Schema spart den Rateweg über den Prompt, der Validator
 * bleibt die Instanz, die entscheidet: Ein Provider ohne Structured-Output
 * (Offline-Modus, OpenAI-kompatible Kette, Mock im Test) liefert weiterhin
 * freies JSON, und auch ein schemagebundener Treffer kann semantisch falsch
 * sein (DC 20 für einen Handschlag ist schemakonform).
 *
 * Nur die von `responseJsonSchema` unterstützte Teilmenge von JSON Schema
 * verwenden: type, enum, properties, required, items, minItems/maxItems,
 * minimum/maximum, anyOf/oneOf, additionalProperties. `oneOf` wird dabei wie
 * `anyOf` gelesen — die Disjunktheit des Command-Event-Enums prüft weiterhin
 * `validateTriggerEvent`.
 */

const str = { type: 'string' } as const;

/** Ein Command-Event-Objekt des geschlossenen Enums. */
const event = (
  type: string,
  props: Record<string, unknown> = {},
): Record<string, unknown> => ({
  type: 'object',
  properties: { type: { type: 'string', enum: [type] }, ...props },
  required: ['type', ...Object.keys(props)],
  additionalProperties: false,
});

const TRIGGER_EVENT = {
  anyOf: [
    { type: 'null' },
    event('add_item', { item: str }),
    event('remove_item', { item: str }),
    event('change_scene', { scene: str }),
    event('modify_stat', {
      stat: { type: 'string', enum: ['alignment', 'discipline'] },
      delta: { type: 'integer', minimum: -99, maximum: 99 },
    }),
    event('start_minigame'),
  ],
};

/** /gm/action und /gm/result. */
export const GM_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    gm_dialogue: str,
    required_roll: str,
    difficulty_class: { type: 'integer', minimum: 1, maximum: 20 },
    trigger_event: TRIGGER_EVENT,
  },
  required: ['gm_dialogue', 'required_roll', 'difficulty_class', 'trigger_event'],
  additionalProperties: false,
} as const;

/** /minigame/round — genau drei Phrasen, sonst ist die Runde unspielbar. */
export const MINIGAME_ROUND_SCHEMA = {
  type: 'object',
  properties: {
    accusation: str,
    phrases: { type: 'array', items: str, minItems: 3, maxItems: 3 },
  },
  required: ['accusation', 'phrases'],
  additionalProperties: false,
} as const;

/** /minigame/judge. */
export const MINIGAME_JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    correct: { type: 'boolean' },
    correct_index: { type: 'integer', minimum: 0, maximum: 2 },
    commentary: str,
  },
  required: ['correct', 'correct_index', 'commentary'],
  additionalProperties: false,
} as const;

/** /run/epitaph — genau drei Highlights. */
export const EPITAPH_SCHEMA = {
  type: 'object',
  properties: {
    epitaph: str,
    highlights: { type: 'array', items: str, minItems: 3, maxItems: 3 },
  },
  required: ['epitaph', 'highlights'],
  additionalProperties: false,
} as const;

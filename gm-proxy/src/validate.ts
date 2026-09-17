/*
 * PURPOSE: Hand-gerollte Validierung aller Request-/Response-Payloads des GM-Proxy
 * ARCHITECTURE: gm-proxy/validation
 * DEPENDENCIES: ./types.js
 * PIPELINE: runtime, test
 * LAST_VALIDATED: 2026-09-17
 */
import type {
  GmActionRequest,
  GmResponse,
  GmResultRequest,
  MinigameJudgeRequest,
  MinigameJudgeResponse,
  MinigameRoundRequest,
  MinigameRoundResponse,
  Roll,
  TriggerEvent,
} from './types.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isIntegerInRange = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string');

/** "W20"-Style-Würfelkennzeichnung; "none" markiert Folgeaktionen ohne Wurf. */
const isDiceLabel = (value: unknown): value is string =>
  isNonEmptyString(value) && (/^W\d+$/i.test(value) || value.toLowerCase() === 'none');

/** Geschlossenes Trigger-Enum: unbekannter Typ oder fehlende Felder -> invalid. */
export function validateTriggerEvent(value: unknown): TriggerEvent | null {
  if (!isRecord(value) || !isNonEmptyString(value.type)) return null;
  switch (value.type) {
    case 'add_item':
      return isNonEmptyString(value.item) ? { type: 'add_item', item: value.item } : null;
    case 'remove_item':
      return isNonEmptyString(value.item) ? { type: 'remove_item', item: value.item } : null;
    case 'change_scene':
      return isNonEmptyString(value.scene) ? { type: 'change_scene', scene: value.scene } : null;
    case 'modify_stat':
      if (value.stat !== 'alignment' && value.stat !== 'discipline') return null;
      if (!isIntegerInRange(value.delta, -99, 99)) return null;
      return { type: 'modify_stat', stat: value.stat, delta: value.delta };
    case 'start_minigame':
      return { type: 'start_minigame' };
    default:
      return null;
  }
}

export function validateActionRequest(body: unknown): GmActionRequest | null {
  if (!isRecord(body)) return null;
  if (!isStringArray(body.player_inventory)) return null;
  if (!isNonEmptyString(body.current_scene)) return null;
  if (!isFiniteNumber(body.alignment_score)) return null;
  if (!isNonEmptyString(body.player_input)) return null;
  const req: GmActionRequest = {
    player_inventory: body.player_inventory,
    current_scene: body.current_scene,
    alignment_score: body.alignment_score,
    player_input: body.player_input,
  };
  if (body.fraktionsdisziplin !== undefined) {
    if (!isFiniteNumber(body.fraktionsdisziplin)) return null;
    req.fraktionsdisziplin = body.fraktionsdisziplin;
  }
  return req;
}

function validateRoll(body: unknown): Roll | null {
  if (!isRecord(body)) return null;
  if (!isDiceLabel(body.dice)) return null;
  if (!isIntegerInRange(body.value, 1, 1000)) return null;
  if (!isFiniteNumber(body.total)) return null;
  if (!isIntegerInRange(body.difficulty_class, 1, 20)) return null;
  if (typeof body.success !== 'boolean') return null;
  if (!Array.isArray(body.bonuses)) return null;
  const bonuses: Roll['bonuses'] = [];
  for (const bonus of body.bonuses) {
    if (!isRecord(bonus)) return null;
    if (!isNonEmptyString(bonus.source)) return null;
    if (!isFiniteNumber(bonus.value)) return null;
    bonuses.push({ source: bonus.source, value: bonus.value });
  }
  return {
    dice: body.dice,
    value: body.value,
    bonuses,
    total: body.total,
    difficulty_class: body.difficulty_class,
    success: body.success,
  };
}

export function validateResultRequest(body: unknown): GmResultRequest | null {
  const base = validateActionRequest(body);
  if (base === null || !isRecord(body)) return null;
  const roll = validateRoll(body.roll);
  if (roll === null) return null;
  return { ...base, roll };
}

export function validateMinigameRoundRequest(body: unknown): MinigameRoundRequest | null {
  if (!isRecord(body)) return null;
  if (!isNonEmptyString(body.current_scene)) return null;
  if (!isFiniteNumber(body.alignment_score)) return null;
  if (!isIntegerInRange(body.round, 1, 99)) return null;
  if (!isIntegerInRange(body.won_rounds, 0, 99)) return null;
  if (!isIntegerInRange(body.lost_rounds, 0, 99)) return null;
  return {
    current_scene: body.current_scene,
    alignment_score: body.alignment_score,
    round: body.round,
    won_rounds: body.won_rounds,
    lost_rounds: body.lost_rounds,
  };
}

export function validateMinigameJudgeRequest(body: unknown): MinigameJudgeRequest | null {
  if (!isRecord(body)) return null;
  if (!isNonEmptyString(body.accusation)) return null;
  if (!isIntegerInRange(body.chosen_index, 0, 2)) return null;
  if (!isNonEmptyString(body.phrase)) return null;
  return { accusation: body.accusation, chosen_index: body.chosen_index, phrase: body.phrase };
}

export function validateGmResponse(body: unknown): GmResponse | null {
  if (!isRecord(body)) return null;
  if (!isNonEmptyString(body.gm_dialogue)) return null;
  if (!isDiceLabel(body.required_roll)) return null;
  if (!isIntegerInRange(body.difficulty_class, 1, 20)) return null;
  let triggerEvent: TriggerEvent | null = null;
  if (body.trigger_event !== null && body.trigger_event !== undefined) {
    const event = validateTriggerEvent(body.trigger_event);
    if (event === null) return null;
    triggerEvent = event;
  }
  return {
    gm_dialogue: body.gm_dialogue,
    required_roll: body.required_roll,
    difficulty_class: body.difficulty_class,
    trigger_event: triggerEvent,
  };
}

export function validateMinigameRoundResponse(body: unknown): MinigameRoundResponse | null {
  if (!isRecord(body)) return null;
  if (!isNonEmptyString(body.accusation)) return null;
  if (!Array.isArray(body.phrases) || body.phrases.length !== 3) return null;
  if (!body.phrases.every((phrase) => isNonEmptyString(phrase))) return null;
  return { accusation: body.accusation, phrases: [...body.phrases] };
}

export function validateMinigameJudgeResponse(body: unknown): MinigameJudgeResponse | null {
  if (!isRecord(body)) return null;
  if (typeof body.correct !== 'boolean') return null;
  if (!isIntegerInRange(body.correct_index, 0, 2)) return null;
  if (!isNonEmptyString(body.commentary)) return null;
  return {
    correct: body.correct,
    correct_index: body.correct_index,
    commentary: body.commentary,
  };
}

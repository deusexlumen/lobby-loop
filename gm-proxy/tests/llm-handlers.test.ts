/*
 * PURPOSE: Tests der LLM-Handler: Happy Path, Retry bei ungültigem JSON, 503 nach 2 Fehlversuchen
 * ARCHITECTURE: gm-proxy/tests
 * DEPENDENCIES: node:test, node:assert/strict, ../src/errors.js, ../src/llm-handlers.js
 * PIPELINE: test
 * LAST_VALIDATED: 2026-09-17
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { GmUnavailableError } from '../src/errors.js';
import { createGmHandlers, type LlmCaller } from '../src/llm-handlers.js';

const ACTION_REQUEST = {
  player_inventory: ['unschuldsvermutung'],
  current_scene: 'kommunalpolitik',
  alignment_score: -2,
  player_input: 'Dem Bürgermeister die Hand schütteln.',
};

const ACTION_LLM_JSON = JSON.stringify({
  gm_dialogue: 'Der Aktenkoffer rattert anerkennend.',
  required_roll: 'W20',
  difficulty_class: 10,
  trigger_event: null,
});

test('action: valide LLM-Antwort wird geparst und validiert', async () => {
  const calls: string[] = [];
  const call: LlmCaller = async (prompt) => {
    calls.push(prompt);
    return ACTION_LLM_JSON;
  };
  const handlers = createGmHandlers(call);
  const res = await handlers.action(ACTION_REQUEST);
  assert.equal(res.difficulty_class, 10);
  assert.equal(res.trigger_event, null);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /Aktionsbewertung/);
  assert.match(calls[0], /System-Prompt|Game Master/);
});

test('action: ungültiges JSON → strukturierter Retry → Erfolg', async () => {
  let attempts = 0;
  const call: LlmCaller = async () => {
    attempts++;
    return attempts === 1 ? 'Kein JSON, nur Prosa mit einer Klammer { drin.' : ACTION_LLM_JSON;
  };
  const handlers = createGmHandlers(call);
  const res = await handlers.action(ACTION_REQUEST);
  assert.equal(res.difficulty_class, 10);
  assert.equal(attempts, 2);
});

test('action: Schema-Verletzung → Retry → Erfolg', async () => {
  let attempts = 0;
  const call: LlmCaller = async () => {
    attempts++;
    return attempts === 1
      ? JSON.stringify({ gm_dialogue: 'Falsches Schema.', required_roll: 'W20', difficulty_class: 99 })
      : ACTION_LLM_JSON;
  };
  const handlers = createGmHandlers(call);
  const res = await handlers.action(ACTION_REQUEST);
  assert.equal(attempts, 2);
  assert.equal(res.difficulty_class, 10);
});

test('action: dauerhaft ungültige Antwort → GmUnavailableError', async () => {
  const call: LlmCaller = async () => '###json\n{"gm_dialogue"';
  const handlers = createGmHandlers(call);
  await assert.rejects(() => handlers.action(ACTION_REQUEST), (err: unknown) => {
    assert.ok(err instanceof GmUnavailableError);
    assert.match(err.message, /2 Versuchen/);
    return true;
  });
});

test('action: geworfener LLM-Fehler wird als GmUnavailableError weitergereicht', async () => {
  const call: LlmCaller = async () => {
    throw new Error('quota exhausted');
  };
  const handlers = createGmHandlers(call);
  await assert.rejects(() => handlers.action(ACTION_REQUEST), GmUnavailableError);
});

test('result: valide Antwort mit Event', async () => {
  const call: LlmCaller = async () =>
    JSON.stringify({
      gm_dialogue: 'Gescheitert. Der Koffer wird konfisziert.',
      required_roll: 'none',
      difficulty_class: 14,
      trigger_event: { type: 'remove_item', item: 'schwarzer_koffer' },
    });
  const handlers = createGmHandlers(call);
  const res = await handlers.result({
    ...ACTION_REQUEST,
    roll: {
      dice: 'W20',
      value: 3,
      bonuses: [],
      total: 3,
      difficulty_class: 14,
      success: false,
    },
  });
  assert.deepEqual(res.trigger_event, { type: 'remove_item', item: 'schwarzer_koffer' });
  assert.equal(res.required_roll, 'none');
});

test('minigameRound: Antwort mit genau 3 Phrasen', async () => {
  const call: LlmCaller = async (prompt) => {
    assert.match(prompt, /Beleidigungsfechten/);
    return JSON.stringify({
      accusation: 'Sie haben den Fahrradweg an Ihr Grundstück gezogen!',
      phrases: ['Vision vor Karte.', 'Ich besitze nichts.', 'Verkehrswende-Sieg.'],
    });
  };
  const handlers = createGmHandlers(call);
  const res = await handlers.minigameRound({
    current_scene: 'untersuchungsausschuss',
    alignment_score: -4,
    round: 1,
    won_rounds: 0,
    lost_rounds: 0,
  });
  assert.equal(res.phrases.length, 3);
});

test('minigameJudge: Zwei-Request-Fluss (round → judge)', async () => {
  const scripted: string[] = [
    JSON.stringify({
      accusation: 'Vorwurf!',
      phrases: ['a', 'b', 'c'],
    }),
    JSON.stringify({ correct: true, correct_index: 1, commentary: 'Formal unangreifbar.' }),
  ];
  let idx = 0;
  const call: LlmCaller = async () => scripted[idx++]!;
  const handlers = createGmHandlers(call);

  const round = await handlers.minigameRound({
    current_scene: 'untersuchungsausschuss',
    alignment_score: -4,
    round: 2,
    won_rounds: 1,
    lost_rounds: 0,
  });
  const judge = await handlers.minigameJudge({
    accusation: round.accusation,
    chosen_index: 1,
    phrase: round.phrases[1]!,
  });
  assert.equal(judge.correct, true);
  assert.equal(judge.correct_index, 1);
});

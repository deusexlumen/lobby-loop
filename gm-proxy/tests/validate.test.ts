/*
 * PURPOSE: Unit-Tests der hand-gerollten Payload-Validatoren (akzeptiert/lehnt ab)
 * ARCHITECTURE: gm-proxy/tests
 * DEPENDENCIES: node:test, node:assert/strict, ../src/validate.js
 * PIPELINE: test
 * LAST_VALIDATED: 2026-09-17
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateActionRequest,
  validateGmResponse,
  validateMinigameJudgeRequest,
  validateMinigameJudgeResponse,
  validateMinigameRoundRequest,
  validateMinigameRoundResponse,
  validateResultRequest,
  validateTriggerEvent,
} from '../src/validate.js';

const VALID_ACTION = {
  player_inventory: ['unschuldsvermutung', 'schwarzer_koffer'],
  current_scene: 'untersuchungsausschuss',
  alignment_score: -4,
  fraktionsdisziplin: 5,
  player_input: 'Ich biete dem Vorsitzenden einen Aufsichtsratsposten an.',
};

test('validateActionRequest akzeptiert gültigen Request', () => {
  const parsed = validateActionRequest(VALID_ACTION);
  assert.notEqual(parsed, null);
  assert.equal(parsed!.current_scene, 'untersuchungsausschuss');
  assert.equal(parsed!.fraktionsdisziplin, 5);
});

test('validateActionRequest akzeptiert fehlende fraktionsdisziplin', () => {
  const { fraktionsdisziplin: _omit, ...rest } = VALID_ACTION;
  const parsed = validateActionRequest(rest);
  assert.notEqual(parsed, null);
  assert.equal(parsed!.fraktionsdisziplin, undefined);
});

test('validateActionRequest lehnt fehlende Felder ab', () => {
  assert.equal(validateActionRequest({ ...VALID_ACTION, player_input: '' }), null);
  assert.equal(validateActionRequest({ ...VALID_ACTION, current_scene: 42 }), null);
  assert.equal(validateActionRequest({ ...VALID_ACTION, player_inventory: 'koffer' }), null);
  assert.equal(validateActionRequest({ ...VALID_ACTION, alignment_score: 'sehr korrupt' }), null);
});

const VALID_ROLL = {
  dice: 'W20',
  value: 13,
  bonuses: [{ source: 'berufspolitischer_bonus', value: 3 }],
  total: 16,
  difficulty_class: 12,
  success: true,
};

test('validateResultRequest akzeptiert Action-Request plus Roll', () => {
  const parsed = validateResultRequest({ ...VALID_ACTION, roll: VALID_ROLL });
  assert.notEqual(parsed, null);
  assert.equal(parsed!.roll.total, 16);
  assert.equal(parsed!.roll.bonuses[0].source, 'berufspolitischer_bonus');
});

test('validateResultRequest lehnt kaputten Roll ab', () => {
  assert.equal(validateResultRequest({ ...VALID_ACTION, roll: { ...VALID_ROLL, difficulty_class: 99 } }), null);
  assert.equal(validateResultRequest({ ...VALID_ACTION, roll: { ...VALID_ROLL, success: 'ja' } }), null);
  assert.equal(validateResultRequest({ ...VALID_ACTION, roll: { ...VALID_ROLL, bonuses: [{ source: '', value: 1 }] } }), null);
});

const VALID_GM_RESPONSE = {
  gm_dialogue: 'Ein brillanter Schachzug.',
  required_roll: 'W20',
  difficulty_class: 12,
  trigger_event: null,
};

test('validateGmResponse akzeptiert Minimal-Response mit trigger_event null', () => {
  const parsed = validateGmResponse(VALID_GM_RESPONSE);
  assert.notEqual(parsed, null);
  assert.equal(parsed!.trigger_event, null);
});

test('validateGmResponse akzeptiert alle Enum-Events, lehnt unbekannte ab', () => {
  const events = [
    { type: 'add_item', item: 'konfetti_der_straffreiheit' },
    { type: 'remove_item', item: 'schwarzer_koffer' },
    { type: 'change_scene', scene: 'untersuchungsausschuss' },
    { type: 'modify_stat', stat: 'alignment', delta: -2 },
    { type: 'start_minigame' },
  ];
  for (const trigger_event of events) {
    const parsed = validateGmResponse({ ...VALID_GM_RESPONSE, trigger_event });
    assert.notEqual(parsed, null, `Event ${trigger_event.type} muss gültig sein`);
  }
  assert.equal(validateGmResponse({ ...VALID_GM_RESPONSE, trigger_event: { type: 'nuke_berlin' } }), null);
  assert.equal(validateGmResponse({ ...VALID_GM_RESPONSE, trigger_event: { type: 'add_item' } }), null);
  assert.equal(validateGmResponse({ ...VALID_GM_RESPONSE, trigger_event: { type: 'modify_stat', stat: 'chaos', delta: 1 } }), null);
});

test('validateGmResponse lehnt DC außerhalb 1-20 und leere Dialoge ab', () => {
  assert.equal(validateGmResponse({ ...VALID_GM_RESPONSE, difficulty_class: 0 }), null);
  assert.equal(validateGmResponse({ ...VALID_GM_RESPONSE, difficulty_class: 21 }), null);
  assert.equal(validateGmResponse({ ...VALID_GM_RESPONSE, gm_dialogue: '   ' }), null);
  assert.equal(validateGmResponse({ ...VALID_GM_RESPONSE, required_roll: 'W' }), null);
});

test('validateGmResponse akzeptiert required_roll none', () => {
  const parsed = validateGmResponse({ ...VALID_GM_RESPONSE, required_roll: 'none' });
  assert.notEqual(parsed, null);
});

test('validateTriggerEvent ist ein geschlossenes Enum', () => {
  assert.deepEqual(validateTriggerEvent({ type: 'start_minigame' }), { type: 'start_minigame' });
  assert.deepEqual(validateTriggerEvent({ type: 'change_scene', scene: 'kommunalpolitik' }), {
    type: 'change_scene',
    scene: 'kommunalpolitik',
  });
  assert.equal(validateTriggerEvent(null), null);
  assert.equal(validateTriggerEvent('add_item'), null);
});

test('validateMinigameRoundRequest akzeptiert gültigen Request', () => {
  const parsed = validateMinigameRoundRequest({
    current_scene: 'untersuchungsausschuss',
    alignment_score: -4,
    round: 1,
    won_rounds: 0,
    lost_rounds: 0,
  });
  assert.notEqual(parsed, null);
});

test('validateMinigameRoundRequest lehnt Rundenzähler < 1 ab', () => {
  assert.equal(
    validateMinigameRoundRequest({ current_scene: 'x', alignment_score: 0, round: 0, won_rounds: 0, lost_rounds: 0 }),
    null,
  );
});

test('validateMinigameJudgeRequest akzeptiert gewählten Index 0-2', () => {
  assert.notEqual(validateMinigameJudgeRequest({ accusation: 'Vorwurf', chosen_index: 2, phrase: 'PR-Satz' }), null);
  assert.equal(validateMinigameJudgeRequest({ accusation: 'Vorwurf', chosen_index: 3, phrase: 'PR-Satz' }), null);
  assert.equal(validateMinigameJudgeRequest({ accusation: '', chosen_index: 0, phrase: 'PR-Satz' }), null);
});

test('validateMinigameRoundResponse verlangt genau 3 Phrasen', () => {
  assert.notEqual(
    validateMinigameRoundResponse({ accusation: 'A', phrases: ['p1', 'p2', 'p3'] }),
    null,
  );
  assert.equal(validateMinigameRoundResponse({ accusation: 'A', phrases: ['p1', 'p2'] }), null);
  assert.equal(validateMinigameRoundResponse({ accusation: 'A', phrases: ['p1', 'p2', ''] }), null);
});

test('validateMinigameJudgeResponse prüft Felder', () => {
  const valid = { correct: true, correct_index: 0, commentary: 'Formal einwandfrei.' };
  assert.notEqual(validateMinigameJudgeResponse(valid), null);
  assert.equal(validateMinigameJudgeResponse({ ...valid, correct: 'ja' }), null);
  assert.equal(validateMinigameJudgeResponse({ ...valid, correct_index: 5 }), null);
  assert.equal(validateMinigameJudgeResponse({ ...valid, commentary: '' }), null);
});

/*
 * PURPOSE: Prompt-Bau für GM-Aktion/Result/Minispiel inkl. geladenem System-Prompt
 * ARCHITECTURE: gm-proxy/prompting
 * DEPENDENCIES: node:fs, node:url, ./types.js
 * PIPELINE: runtime
 * LAST_VALIDATED: 2026-09-17
 */
import { readFileSync } from 'node:fs';
import type {
  GmActionRequest,
  GmResultRequest,
  MinigameJudgeRequest,
  MinigameRoundRequest,
} from './types.js';

const SYSTEM_PROMPT_PATH = new URL('../prompts/gm-system.md', import.meta.url);

export function loadSystemPrompt(): string {
  return readFileSync(SYSTEM_PROMPT_PATH, 'utf8');
}

const ACTION_CONTRACT = `Antworte mit genau einem JSON-Objekt dieser Form (keine Code-Fences, kein Text außerhalb):
{"gm_dialogue": "...", "required_roll": "W20", "difficulty_class": <1-20>, "trigger_event": null}`;

export function buildActionPrompt(req: GmActionRequest): string {
  const status = {
    current_scene: req.current_scene,
    player_inventory: req.player_inventory,
    alignment_score: req.alignment_score,
    fraktionsdisziplin: req.fraktionsdisziplin ?? null,
  };
  return [
    '## Aufgabe: Aktionsbewertung (/gm/action)',
    `Systemstatus: ${JSON.stringify(status)}`,
    `Absicht des Spielers: "${req.player_input}"`,
    'Bewerte den Zynismus-Grad, lege die difficulty_class fest (1-20) und kündige die Konsequenz satirisch in gm_dialogue an.',
    'Falls die Aktion ein konkretes Welt-Event auslöst, setze trigger_event auf genau eines der erlaubten Objekte (add_item, remove_item, change_scene, modify_stat, start_minigame) — sonst null.',
    ACTION_CONTRACT,
  ].join('\n');
}

export function buildResultPrompt(req: GmResultRequest): string {
  const status = {
    current_scene: req.current_scene,
    player_inventory: req.player_inventory,
    alignment_score: req.alignment_score,
    fraktionsdisziplin: req.fraktionsdisziplin ?? null,
  };
  return [
    '## Aufgabe: Ergebnisnarration (/gm/result)',
    `Systemstatus: ${JSON.stringify(status)}`,
    `Ursprüngliche Absicht: "${req.player_input}"`,
    `Wurfergebnis: ${JSON.stringify(req.roll)}`,
    req.roll.success
      ? 'Der Wurf ist GELUNGEN. Kommentiere den Erfolg satirisch und setze trigger_event bei konkreter Konsequenz.'
      : 'Der Wurf ist MISSGLÜCKT. Kommentiere den Misserfolg satirisch; die Konsequenz darf unangenehm sein (modify_stat oder remove_item).',
    ACTION_CONTRACT,
  ].join('\n');
}

export function buildMinigameRoundPrompt(req: MinigameRoundRequest): string {
  const status = {
    current_scene: req.current_scene,
    alignment_score: req.alignment_score,
    round: req.round,
    won_rounds: req.won_rounds,
    lost_rounds: req.lost_rounds,
  };
  return [
    '## Aufgabe: Beleidigungsfechten — neue Runde (/minigame/round)',
    `Kampfstatus: ${JSON.stringify(status)}`,
    'Generiere einen konkreten, spielverlaufsabhängigen Vorwurf des Ermittlungsführers (Beleidigungsfechten) und genau drei PR-Antwortphrasen.',
    'Genau eine Phrase ist die "politisch unangreifbarste": Sie ergibt inhaltlich am wenigsten Sinn, verweist aber auf Regelwerk, Definitionen oder Nichtzuständigkeit — merke dir ihren Index für /minigame/judge.',
    'Antworte mit genau einem JSON-Objekt (keine Code-Fences):',
    '{"accusation": "...", "phrases": ["...", "...", "..."]}',
  ].join('\n');
}

export function buildMinigameJudgePrompt(req: MinigameJudgeRequest): string {
  return [
    '## Aufgabe: Beleidigungsfechten — Richten (/minigame/judge)',
    `Vorwurf des Ermittlungsführers: "${req.accusation}"`,
    `Der Spieler wählt Antwort-Index ${req.chosen_index}: "${req.phrase}"`,
    'Prüfe: Ist das die politisch unangreifbarste Phrase (inhaltlich sinnentleert, aber formal unangreifbar)?',
    'Antworte mit genau einem JSON-Objekt (keine Code-Fences):',
    '{"correct": true|false, "correct_index": <0-2>, "commentary": "kurze satirische Begründung"}',
    'Wenn correct true ist, ist correct_index der gewählte Index; sonst der Index der besten Phrase.',
  ].join('\n');
}

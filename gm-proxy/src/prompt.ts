/*
 * PURPOSE: Prompt-Bau für GM-Aktion/Result/Minispiel/Epitaph inkl. geladenen System-Prompts
 * ARCHITECTURE: gm-proxy/prompting
 * DEPENDENCIES: node:fs, node:url, ./chronicle.js, ./types.js
 * PIPELINE: runtime
 * LAST_VALIDATED: 2026-10-04
 */
import { readFileSync } from 'node:fs';
import type { ChronicleEntry } from './chronicle.js';
import type {
  EpitaphRequest,
  GmActionRequest,
  GmResultRequest,
  MinigameJudgeRequest,
  MinigameRoundRequest,
} from './types.js';

const SYSTEM_PROMPT_PATH = new URL('../prompts/gm-system.md', import.meta.url);
const EPITAPH_PROMPT_PATH = new URL('../prompts/epitaph.md', import.meta.url);

export function loadSystemPrompt(): string {
  return readFileSync(SYSTEM_PROMPT_PATH, 'utf8');
}

export function loadEpitaphPrompt(): string {
  return readFileSync(EPITAPH_PROMPT_PATH, 'utf8');
}

/*
 * Aufbau jedes Task-Prompts, nach Googles Prompt-Design-Leitfaden:
 * Kontext zuerst (der größte Block ganz nach oben), Aufgabe ganz zuletzt,
 * dazwischen eine Ankerphrase. Regeln, Persona und Output-Vertrag stehen
 * NICHT hier, sondern im System-Prompt — der Task-Prompt trägt Daten und
 * genau eine Aufgabe. Jeder Block ist ein XML-Tag: einheitliche Delimiter,
 * und Spielereingabe ist damit sichtbar Datum statt Anweisung.
 */

const tag = (name: string, body: string): string => `<${name}>\n${body}\n</${name}>`;

const ANCHOR = 'Basierend auf den Angaben oben:';

/** Status-Block, den action und result gemeinsam senden. */
const statusBlock = (req: GmActionRequest): string =>
  tag('systemstatus', JSON.stringify({
    current_scene: req.current_scene,
    player_inventory: req.player_inventory,
    alignment_score: req.alignment_score,
    fraktionsdisziplin: req.fraktionsdisziplin ?? null,
  }));

/**
 * Spielereingabe. Eigenes Tag, weil der Inhalt frei getippt ist: So steht er
 * als Datum im Prompt und nicht als weitere Instruktionszeile.
 */
const playerInputBlock = (req: GmActionRequest): string =>
  tag('player_input', req.player_input);

/** Rendert Chronik-Einträge als kompakten Fakten-Block für den GM (Rückbezug-Material). */
export function renderChronicleBlock(entries: ChronicleEntry[]): string {
  if (entries.length === 0) return '';
  const lines = entries.map((entry) => {
    const event = entry.trigger_event === null || entry.trigger_event === undefined
      ? 'kein Event'
      : `Event: ${JSON.stringify(entry.trigger_event)}`;
    const discipline = entry.discipline === null ? 'unbekannt' : entry.discipline;
    return `- [${entry.ts}] Szene "${entry.scene}": "${entry.player_input}" → ${event} (alignment ${entry.alignment}, disziplin ${discipline})`;
  });
  return tag(
    'chronik',
    ['Früher validierte Ereignisse (Fakten, zitierbar für Rückbezug):', ...lines].join('\n'),
  );
}

const join = (...blocks: string[]): string => blocks.filter((b) => b.length > 0).join('\n\n');

export function buildActionPrompt(req: GmActionRequest, chronicle: ChronicleEntry[] = []): string {
  return join(
    renderChronicleBlock(chronicle),
    statusBlock(req),
    playerInputBlock(req),
    `${ANCHOR} ## Aufgabe: Aktionsbewertung (/gm/action)`,
    'Bewerte die Absicht aus <player_input> und antworte im vereinbarten JSON-Format.',
  );
}

export function buildResultPrompt(req: GmResultRequest, chronicle: ChronicleEntry[] = []): string {
  return join(
    renderChronicleBlock(chronicle),
    statusBlock(req),
    playerInputBlock(req),
    tag('wurfergebnis', JSON.stringify(req.roll)),
    `${ANCHOR} ## Aufgabe: Ergebnisnarration (/gm/result)`,
    req.roll.success
      ? 'Der Wurf ist GELUNGEN. Kommentiere den Erfolg und leite die Konsequenz ein.'
      : 'Der Wurf ist MISSGLÜCKT. Kommentiere den Misserfolg; die Konsequenz darf unangenehm sein.',
  );
}

export function buildMinigameRoundPrompt(req: MinigameRoundRequest): string {
  return join(
    tag('kampfstatus', JSON.stringify({
      current_scene: req.current_scene,
      alignment_score: req.alignment_score,
      round: req.round,
      won_rounds: req.won_rounds,
      lost_rounds: req.lost_rounds,
    })),
    `${ANCHOR} ## Aufgabe: Beleidigungsfechten — neue Runde (/minigame/round)`,
    'Erzeuge einen spielverlaufsabhängigen Vorwurf des Ermittlungsführers und genau drei PR-Phrasen.',
    'Format: {"accusation": "...", "phrases": ["...", "...", "..."]}',
  );
}

export function buildMinigameJudgePrompt(req: MinigameJudgeRequest): string {
  return join(
    tag('vorwurf', req.accusation),
    tag('gewaehlte_phrase', JSON.stringify({ index: req.chosen_index, phrase: req.phrase })),
    `${ANCHOR} ## Aufgabe: Beleidigungsfechten — Richten (/minigame/judge)`,
    'Ist die gewählte Phrase die politisch unangreifbarste? correct_index ist bei correct=true der gewählte Index, sonst der Index der besten Phrase.',
    'Format: {"correct": true|false, "correct_index": <0-2>, "commentary": "..."}',
  );
}

export function buildEpitaphPrompt(req: EpitaphRequest): string {
  return join(
    tag('laufzeit_statistik', JSON.stringify(req.stats)),
    `${ANCHOR} ## Aufgabe: Karriere-Akte (/run/epitaph)`,
    'Verfasse die amtliche Zusammenfassung des soeben beendeten Mandats.',
    'Format: {"epitaph": "<1-3 Sätze>", "highlights": ["<3 Sätze>"]}',
  );
}

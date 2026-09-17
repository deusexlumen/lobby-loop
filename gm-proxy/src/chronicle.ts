/*
 * PURPOSE: Fakten-Chronik des GM-Gedächtnisses — pro Session validierte Events laden/anfügen/kürzen
 * ARCHITECTURE: gm-proxy/memory
 * DEPENDENCIES: node:fs, node:path
 * PIPELINE: runtime, test
 * LAST_VALIDATED: 2026-09-17
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Ein validierter Chronik-Eintrag — ausschließlich Fakten, keine LLM-Summaries. */
export interface ChronicleEntry {
  ts: string;
  scene: string;
  player_input: string;
  trigger_event: unknown;
  alignment: number;
  discipline: number | null;
}

/** Seams des Gedächtnisses: Best-Effort, niemals werfend — ein Store-Fehler darf den GM-Call nie blockieren. */
export interface ChronicleStore {
  recent: (sessionId: string, limit: number) => ChronicleEntry[];
  append: (sessionId: string, entry: ChronicleEntry) => void;
}

export const CHRONICLE_CAP = 50;

/** Session-IDs werden zu Dateinamen — nur harmlose Zeichen, sonst kein Gedächtnis (aber auch kein Fehler). */
export const sanitizeSessionId = (sessionId: string): string | null => {
  const cleaned = sessionId.trim();
  if (cleaned.length === 0 || cleaned.length > 128) return null;
  return /^[a-zA-Z0-9_-]+$/.test(cleaned) ? cleaned : null;
};

const capEntries = (entries: ChronicleEntry[]): ChronicleEntry[] =>
  entries.length > CHRONICLE_CAP ? entries.slice(entries.length - CHRONICLE_CAP) : entries;

/** In-Memory-Store für Tests und als Default. */
export function createMemoryChronicleStore(): ChronicleStore {
  const chronicles = new Map<string, ChronicleEntry[]>();
  return {
    recent: (sessionId, limit) => {
      const entries = chronicles.get(sessionId) ?? [];
      return entries.slice(-limit);
    },
    append: (sessionId, entry) => {
      const entries = chronicles.get(sessionId) ?? [];
      entries.push(entry);
      chronicles.set(sessionId, capEntries(entries));
    },
  };
}

/**
 * File-backed Store: JSON pro Session unter <dir>/<session_id>.json.
 * Lesen/Schreiben laufen synchron und in try/catch — die Chronik ist best-effort.
 */
export function createFileChronicleStore(dir: string, log: (msg: string) => void = () => undefined): ChronicleStore {
  const pathFor = (sessionId: string): string => join(dir, `${sessionId}.json`);

  const read = (sessionId: string): ChronicleEntry[] => {
    try {
      const path = pathFor(sessionId);
      if (!existsSync(path)) return [];
      const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (entry): entry is ChronicleEntry =>
          typeof entry === 'object' && entry !== null && typeof (entry as ChronicleEntry).ts === 'string',
      );
    } catch (err) {
      log(`[gm-proxy] Chronik lesen fehlgeschlagen (${sessionId}): ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  };

  return {
    recent: (sessionId, limit) => read(sessionId).slice(-limit),
    append: (sessionId, entry) => {
      try {
        mkdirSync(dir, { recursive: true });
        const entries = capEntries([...read(sessionId), entry]);
        writeFileSync(pathFor(sessionId), JSON.stringify(entries), 'utf8');
      } catch (err) {
        log(`[gm-proxy] Chronik schreiben fehlgeschlagen (${sessionId}): ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  };
}

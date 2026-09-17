/*
 * PURPOSE: Robuste JSON-Extraktion aus LLM-Rohtext (Fences, Prosa, Balanced-Brace-Scan)
 * ARCHITECTURE: gm-proxy/llm-parsing
 * DEPENDENCIES: none
 * PIPELINE: runtime, test
 * LAST_VALIDATED: 2026-09-17
 */

const stripCodeFence = (text: string): string => {
  const match = /^```(?:json)?\s*\r?\n([\s\S]*?)\r?\n?```\s*$/i.exec(text.trim());
  return match ? match[1] : text;
};

/**
 * Findet das erste vollständige JSON-Objekt im Text über einen
 * String- und Escape-zeichen-sensitiven Klammer-Scan. Liefert null,
 * wenn kein balanciertes {...}-Objekt enthalten ist.
 */
const scanBalancedObject = (text: string): string | null => {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
      if (depth < 0) return null;
    }
  }
  return null;
};

/** Parst das erste JSON-Objekt im LLM-Text; null bei jedem Fehler. */
export function extractJsonObject(text: string): unknown | null {
  if (typeof text !== 'string' || text.trim().length === 0) return null;
  const candidates = [stripCodeFence(text.trim()), text];
  const scanned = scanBalancedObject(text);
  if (scanned !== null) candidates.push(scanned);
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // nächster Kandidat
    }
  }
  return null;
}

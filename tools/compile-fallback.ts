/*
 * PURPOSE: Kompiliert Content-JSON (Szenen/Items/Minigame) idempotent nach data/fallback.sqlite (node:sqlite)
 * ARCHITECTURE: tools/fallback-compiler
 * DEPENDENCIES: node:fs, node:path, node:sqlite, node:url
 * PIPELINE: build, test
 * LAST_VALIDATED: 2026-09-17
 */
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

export interface FallbackSceneNode {
  id: string;
  type: 'npc' | 'object' | 'microphone';
  label: string;
  position: { x: number; y: number };
  prompt_hint: string;
  default_dc: number;
  fallback_dialogue: string;
  absurd_actions?: string[];
}

export interface FallbackScene {
  id: string;
  display_name: string;
  intro?: string;
  nodes: FallbackSceneNode[];
  exits?: Array<{ to: string; label: string; position: { x: number; y: number } }>;
}

export interface FallbackItems {
  items: Array<{ id: string; display_name: string; description: string }>;
  combinations: Array<{ a: string; b: string; result: string; flavor: string }>;
}

export interface FallbackMinigame {
  rounds: Array<{ accusation: string; phrases: string[]; correct_index: number }>;
}

export interface CompileOptions {
  contentDir?: string;
  outFile?: string;
}

export interface CompileSummary {
  outFile: string;
  scenes: number;
  nodes: number;
  combinations: number;
  minigameRounds: number;
}

const NODE_TYPES = new Set(['npc', 'object', 'microphone']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const fail = (context: string, message: string): never => {
  throw new Error(`[compile-fallback] ${context}: ${message}`);
};

const readJsonFile = (path: string): unknown => {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return fail(path, 'Datei nicht lesbar.');
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    return fail(path, `ungültiges JSON (${err instanceof Error ? err.message : err}).`);
  }
};

function loadScenes(scenesDir: string): FallbackScene[] {
  let files: string[];
  try {
    files = readdirSync(scenesDir).filter((file) => file.endsWith('.json')).sort();
  } catch {
    return fail(scenesDir, 'Szenen-Verzeichnis nicht lesbar.');
  }
  if (files.length === 0) return fail(scenesDir, 'keine Szenen-JSONs gefunden.');

  return files.map((file) => {
    const path = join(scenesDir, file);
    const scene = readJsonFile(path);
    if (!isRecord(scene)) return fail(path, 'Szene muss ein JSON-Objekt sein.');
    if (!isNonEmptyString(scene.id) || !isNonEmptyString(scene.display_name)) {
      return fail(path, 'Szene braucht id und display_name (string).');
    }
    if (!Array.isArray(scene.nodes)) return fail(path, 'Szene braucht nodes-Array.');

    scene.nodes.forEach((node, index) => {
      const where = `${path} node[${index}]`;
      if (!isRecord(node)) return fail(where, 'Node muss ein Objekt sein.');
      if (!isNonEmptyString(node.id)) return fail(where, 'Node braucht id.');
      if (!isNonEmptyString(node.type) || !NODE_TYPES.has(node.type)) {
        return fail(where, `Node-Type ungültig (${String(node.type)}); erlaubt: npc, object, microphone.`);
      }
      if (!isNonEmptyString(node.label)) return fail(where, 'Node braucht label.');
      if (typeof node.default_dc !== 'number' || !Number.isInteger(node.default_dc) || node.default_dc < 1 || node.default_dc > 20) {
        return fail(where, 'default_dc muss Integer 1-20 sein.');
      }
      if (!isNonEmptyString(node.prompt_hint)) return fail(where, 'Node braucht prompt_hint.');
      if (!isNonEmptyString(node.fallback_dialogue)) return fail(where, 'Node braucht fallback_dialogue.');
    });

    return scene as unknown as FallbackScene;
  });
}

function loadItems(contentDir: string): FallbackItems {
  const path = join(contentDir, 'items.json');
  const data = readJsonFile(path);
  if (!isRecord(data)) return fail(path, 'items.json muss ein Objekt sein.');
  if (!Array.isArray(data.items)) return fail(path, 'items.json braucht items-Array.');
  if (!Array.isArray(data.combinations)) return fail(path, 'items.json braucht combinations-Array.');

  for (const item of data.items) {
    const where = `${path} item`;
    if (!isRecord(item) || !isNonEmptyString(item.id) || !isNonEmptyString(item.display_name) || !isNonEmptyString(item.description)) {
      return fail(where, 'Item braucht id, display_name, description (string).');
    }
  }
  for (const combo of data.combinations) {
    const where = `${path} combination`;
    if (!isRecord(combo) || !isNonEmptyString(combo.a) || !isNonEmptyString(combo.b) || !isNonEmptyString(combo.result) || !isNonEmptyString(combo.flavor)) {
      return fail(where, 'Kombination braucht a, b, result, flavor (string).');
    }
  }
  return data as unknown as FallbackItems;
}

function loadMinigame(contentDir: string): FallbackMinigame {
  const path = join(contentDir, 'fallback', 'minigame.json');
  const data = readJsonFile(path);
  if (!isRecord(data) || !Array.isArray(data.rounds)) return fail(path, 'minigame.json braucht rounds-Array.');
  if (data.rounds.length === 0) return fail(path, 'mindestens eine Runde nötig.');

  data.rounds.forEach((round, index) => {
    const where = `${path} rounds[${index}]`;
    if (!isRecord(round) || !isNonEmptyString(round.accusation)) return fail(where, 'Runde braucht accusation.');
    if (!Array.isArray(round.phrases) || round.phrases.length !== 3 || !round.phrases.every(isNonEmptyString)) {
      return fail(where, 'Runde braucht genau 3 Phrasen (string).');
    }
    if (typeof round.correct_index !== 'number' || !Number.isInteger(round.correct_index) || round.correct_index < 0 || round.correct_index > 2) {
      return fail(where, 'correct_index muss 0-2 sein.');
    }
  });
  return data as unknown as FallbackMinigame;
}

const SCHEMA = `
DROP TABLE IF EXISTS scenes;
DROP TABLE IF EXISTS nodes;
DROP TABLE IF EXISTS item_combinations;
DROP TABLE IF EXISTS minigame_rounds;
CREATE TABLE scenes (
  id TEXT PRIMARY KEY,
  display_name TEXT,
  json TEXT
);
CREATE TABLE nodes (
  scene_id TEXT,
  node_id TEXT,
  type TEXT,
  label TEXT,
  default_dc INTEGER,
  fallback_dialogue TEXT,
  json TEXT
);
CREATE TABLE item_combinations (
  a TEXT,
  b TEXT,
  result TEXT,
  flavor TEXT
);
CREATE TABLE minigame_rounds (
  idx INTEGER PRIMARY KEY,
  accusation TEXT,
  phrases TEXT,
  correct_index INTEGER
);
`;

/** JSON → SQLite, idempotent: alle Tabellen droppen und neu füllen. */
export function compileFallback(options: CompileOptions = {}): CompileSummary {
  const contentDir = options.contentDir ?? 'content';
  const outFile = options.outFile ?? join('data', 'fallback.sqlite');

  const scenes = loadScenes(join(contentDir, 'scenes'));
  const items = loadItems(contentDir);
  const minigame = loadMinigame(contentDir);

  mkdirSync(dirname(outFile), { recursive: true });
  const db = new DatabaseSync(outFile);
  try {
    db.exec('BEGIN');
    db.exec(SCHEMA);

    const insertScene = db.prepare('INSERT INTO scenes (id, display_name, json) VALUES (?, ?, ?)');
    const insertNode = db.prepare(
      'INSERT INTO nodes (scene_id, node_id, type, label, default_dc, fallback_dialogue, json) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    const insertCombo = db.prepare('INSERT INTO item_combinations (a, b, result, flavor) VALUES (?, ?, ?, ?)');
    const insertRound = db.prepare(
      'INSERT INTO minigame_rounds (idx, accusation, phrases, correct_index) VALUES (?, ?, ?, ?)',
    );

    let nodeCount = 0;
    for (const scene of scenes) {
      insertScene.run(scene.id, scene.display_name, JSON.stringify(scene));
      for (const node of scene.nodes) {
        insertNode.run(
          scene.id,
          node.id,
          node.type,
          node.label,
          node.default_dc,
          node.fallback_dialogue,
          JSON.stringify(node),
        );
        nodeCount++;
      }
    }
    for (const combo of items.combinations) {
      insertCombo.run(combo.a, combo.b, combo.result, combo.flavor);
    }
    minigame.rounds.forEach((round, index) => {
      insertRound.run(index, round.accusation, JSON.stringify(round.phrases), round.correct_index);
    });

    db.exec('COMMIT');
    return {
      outFile,
      scenes: scenes.length,
      nodes: nodeCount,
      combinations: items.combinations.length,
      minigameRounds: minigame.rounds.length,
    };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    db.close();
  }
}

const isMainModule = (): boolean => {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(entry).href;
  } catch {
    return false;
  }
};

if (isMainModule()) {
  const summary = compileFallback();
  console.log(
    `[compile-fallback] ${summary.outFile}: ${summary.scenes} Szenen, ${summary.nodes} Nodes, ` +
      `${summary.combinations} Kombinationen, ${summary.minigameRounds} Minispiel-Runden.`,
  );
}

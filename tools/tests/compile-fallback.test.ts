/*
 * PURPOSE: Roundtrip-Test des Fallback-Compilers: JSON → DB → auslesen, inkl. Idempotenz
 * ARCHITECTURE: tools/tests
 * DEPENDENCIES: node:fs, node:os, node:path, node:sqlite, node:test, node:assert/strict, node:url, ../compile-fallback.js
 * PIPELINE: test
 * LAST_VALIDATED: 2026-09-17
 */
import assert from 'node:assert/strict';
import { unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { compileFallback } from '../compile-fallback.js';

const CONTENT_DIR = fileURLToPath(new URL('../../content', import.meta.url));
const OUT_FILE = join(tmpdir(), `lobby-loop-fallback-test-${process.pid}.sqlite`);

interface Row {
  [key: string]: string | number | null;
}

const readAll = (db: DatabaseSync, sql: string): Row[] => db.prepare(sql).all() as Row[];

test('compileFallback: JSON → DB → auslesen (Roundtrip)', () => {
  const summary = compileFallback({ contentDir: CONTENT_DIR, outFile: OUT_FILE });
  try {
    assert.equal(summary.scenes, 2);
    assert.ok(summary.nodes >= 8);
    assert.ok(summary.combinations >= 1);
    assert.ok(summary.minigameRounds >= 6);

    const db = new DatabaseSync(OUT_FILE, { readOnly: true });
    try {
      const scenes = readAll(db, 'SELECT id, display_name, json FROM scenes ORDER BY id');
      assert.deepEqual(
        scenes.map((s) => s.id),
        ['kommunalpolitik', 'untersuchungsausschuss'],
      );
      const kommune = JSON.parse(scenes[0]!.json as string) as { nodes: unknown[]; exits: unknown[] };
      assert.equal(kommune.nodes.length, 4);
      assert.equal(kommune.exits.length, 1);

      const nodes = readAll(db, 'SELECT scene_id, node_id, type, label, default_dc, fallback_dialogue, json FROM nodes');
      assert.equal(nodes.length, summary.nodes);
      const types = new Set(nodes.map((n) => n.type));
      assert.ok(types.has('npc') && types.has('object') && types.has('microphone'));
      for (const node of nodes) {
        assert.ok(Number.isInteger(node.default_dc));
        assert.ok((node.default_dc as number) >= 1 && (node.default_dc as number) <= 20);
        assert.ok((node.fallback_dialogue as string).length > 0);
        const parsed = JSON.parse(node.json as string) as { id: string; absurd_actions?: string[] };
        assert.equal(typeof parsed.id, 'string');
      }
      const ernst = nodes.find((n) => n.node_id === 'ermittlungsfuehrer');
      assert.equal(ernst?.scene_id, 'untersuchungsausschuss');

      const combos = readAll(db, 'SELECT a, b, result, flavor FROM item_combinations');
      const konfetti = combos.find((c) => c.a === 'unschuldsvermutung' && c.b === 'schredder');
      assert.equal(konfetti?.result, 'konfetti_der_straffreiheit');
      assert.ok((konfetti?.flavor as string).length > 0);

      const rounds = readAll(db, 'SELECT idx, accusation, phrases, correct_index FROM minigame_rounds ORDER BY idx');
      assert.equal(rounds.length, summary.minigameRounds);
      rounds.forEach((round, i) => {
        assert.equal(round.idx, i);
        const phrases = JSON.parse(round.phrases as string) as string[];
        assert.equal(phrases.length, 3);
        assert.ok(phrases.every((p) => p.length > 0));
        assert.ok((round.correct_index as number) >= 0 && (round.correct_index as number) <= 2);
        assert.ok((round.accusation as string).length > 0);
      });
    } finally {
      db.close();
    }
  } finally {
    unlinkSync(OUT_FILE);
  }
});

test('compileFallback ist idempotent (zweiter Lauf gleiche Zähler)', () => {
  const first = compileFallback({ contentDir: CONTENT_DIR, outFile: OUT_FILE });
  const second = compileFallback({ contentDir: CONTENT_DIR, outFile: OUT_FILE });
  try {
    assert.deepEqual(
      {
        scenes: second.scenes,
        nodes: second.nodes,
        combinations: second.combinations,
        minigameRounds: second.minigameRounds,
      },
      {
        scenes: first.scenes,
        nodes: first.nodes,
        combinations: first.combinations,
        minigameRounds: first.minigameRounds,
      },
    );
  } finally {
    unlinkSync(OUT_FILE);
  }
});

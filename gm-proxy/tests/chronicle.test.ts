/*
 * PURPOSE: Tests der ChronicleStores: Persistenz, Cap, Sanitizing, Best-Effort bei defekten Daten
 * ARCHITECTURE: gm-proxy/tests
 * DEPENDENCIES: node:fs, node:os, node:path, node:test, node:assert/strict, ../src/chronicle.js
 * PIPELINE: test
 * LAST_VALIDATED: 2026-09-17
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  CHRONICLE_CAP,
  createFileChronicleStore,
  createMemoryChronicleStore,
  sanitizeSessionId,
  type ChronicleEntry,
} from '../src/chronicle.js';

const entry = (input: string, scene = 'untersuchungsausschuss'): ChronicleEntry => ({
  ts: '2026-09-17T10:00:00.000Z',
  scene,
  player_input: input,
  trigger_event: null,
  alignment: -4,
  discipline: 5,
});

test('sanitizeSessionId akzeptiert harmlose IDs und lehnt Pfad-Traversal ab', () => {
  assert.equal(sanitizeSessionId('savegame_1'), 'savegame_1');
  assert.equal(sanitizeSessionId('Run-2026'), 'Run-2026');
  assert.equal(sanitizeSessionId('../../etc/passwd'), null);
  assert.equal(sanitizeSessionId('a b'), null);
  assert.equal(sanitizeSessionId(''), null);
  assert.equal(sanitizeSessionId('   '), null);
});

test('memory store: recent liefert die letzten N Einträge in Reihenfolge', () => {
  const store = createMemoryChronicleStore();
  for (let i = 1; i <= 15; i++) store.append('s1', entry(`Aktion ${i}`));
  const recent = store.recent('s1', 10);
  assert.equal(recent.length, 10);
  assert.equal(recent[0]!.player_input, 'Aktion 6');
  assert.equal(recent[9]!.player_input, 'Aktion 15');
});

test('memory store: Sessions sind voneinander getrennt', () => {
  const store = createMemoryChronicleStore();
  store.append('s1', entry('nur s1'));
  assert.equal(store.recent('s2', 10).length, 0);
  assert.equal(store.recent('s1', 10).length, 1);
});

test(`cap: mehr als ${CHRONICLE_CAP} Einträge werden gekürzt`, () => {
  const store = createMemoryChronicleStore();
  for (let i = 1; i <= CHRONICLE_CAP + 10; i++) store.append('s1', entry(`Aktion ${i}`));
  assert.equal(store.recent('s1', CHRONICLE_CAP + 10).length, CHRONICLE_CAP);
  assert.equal(store.recent('s1', CHRONICLE_CAP + 10)[0]!.player_input, 'Aktion 11');
});

test('file store: persistiert und liest Einträge über Instanzen hinweg', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lobby-loop-chronicle-'));
  try {
    const writer = createFileChronicleStore(dir);
    writer.append('savegame_1', entry('Koffer verlegt'));
    writer.append('savegame_1', entry('Aufsichtsrat angeboten', 'fraktionssitzung'));

    const reader = createFileChronicleStore(dir);
    const recent = reader.recent('savegame_1', 10);
    assert.equal(recent.length, 2);
    assert.equal(recent[0]!.player_input, 'Koffer verlegt');
    assert.equal(recent[1]!.scene, 'fraktionssitzung');

    const raw = JSON.parse(readFileSync(join(dir, 'savegame_1.json'), 'utf8')) as unknown[];
    assert.equal(raw.length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('file store: defekte Datei → leere Chronik, kein Werfen', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lobby-loop-chronicle-'));
  try {
    writeFileSync(join(dir, 'broken.json'), 'kein json {{{', 'utf8');
    const store = createFileChronicleStore(dir);
    assert.deepEqual(store.recent('broken', 10), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('file store: Verzeichniskonflikt (Pfad ist Datei) → kein Werfen', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lobby-loop-chronicle-'));
  try {
    const blocked = join(dir, 'kein-verzeichnis');
    writeFileSync(blocked, 'ich bin eine Datei', 'utf8');
    const store = createFileChronicleStore(blocked);
    assert.doesNotThrow(() => store.append('s1', entry('test')));
    assert.deepEqual(store.recent('s1', 10), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

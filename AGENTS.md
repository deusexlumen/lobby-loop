# AGENTS.md — LOBBY-LOOP

## Projektübersicht

**LOBBY-LOOP** ist ein digitales Point-and-Click-RPG mit politisch-satirischem Setting (Lobbyismus, Untersuchungsausschuss, Kommunalpolitik). Das Kernstück ist ein KI-Game-Master (LLM), der als System-Entität agiert, die Spielwelt aktiv manipuliert und jede Spieleraktion bewertet.

**Aktueller Stand:** Playable Skeleton. Godot-4-Client mit komplettem Kern-Loop (Szenen → Hotspots → GM-Bewertung → W20 mit Boni → Events → Inventar-Kombis → Beleidigungsfechten → Perma-Death), GM-Proxy (Node/TS, `localhost:8787`, Gemini via `llm-router-blueprint` — gevendort unter `vendor/`), SQLite-Fallback (compiliert aus `content/`-JSON, ADR-0002), GM-Gedächtnis-Chronik pro Session (ADR-0004), Karriere-Akte bei Perma-Death (ADR-0005) und strukturierte GM-Calls — `systemInstruction`, `responseJsonSchema`, Few-shot-DC-Kalibrierung, Gemini-3-Modellkette (ADR-0007). Die verbindliche Referenz bleibt `LOBBY-LOOP.md` inkl. Implementierungs-Anhang. Strategie-Doku: `.claude/docs/ai/lobby-loop/10x/`.

## Technologie-Stack

- **Engine:** Godot 4.x — nativer 2D-Support, externe API-Aufrufe direkt über `HTTPRequest`-Nodes.
- **Skriptsprache:** GDScript (Client), TypeScript (GM-Proxy + Tools, `tsx`).
- **LLM-Anbindung:** REST-API über den lokalen GM-Proxy, ausschließlich strukturierte JSON-Payloads in beide Richtungen (kein String-Parsing); `session_id` pro Savegame koppelt Chronik und Karriere-Akte. System-Prompt geht als `systemInstruction`, die Antwortform als `responseJsonSchema` (`gm-proxy/src/schemas.ts`) — der Task-Prompt trägt nur Daten in XML-Tags und eine Aufgabe (ADR-0007).
- **Fallback:** Lokale SQLite-Datenbank mit hartcodierten Dialogbäumen und Standard-DCs (Difficulty Classes), aktiv bei API-Timeouts oder Verbindungsabbrüchen; Minigame-Fallback-Runden werden clientseitig deterministisch permutiert.
- **Persistenz:** Spielstand als JSON in `user://`; Perma-Death löscht den Spielstand irreversibel (Kernechanik, kein Bug).

## Architektur-Kontrakte (aus der Spezifikation)

Diese Schnittstellen sind fest definiert und müssen bei der Implementierung exakt eingehalten werden:

**Request (Godot → API)** — jede Spielerinteraktion sendet den exakten Systemstatus:

```json
{
  "player_inventory": ["Gedächtnislücke", "Schwarzer Koffer"],
  "current_scene": "Untersuchungsausschuss",
  "alignment_score": -4,
  "player_input": "Ich biete dem Vorsitzenden einen Aufsichtsratsposten an."
}
```

**Response (API → Godot)** — das LLM liefert zwingend Maschinen-Code, den die Engine in Spielmechanik übersetzt:

```json
{
  "gm_dialogue": "Ein brillanter Schachzug. Die Integrität des Ausschusses sinkt auf Raumtemperatur.",
  "required_roll": "W20",
  "difficulty_class": 12,
  "trigger_event": "remove_item_schwarzer_koffer"
}
```

## Kernmechaniken

1. **Game Loop:** Point-and-Click-Fortbewegung. Interaktion mit Systemknoten (NPCs, Akten, Mikrofone) friert das Geschehen ein und öffnet das P&P-Interface. Ablauf: Absicht formulieren → KI-GM bewertet Zynismus-Grad und legt DC (1–20) fest → digitaler W20-Wurf → additive Boni aus Charakterbogen (z. B. Berufspolitischer Bonus: +3) und Inventar-Buffs → Vergleich mit DC, Ergebnis triggert die nächste Szene.
2. **LucasArts-Rätselmatrix:** Das Inventar speichert abstrakte politische Konzepte statt physischer Gegenstände. Kombinationen folgen strenger, absurder Logik (Beispiel aus der Spezifikation: „Die Unschuldsvermutung" auf „Der Schredder" ziehen → „Konfetti der Straffreiheit").
3. **Beleidigungsfechten (Minispiel):** Mechanisches Duell im Kreuzverhör; die LLM-API generiert spielverlaufsabhängige Vorwürfe, der Spieler wählt aus drei PR-Phrasen die politisch unangreifbarste. Drei gewonnene Runden → Ermittlungsführer erleidet Burnout. Niederlage senkt „Fraktionsdisziplin"; bei null: Perma-Death, Neustart im Startgebiet Kommunalpolitik.
4. **Visuelle GM-Repräsentation:** Animierter, schwebender Aktenkoffer, der das Interface physisch durchbricht.

## Build- und Test-Prozess

Eingerichtet und grün:

- `pnpm install` — Vendored Dependency (`vendor/llm-router-blueprint`, ADR-0006), kein Sibling-Repo nötig.
- `pnpm run proxy:dev` — GM-Proxy auf `localhost:8787`.
- `pnpm run build:fallback` — compiliert `content/`-JSON → `data/fallback.sqlite`.
- `pnpm test` — Proxy-Suites (`node:test`) + Tools-Suites; `pnpm run typecheck` — `tsc`.
- GUT (Godot 4.7): erst **einmalig** `<godot-binary> --headless --path . --import`, dann `<godot-binary> --headless --path . -s addons/gut/gut_cmdln.gd -gdir=res://test/gut -gexit` — Unit-Tests für reine Logik (Wurf, Stats, Kombinationen, Shuffle, Run-Stats, Epitaph); 53 Tests / 538 Asserts, Exit 1 bei einem Fehlschlag. **Der Import ist Pflicht:** `.godot/` ist gitignored, auf einem frischen Checkout lösen sich sonst alle `class_name`-Typen nicht auf (`Identifier "SaveData" not declared`), die Autoloads laden nicht — und der Lauf endet trotzdem mit Exit 0, weil nie ein Test startet. Eine CI ohne Import meldet also grün, ohne zu testen.
- Godot-Export: `export_presets.cfg` definiert **ein** Preset, „Windows Desktop" — nur dafür liegen godot-sqlite-Binaries im Repo (`.gitignore`), jede andere Plattform bekäme einen Build ohne funktionierende Offline-DB. `include_filter="*.sqlite"` packt `data/fallback.sqlite` mit ein; der JSON-Content kommt als importierte Ressource von selbst mit. Aus dem Build ausgeschlossen sind `gm-proxy`, `tools`, `vendor`, `docs`, `test`, `addons/gut`. Verifiziert (Godot 4.7.2): `--export-pack "Windows Desktop" build/lobby-loop.pck` packt 59 Dateien, darunter alle 8 aus `content/` und `data/`. **Nicht getestet:** ein voller Export mit Templates und ob `FallbackDb` die DB aus dem PCK öffnen kann (`DB_PATH` ist `res://`, im Export schreibgeschützt und im PCK; im Fehlerfall fällt der Client auf die generischen Offline-Antworten). Das braucht einen Probelauf des exportierten Builds.

## Konventionen

- **Dokumentationssprache:** Deutsch (die Spezifikation `LOBBY-LOOP.md` ist auf Deutsch und bleibt Referenz; Spieltexte und In-Game-Inhalte ebenfalls Deutsch).
- **Code:** Englische Bezeichner für Variablen/Funktionen/Klassen, wie im globalen AGENTS.md des Nutzers vorgegeben.
- **Datenformate:** Kein String-Parsing an den API-Grenzen — nur validiertes JSON. Fehlende oder ungültige Felder in der API-Antwort müssen auf den SQLite-Fallback umschalten, nicht crashen.
- **Game-Design-Inhalte** (Items, Dialoge, Szenen) folgen dem absurden, satirischen Ton der Spezifikation — das ist Absicht, kein Fehler.

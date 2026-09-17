# AGENTS.md — LOBBY-LOOP

## Projektübersicht

**LOBBY-LOOP** ist ein digitales Point-and-Click-RPG mit politisch-satirischem Setting (Lobbyismus, Untersuchungsausschuss, Kommunalpolitik). Das Kernstück ist ein KI-Game-Master (LLM), der als System-Entität agiert, die Spielwelt aktiv manipuliert und jede Spieleraktion bewertet.

**Aktueller Stand:** Das Projekt befindet sich im Spezifikationsstadium. Die einzige vorhandene Datei ist `LOBBY-LOOP.md` (die vollständige System-Spezifikation, auf Deutsch). Es gibt noch **keinen Code, keine Godot-Projektdateien, keine Build-Konfiguration und keine Tests**. Bei der Umsetzung gilt diese Spezifikation als verbindliche Referenz — Abweichungen nur nach Rücksprache.

## Technologie-Stack (geplant, laut Spezifikation)

- **Engine:** Godot 4.x — nativer 2D-Support, externe API-Aufrufe direkt über `HTTPRequest`-Nodes.
- **Skriptsprache:** GDScript (Idiom der Engine, noch nicht im Projekt vorhanden).
- **LLM-Anbindung:** REST-API, ausschließlich strukturierte JSON-Payloads in beide Richtungen (kein String-Parsing).
- **Fallback:** Lokale SQLite-Datenbank mit hartcodierten Dialogbäumen und Standard-DCs (Difficulty Classes), aktiv bei API-Timeouts oder Verbindungsabbrüchen.
- **Persistenz:** Spielstand wird lokal gespeichert; Perma-Death löscht den Spielstand irreversibel (Kernechanik, kein Bug).

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

Noch nicht eingerichtet. Bei Beginn der Implementierung sind anzulegen:

- Godot-Projektstruktur (`project.godot`) im Repo-Root.
- Build/Export über die Godot-CLI oder den Godot-Editor (Export-Presets definieren).
- Teststrategie: Godot-Unit-Tests für reine Logik (Wurf-Boni, DC-Vergleich, Inventar-Kombinationen); Integrations-Test für den JSON-Request/Response-Zyklus inkl. SQLite-Fallback-Pfad.

## Konventionen

- **Dokumentationssprache:** Deutsch (die Spezifikation `LOBBY-LOOP.md` ist auf Deutsch und bleibt Referenz; Spieltexte und In-Game-Inhalte ebenfalls Deutsch).
- **Code:** Englische Bezeichner für Variablen/Funktionen/Klassen, wie im globalen AGENTS.md des Nutzers vorgegeben.
- **Datenformate:** Kein String-Parsing an den API-Grenzen — nur validiertes JSON. Fehlende oder ungültige Felder in der API-Antwort müssen auf den SQLite-Fallback umschalten, nicht crashen.
- **Game-Design-Inhalte** (Items, Dialoge, Szenen) folgen dem absurden, satirischen Ton der Spezifikation — das ist Absicht, kein Fehler.

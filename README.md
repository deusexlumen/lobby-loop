# LOBBY-LOOP

**Ein politisch-satirisches Point-and-Click-RPG, in dem ein Large Language Model der Spielleiter ist — und die Spielleitung ein schwebender Aktenkoffer.**

Du bist nicht der Held. Du bist der Antragsteller. Irgendwo zwischen
Untersuchungsausschuss, Kommunalpolitik und dem schwarzen Koffer liegt dein
Mandat — und ein LLM entscheidet per W20-Wurf, wie viel davon morgen noch
existiert.

```
        ┌─────────────┐
        │ AKTENKOFFER  │   ← der GM. ja, der koffer.
        │  (animiert,  │
        │  schwebend)  │
        └──────┬───────┘
               │ JSON rein, JSON raus. kein string-parsing.
        ┌──────┴───────┐
        │  GODOT 4.x   │
        │  Client      │
        └──────┬───────┘
               ▼
        ┌─────────────┐         ┌──────────────┐
        │  GM-PROXY    │────────▶│  LLM-API     │
        │  localhost   │  Fallback bei Timeout │
        └──────┬───────┘         └──────────────┘
               ▼
        ┌─────────────┐
        │  SQLite      │  hartcodierte Dialogbäume + feste DCs
        │  (Fallback)  │  compiliert aus deklarativem Content-JSON
        └─────────────┘
```

---

## Was das Spiel mit dir macht

### Der KI-Game-Master ist eine System-Entität

Der GM manipuliert die Welt aktiv, kommentiert dein Scheitern mit
Verwaltungsakzent und bricht physisch durchs Interface — visuell
repräsentiert durch einen animierten, schwebenden Aktenkoffer. Die
Kommunikation läuft ausschließlich über validierte JSON-Payloads in beide
Richtungen. Das LLM liefert **keinen Fließtext**, sondern Maschinen-Code:

```json
{
  "gm_dialogue": "Ein brillanter Schachzug. Die Integrität des Ausschusses sinkt auf Raumtemperatur.",
  "required_roll": "W20",
  "difficulty_class": 12,
  "trigger_event": { "type": "remove_item", "item": "schwarzer_koffer" }
}
```

`trigger_event` ist ein geschlossenes Enum (`add_item`, `remove_item`,
`change_scene`, `modify_stat`, `start_minigame`). Unbekannte Typen verwirft
die Engine mit Warnung — sie fällt nie wegen eines Parse-Fehlers in den
Fallback.

### Der Game Loop

Klassisches Point-and-Click: Mausklick bewegt, Interaktion mit
Systemknoten (NPCs, Akten, Mikrofone) friert das Geschehen ein und öffnet
das P&P-Interface.

1. Du formulierst eine Absicht — oder wählst etwas Absurdes wie *„Aktenordner essen"*.
2. Der GM bewertet den Zynismus-Grad und legt die DC fest (1–20).
3. Du wirfst einen digitalen W20.
4. Boni aus dem Charakterbogen (Berufspolitischer Bonus: +3) und Inventar-Buffs werden addiert.
5. Engine vergleicht mit der DC — der Boolean triggert die nächste Szene.

Das Würfel-Protokoll ist hybrid: Die Engine würfelt clientseitig, sendet
das `roll`-Objekt an `/gm/result`, und der GM kommentiert das Ergebnis —
mit weiterem Command-Event bei Bedarf.

### Das Inventar speichert keine Dinge. Es speichert Konzepte.

LucasArts-Rätsellogik auf abstrakte politische Begriffe angewandt, mit
strenger, aber absurder Kombinationsmatrix:

> **„Die Unschuldsvermutung"** (reinweiße Weste) auf **„Der Schredder"**
> ziehen → ergibt **„Konfetti der Straffreiheit"**.
>
> Anwendung: Den Presse-NPCs ins Gesicht werfen, um deren Line of Sight
> dauerhaft zu blockieren.

### Beleidigungsfechten im Kreuzverhör

Mechanisches Duell gegen den Ermittlungsführer. Die API generiert
spielverlaufsabhängige Vorwürfe; du wählst aus drei PR-Phrasen diejenige,
die **logisch am wenigsten Sinn ergibt, aber politisch unangreifbar ist**.

- Drei gewonnene Runden → der Ermittlungsführer erleidet Burnout.
- Eine verlorene Runde → deine **Fraktionsdisziplin** sinkt.
- Fraktionsdisziplin auf **null** → **Perma-Death**. Der Spielstand wird
  irreversibel gelöscht. Du verlierst dein Mandat und startest neu im
  Startgebiet Kommunalpolitik. Das ist kein Bug, das ist die Kernechanik.

Zwei getrennte Werte steuern deinen Untergang: `alignment_score`
(Zynismus-Kompass, vom GM gesteuert) und `fraktionsdisziplin`
(mechanische Ressource 0–10, die der GM ausschließlich über Engine-Mechanik
verändert — nie direkt).

---

## Architektur

Godot 4.x (Client) ↔ lokaler GM-Proxy (Node, `localhost:8787`) ↔ LLM-API.
Der Proxy nutzt das Routing von `llm-router-blueprint`
(Model×Key-Kaskade, Free-Tier-Quota-Arbitrage — Provider-Keys bleiben
ausschließlich serverseitig).

**Offline-Modus:** Fällt die API aus, greift das Spiel vollständig auf eine
SQLite-Datenbank zurück — statische Dialogbäume und feste DCs, compiliert
aus `content/`-JSON. JSON ist die einzige Content-Quelle.

**Persistenz:** Spielstand als JSON in `user://`, Autosave bei
Szenenwechsel und Minispiel-Ende. Perma-Death überschreibt mit frischem
Start-State.

## Quickstart

Voraussetzungen: **Godot 4.x**, **Node ≥ 22**, **pnpm**.

```bash
# GM-Proxy starten (LLM-Anbindung, localhost:8787)
pnpm install
pnpm run proxy:dev

# Fallback-DB aus Content-JSON neu bauen
pnpm run build:fallback

# Tests (Proxy + Tools)
pnpm test
```

Dann `project.godot` im Godot-Editor öffnen und ab in den Ausschuss.

## Repo-Struktur

| Pfad | Inhalt |
|---|---|
| `LOBBY-LOOP.md` | Die verbindliche System-Spezifikation |
| `scripts/` | GDScript: Autoloads, Core-Logik, UI |
| `gm-proxy/` | LLM-GM-Proxy (Routing, Prompts, Protokoll) |
| `tools/compile-fallback.ts` | Compiliert Content-JSON → SQLite-Fallback |
| `content/` | Deklarativer Spiel-Content (Szenen, Items, Dialoge) |
| `data/fallback.sqlite` | Kompilierte Fallback-Datenbank |
| `CONTEXT.md` | Glossar |
| `docs/adr/` | Architekturentscheidungen |

## Tech-Stack

![Godot 4](https://img.shields.io/badge/Godot-4.x-478cbf?logo=godot-engine&logoColor=white)
![Node](https://img.shields.io/badge/Node-%E2%89%A522-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6?logo=typescript&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-Fallback-003b57?logo=sqlite&logoColor=white)

- **Engine:** Godot 4.x, GDScript, `HTTPRequest`-Nodes für die API
- **GM-Proxy:** Node + TypeScript (`tsx`), `@google/genai`, `llm-router-blueprint`
- **Fallback:** SQLite via godot-sqlite-Addon (Windows-Binaries im Repo; andere Plattformen aus dem [godot-sqlite-Release](https://github.com/2shady4u/godot-sqlite/releases) laden)
- **Tests:** Node-Testrunner (`tsx --test`) für Proxy und Tools, GUT für GDScript-Logik

---

*LOBBY-LOOP ist Satire. Jede Ähnlichkeit mit realen Ausschüssen,
Aufsichtsräten oder Aktenkoffern ist gewollt, aber rein zufällig.*

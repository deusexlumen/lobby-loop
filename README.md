<div align="center">

```
 ██████╗ ██╗      ██████╗ ██████╗ ██████╗ ██╗   ██╗      ██╗      ██████╗  ██████╗ ██████╗
 ██╔══██╗██║     ██╔═══██╗██╔══██╗██╔══██╗╚██╗ ██╔╝      ██║     ██╔═══██╗██╔═══██╗██╔══██╗
 ██████╔╝██║     ██║   ██║██████╔╝██████╔╝ ╚████╔╝       ██║     ██║   ██║██║   ██║██████╔╝
 ██╔═══╝ ██║     ██║   ██║██╔══██╗██╔══██╗  ╚██╔╝        ██║     ██║   ██║██║   ██║██╔═══╝
 ██████╗ ███████╗╚██████╔╝██████╔╝██████╔╝   ██║         ███████╗╚██████╔╝╚██████╔╝██║
 ╚═════╝ ╚══════╝ ╚═════╝ ╚═════╝ ╚═════╝    ╚═╝         ╚══════╝ ╚═════╝  ╚═════╝ ╚═╝
```

### Ein LLM ist der Spielleiter. Der Spielleiter ist ein Aktenkoffer. Du bist der Antragsteller.

<br>

```
                    ████████████████████████████
                  ██░░░░░░░░░░░░░░░░░░░░░░░░░░░░██
                ██░░  ╔══════════════════════╗  ░░██
                ██░░  ║   §§  AMTLICH  §§    ║  ░░██
                ██░░  ║   ┌──────────────┐   ║  ░░██
                ██░░  ║   │  AKTEN-      │   ║  ░░██
                ██░░  ║   │  KOFFER      │   ║  ░░██
                ██░░  ║   │  (schwebt)   │   ║  ░░██
                ██░░  ║   └──────────────┘   ║  ░░██
                ██░░  ╚══════════════════════╝  ░░██
                  ██░░░░░░░░░░░░░░░░░░░░░░░░░░░░██
                    ████████████████████████████
                          ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
                     ↓ bricht physisch durchs interface
```

<br>

![Godot 4](https://img.shields.io/badge/Godot-4.x-478cbf?logo=godot-engine&logoColor=white)
![Node](https://img.shields.io/badge/Node-%E2%89%A522-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6?logo=typescript&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-Fallback-003b57?logo=sqlite&logoColor=white)
![LLM-GM](https://img.shields.io/badge/GM-LLM-orange)
![Perma-Death](https://img.shields.io/badge/Perma--Death-aktiv-red)

</div>

---

## ⚠ Wer du bist

Du bist **nicht** der Held.
Du bist der **Antragsteller**.
Irgendwo zwischen Untersuchungsausschuss, Kommunalpolitik und dem
schwarzen Koffer liegt dein Mandat — und ein LLM entscheidet per W20-Wurf,
wie viel davon morgen noch existiert.

```
    ┌──────────────────────────────────────────────────────────┐
    │  MANDAT  ████████████████████████░░░░░░░░  noch ~62%    │
    │  INTEGRITÄT DES AUSSCHUSSES  ░░░░░░░░░░░░░  raumtemperatur│
    │  FRAKTIONSDISZIPLIN  ██████░░░░░░░░░░░░░░░  nervös       │
    └──────────────────────────────────────────────────────────┘
```

---

## 🗂 Architektur — JSON rein, JSON raus, kein String-Parsing

```
        ┌─────────────────────────────┐
        │      ▄▄ AKTENKOFFER ▄▄      │
        │   (animiert · schwebend ·   │   Der GM als System-Entität:
        │    durchbricht Interface)   │   manipuliert, kommentiert,
        └──────────────┬──────────────┘   verwaltet aktenkundig.
                       │  { validiertes JSON }
                       ▼
        ┌─────────────────────────────┐
        │       GODOT 4.x CLIENT      │
        │  Point-and-Click · W20 ·    │
        │  P&P-Interface · Inventar   │
        └──────────────┬──────────────┘
                       ▼
        ┌─────────────────────────────┐         ┌──────────────────────┐
        │      GM-PROXY (Node)        │────────▶│      LLM-API         │
        │  localhost:8787             │  kaskade │  Model × Key         │
        │  llm-router-blueprint       │  routing │  Free-Tier-Arbitrage │
        │  Keys nur serverseitig!     │         │  (keys nie im repo)  │
        └──────────────┬──────────────┘         └──────────────────────┘
                       ▼   API weg? kein problem.
        ┌─────────────────────────────┐
        │   SQLITE-FALLBACK           │
        │   hartcodierte dialogbäume  │   compiliert aus content/-JSON
        │   feste DCs. sofort.        │   (JSON = einzige content-quelle)
        └─────────────────────────────┘
```

---

## 🎲 Der Game Loop

```
  ┌──────────┐   ┌──────────────────┐   ┌──────────────┐   ┌────────────┐   ┌──────────────┐
  │ klicke   │──▶│ formuliere       │──▶│ GM legt DC   │──▶│ W20 + boni │──▶│ success?     │
  │ knoten   │   │ absicht          │   │ (1–20) fest  │   │ vs. DC     │   │ nächste szene│
  │ an       │   │ („aktenordner    │   │ nach         │   │            │   │              │
  │          │   │  essen" geht)    │   │ zynismusgrad │   │            │   │              │
  └──────────┘   └──────────────────┘   └──────────────┘   └────────────┘   └──────────────┘
        ▲                                                                            │
        └──────────────────────────── gm kommentiert über /gm/result ◄───────────────┘
```

Das Würfel-Protokoll ist **hybrid**: Die Engine würfelt clientseitig,
sendet das `roll`-Objekt zurück an den GM, der das Ergebnis kommentiert —
mit weiterem Command-Event bei Bedarf.

### Der Vertrag (Beispiel)

**Request (Godot → API)** — jede Interaktion sendet den exakten Systemstatus:

```json
{
  "player_inventory": ["unschuldsvermutung", "schwarzer_koffer"],
  "current_scene": "Untersuchungsausschuss",
  "alignment_score": -4,
  "fraktionsdisziplin": 5,
  "player_input": "Ich biete dem Vorsitzenden einen Aufsichtsratsposten an."
}
```

**Response (API → Godot)** — Maschinen-Code, kein Fließtext:

```json
{
  "gm_dialogue": "Ein brillanter Schachzug. Die Integrität des Ausschusses sinkt auf Raumtemperatur.",
  "required_roll": "W20",
  "difficulty_class": 12,
  "trigger_event": { "type": "remove_item", "item": "schwarzer_koffer" }
}
```

`trigger_event` ist ein **geschlossenes Enum**: `add_item`, `remove_item`,
`change_scene`, `modify_stat`, `start_minigame`. Unbekannte Typen verwirft
die Engine mit Warnung — sie fällt **nie** wegen eines Parse-Fehlers in den
Fallback.

---

## 🧩 Das Inventar speichert keine Dinge. Es speichert Konzepte.

LucasArts-Rätsellogik, angewandt auf abstrakte Politik — mit strenger,
aber absurder Kombinationsmatrix:

```
   ┌──────────────────┐        ┌──────────────────┐
   │ DIE              │        │ DER              │
   │ UNSCHULD-        │   +    │ SCHREDDER        │
   │ VERMUTUNG        │        │ (büro-objekt)    │
   │ (reinweiße weste)│        └────────┬─────────┘
   └────────┬─────────┘                 │
            └───────────────▶ ══════════╪══════════ ◀───────────┐
                                      ▼                        │
                        ┌─────────────────────────┐             │
                        │ KONFETTI DER            │             │
                        │ STRAFFREIHEIT           │─────────────┘
                        └───────────┬─────────────┘   anwendung:
                                    ▼                 presse-NPCs ins
                        ┌─────────────────────────┐   gesicht werfen →
                        │ LINE OF SIGHT dauerhaft │   LoS dauerhaft
                        │ blockiert.              │   blockiert.
                        └─────────────────────────┘
```

---

## ⚔ Beleidigungsfechten — das Kreuzverhör als Duell

```
   DU                                        ERMITTLUNGSFÜHRER
   ──                                        ─────────────────
   wähle aus 3 PR-phrasen die,                 generiert vorwürfe,
   die LOGISCH AM WENIGSTEN                    spielverlaufsabhängig,
   SINN ERGIBT, aber                           via /minigame/round
   POLITISCH UNANGREIFBAR ist
        │                                          │
        └──────▶ /minigame/judge ◀─────────────────┘
                        │
        ┌───────────────┼────────────────┐
        ▼               ▼                ▼
   3 runden gewonnen   1 runde verloren  disziplin = 0
   ────────────────    ────────────────  ─────────────
   ERMITTLUNGSFÜHRER   fraktions-        P E R M A - D E A T H
   ERLEIDET BURNOUT    disziplin ↓       spielstand IRREVERSIBEL
   (szene gewonnen)                      gelöscht. neustart:
                                         kommunalpolitik.
```

Zwei getrennte Werte steuern deinen Untergang:

| Wert | Steuerung | Bedeutung |
|---|---|---|
| `alignment_score` | GM-gesteuert | Zynismus-Kompass |
| `fraktionsdisziplin` | nur via Engine-Mechanik | Ressource 0–10 · **0 = Perma-Death** |

> Das ist kein Bug. Das ist die Kernechanik.

---

## 🚀 Quickstart

Voraussetzungen: **Godot 4.x** · **Node ≥ 22** · **pnpm**

```bash
# 1. GM-Proxy starten (LLM-Anbindung, localhost:8787)
pnpm install
pnpm run proxy:dev

# 2. Fallback-DB aus Content-JSON neu bauen
pnpm run build:fallback

# 3. Tests (Proxy + Tools)
pnpm test
```

Dann `project.godot` im Godot-Editor öffnen — und ab in den Ausschuss.

---

## 🗺 Repo-Struktur

| Pfad | Inhalt |
|---|---|
| `LOBBY-LOOP.md` | 📜 Die verbindliche System-Spezifikation |
| `scripts/` | 🕹 GDScript: Autoloads, Core-Logik, UI |
| `gm-proxy/` | 🧠 LLM-GM-Proxy (Routing, Prompts, Protokoll) |
| `tools/compile-fallback.ts` | 🏭 Compiliert Content-JSON → SQLite-Fallback |
| `content/` | 📦 Deklarativer Spiel-Content (Szenen, Items, Dialoge) |
| `data/fallback.sqlite` | 🗄 Kompilierte Fallback-Datenbank |
| `CONTEXT.md` | 📖 Glossar |
| `docs/adr/` | 🏛 Architekturentscheidungen |

## 🧰 Tech-Stack

- **Engine:** Godot 4.x, GDScript, `HTTPRequest`-Nodes für die API
- **GM-Proxy:** Node + TypeScript (`tsx`), `@google/genai`, `llm-router-blueprint`
- **Fallback:** SQLite via godot-sqlite-Addon (Windows-Binaries im Repo; andere Plattformen aus dem [godot-sqlite-Release](https://github.com/2shady4u/godot-sqlite/releases) laden)
- **Tests:** Node-Testrunner (`tsx --test`) für Proxy und Tools, GUT für GDScript-Logik

---

<div align="center">

```
   §§§  LOBBY-LOOP ist satire.  §§§
   jede ähnlichkeit mit realen ausschüssen,
   aufsichtsräten oder schwebenden aktenkoffern
   ist gewollt, aber rein zufallsbedingt.
```

</div>

# 10x Analysis: LOBBY-LOOP

Session 1 | Date: 2026-09-17

## Current Value

LOBBY-LOOP ist ein spielbarer Prototyp: Godot-4-Client mit komplettem Kern-Loop
(Szenen → Hotspots → Intent → GM-DC → W20 mit Boni → Ergebnis → Events →
Inventar-Kombis → Beleidigungsfechten → Perma-Death), dazu ein statelesser
GM-Proxy (Gemini, llm-router-blueprint) und ein SQLite-Fallback. Kernwert
heute: **der satirische LLM-GM, der Maschinen-Code statt Fließtext liefert**
— das closed-Enum-Protokoll ist gebaut und getestet (36 GUT-Tests, 34 Proxy-Tests).

Belegte Lücken (Stand Skeleton):

- **2 Szenen, 9 Knoten, 7 Items, 2 Kombinationen** — der Loop ist da, die Welt ist fast leer.
- **Item-Buffs implementiert, aber im Content ungenutzt** (`GameState.gd` liest `buff`-Felder; kein Item hat eines).
- **Proxy ist komplett zustandslos** — jeder Call ist ein einzelner Prompt ohne Verlauf. Der GM „vergisst" alles nach jeder Aktion.
- **Minigame-Fallback ist auswendig lernbar**: 7 Runden, `correct_index` immer Index 2.
- **Keine Art/Audio-Assets** — komplette UI ist code-gezeichnet (ColorRect/Button).
- `llm-router-blueprint` ist `file:`-Dependency auf ein Sibling-Repo (Skalierungs-/CI-Risiko).

## The Question

Was macht LOBBY-LOOP 10x wertvoller — nicht 10% polierter?

Die Antwort hängt an der einen Säule, die das Projekt von jedem anderen
Point-and-Click unterscheidet: **der GM ist ein LLM mit einer Persönlichkeit.**
Alles, was diese Beziehung vertieft, ist Hebel. Alles, was sie austauschbar macht, ist Verlust.

---

## Massive Opportunities

### 1. GM-Gedächtnis (Episodic Memory)
**What**: Der Proxy führt pro Spielstand eine verdichtete Session-Chronik
(Ereignis-Timeline, getroffene NPCs, laufende Gags, begangene Verräte).
Jeder Prompt enthält die relevanten Ausschnitte; der GM kommentiert mit
Rückbezug: *„Das ist bereits das zweite Mal, dass Sie einen Koffer
'verlegen', Herr Antragsteller."*
**Why 10x**: Heute ist jede Aktion eine One-Night-Stand. Mit Gedächtnis wird
aus einer Sammlung von Einzelrunden eine **Kampagne mit Kontinuität** — genau
das, was Pen-and-Paper ausmacht und was kein klassischer Point-and-Click kann.
**Unlocks**: Wiederkehrende NPCs, persönliche Satire (der GM kennt deine
Schwachstellen), Running Gags, tragische Bögen, echte Alignment-Konsequenzen
über Szenen hinweg.
**Effort**: Hoch (Chronik-Schema, Relevanz-Auswahl, Token-Budget, Save-Format).
**Risk**: Token-Kosten steigen; schlechte Relevanz-Auswahl erzeugt
Halluzinationen über „vergangene" Ereignisse. Mit Fakten-Log (nur
validierte Events) statt freier Zusammenfassung beherrschbar.
**Score**: 🔥

### 2. UGC-Szenen-Editor mit GM-Playtest („Bau deinen eigenen Skandal")
**What**: Spieler schreiben eigene Szenen/Items/Kombinationen als Content-JSON
(einziges Content-Format ohnehin, vgl. ADR-0002). Der GM **playtestet** beim
Import: bewertet DCs, prüft Kombinations-Logik auf Absurditäts-Niveau,
generiert Fallback-Dialoge. Gut bewertete Community-Szenen werden geteilt.
**Why 10x**: Wandelt das Spiel von „Inhalt, den wir selbst bauen müssen" in
eine **Plattform** um. Der Content-Engpass (2 Szenen!) wird zum Netzwerk-Effekt.
**Unlocks**: Endlos-Content, Community, virale Szenen („spiel den
Wirecard-Untersuchungsausschuss nach").
**Effort**: Sehr hoch (Editor-UX, Validierungspipeline, Sharing).
**Risk**: Qualitätskontrolle; GM-Bewertung muss nachvollziehbar bleiben.
**Score**: 👍 (strategische Wette, nach Gedächtnis)

### 3. Perma-Death als viraler Moment: GM-generierte Karriere-Akte
**What**: Bei Perma-Death (und bei Run-Ende) generiert der GM eine
**amtliche Karriere-Zusammenfassung** — das satirische Gegenstück zu
Rogue-like-Death-Recaps: Mandatsdauer, Zynismus-Kurve, größte Verfehlungen,
vollständige Inventar-Verbrennung, ein absurdes Zitat als Epitaph.
**Why 10x**: Perma-Death ist heute ein harter Reset mit Frust. Als
teilbare, persönlich-generierte „Akte" wird er zum **Werbeträger** — jeder
Run erzeugt ein sharebares Artefakt. Der momentan größte Schmerzpunkt des
Spiels (irreversibler Verlust) wird zum stärksten Marketing-Asset.
**Unlocks**: Share-Buttons, Run-Vergleiche, Bestenliste der dümmsten Tode.
**Effort**: Mittel (ein neuer Proxy-Endpunkt `/run/epitaph`, Prompt + Schema).
**Risk**: Generation bei Disconnect → Fallback-Epitaphs nötig. Niedrig.
**Score**: 🔥

### 4. Stream-Modus: Zuschauer als Fraktion
**What**: Twitch-Integration — Zuschauer stimmen per Chat über
„Fraktionsdruck" ab (Sondierungsoptionen, Timed-Decisions). Der GM
kommentiert den Chat als „Pressepool".
**Why 10x**: Satire + LLM-Persönlichkeit + Live-Audience ist ein
natürliches Streaming-Format. Zuschauer werden zu Mitverschwörern; jeder
Stream ist Demo-Werbung.
**Effort**: Hoch (Twitch-API, Rate-Limits, GM-Prompt muss Chat verdauen).
**Risk**: Prompt-Injection über Chat-Nachrichten — strikte Trennung:
Chat ist Daten, nie Instruktion.
**Score**: 🤔 (strategisch heiß, aber nach Gedächtnis + Core-Content)

### 5. Der Aktenkoffer kriegt eine Stimme (TTS)
**What**: GM-Dialoge per TTS gesprochen, verzerrt/bürokratisch gefiltert.
Der schwebende Koffer wird auditiv präsent.
**Why 10x**: Verwandelt Textwalls in **Präsenz**. Die Persona, für die die
README wirbt, existiert dann wirklich.
**Effort**: Mittel (TTS-API, Audio-Pipeline in Godot).
**Risk**: Latenz; deutsche Stimmen-Qualität; Kosten. Optional schaltbar halten.
**Score**: 👍

### 6. Offline-GM mit lokalem Kleinstmodell (statt nur statischer Bäume)
**What**: Fallback ist heute starr (fallback_dialogue + default_dc). Optional
kann ein lokales Modell (via Ollama o. ä.) die GM-Rolle übernehmen, gleiches
JSON-Protokoll.
**Why 10x**: Macht das Spiel **überall spielbar** mit lebendigem GM statt
nur Dialog-Baum. Der Fallback verwandelt sich vom Notbehelf zum Feature.
**Effort**: Hoch (Modell-Qualität am Protokoll messen, Distribution).
**Risk**: Kleine Modelle brechen das JSON-Contract — mehr Retries, schlechtere
DCs. Evaluierung nötig.
**Score**: 🤔

---

## Medium Opportunities

### 1. Content-Expansion mit echten Buffs
**What**: Das `buff`-System existiert (`GameState.gd`), wird aber von keinem
Item genutzt. Content-JSON um Buff-Items erweitern (z. B.
„Schmiergeld" → +2 auf Überzeugungswürfe) und Szenen 3–5 bauen.
**Why 10x**: Nicht das Buff-System ist der Hebel — der **Mechanik-Reichtum im
Spielererlebnis** ist es. Jede neue mechanische Dimension macht den GM
bemerkbarer, weil er darauf reagieren muss.
**Impact**: Der Loop fühlt sich sofort tiefener an; DCs des GMs bekommen
mehr Kontur (er sieht Buffs im Systemstatus).
**Effort**: Mittel (Content-Arbeit, kein Code).
**Score**: 🔥

### 2. Die Akte über den Spieler (Case File)
**What**: Der GM führt eine einklagbare Akte: laufende Verfehlungen,
verbrannte Items, wiederholte Ausreden. Sichtbar als UI-Panel („Ermittlungsstand").
**Why 10x**: Verwandelt den Alignment-Score von abstrakter Zahl in
**sichtbare Konsequenz**. Der Spieler sießt den Strick, an dem er gehängt wird.
**Effort**: Mittel (Fakten-Event-Log existiert implizit über trigger_events;
nur aggregieren + anzeigen).
**Score**: 👍

### 3. Minigame-Fallback randomisieren
**Beleg**: `content/fallback/minigame.json` — 7 Runden, `correct_index`
immer Index 2. Offline-Spieler lernen das auswendig; das Minispiel kippt.
**What**: `correct_index` im Client-Load mischen (Order der phrases permutieren).
**Effort**: Niedrig.
**Score**: 🔥 (Bug-Niveau, Spielbrett-Vertrauen)

### 4. Wurf-Inszenierung + Aktenkoffer-Reaktionen
**What**: W20 mit Animationsdrama (Koffer schwebt heran, würfelt selbst mit),
GM-Dialog mit Typewriter-Effekt, Koffer-Animation je nach Ergebnis
(schneller bei Erfolg, dramatisches Zögern bei Crit-Fail).
**Why 10x**: Der Wurf ist der emotionale Höhepunkt jedes Loops — er ist
heute funktional, nicht inszeniert. Delight direkt am Kernmoment.
**Effort**: Mittel (Godot-Tweens, `briefcase.gd` existiert).
**Score**: 👍

### 5. Run-Metriken & Wiederholbarkeit
**What**: Pro Run: Zynismus-Kurve als Graph, geworfene Würfe, verbrannte
Items, Minigame-Quote. Seed-basierte GM-Varianten (gleiche Szene, andere
Vorwürfe).
**Effort**: Mittel.
**Score**: 🤔 (wird mit Karriere-Akte zusammen stark)

---

## Small Gems

### 1. Item-Buffs im Content aktivieren
**What**: Erstes Buff-Item in `items.json` ergänzen.
**Effort**: Sehr niedrig. **Score**: 🔥

### 2. Roll-History im P&P-Overlay
**What**: Letzte 3 Würfe mit Bonus-Aufschlüsselung sichtbar („letzter wurf: 14 +3 berufspolitisch +2 schmiergeld = 19 vs DC 12").
**Why powerful**: Boni sind heute unsichtbar; Sichtbarkeit = Vertrauen ins System.
**Effort**: Niedrig. **Score**: 🔥

### 3. Offline-Indikator mit Persönlichkeit
**What**: Statt „Offline-Modus"-Toast: der Koffer „dient sich aus" („Der Koffer ist in einer Sitzung. Sie spielen jetzt gegen seine Vertretung.").
**Effort**: Niedrig. **Score**: 👍

### 4. Zynismus-Tacho
**What**: `alignment_score` als sichtbarer Tacho/Waage im HUD statt nur Payload-Feld.
**Effort**: Niedrig. **Score**: 👍

---

## Recommended Priority

### Do Now (Quick Wins)
1. **Minigame-Fallback randomisieren** — auswendig lernbarer Index 2 ist ein
   Vertrauensbruch, Fix ist trivial. Impact: Minispiel bleibt offline echt.
2. **Erstes Buff-Item + Roll-History** — zwei Tage Arbeit, machen den Kern-
   Loop sofort greifbarer. Impact: Mechanik wird sichtbar.
3. **`llm-router-blueprint` als echtes Paket oder Vendoren** — `file:`-
   Dependency auf `../llm-router-blueprint` bricht jeden CI/Clone, der nicht
   auf LOs Maschine liegt. Impact: Repo ist überhaupt erst reproduzierbar.

### Do Next (High Leverage)
1. **Karriere-Akte bei Perma-Death** (`/run/epitaph`) — macht den größten
   Schmerzpunkt zum sharebaren Artefakt. Unlocks: Viralität, Run-Metriken.
2. **Content-Expansion Szenen 3–5 mit Buff-Items** — die Welt füllen, damit
   der GM etwas hat, auf das er reagieren kann.
3. **Case-File-Panel (Ermittlungsstand)** — Konsequenzen sichtbar machen.

### Explore (Strategic Bets)
1. **GM-Gedächtnis** — die eigentliche 10x-Bewegung: aus Einzelrunden wird
   Kampagne. Risk: Token-Budget + Relevanzauswahl; Upside: alleinige
   Differenzierung, nicht kopierbar durch „wir nutzen auch ein LLM".
   **Empfehlung: als Prototyp direkt nach den Quick Wins anfangen.**
2. **TTS-Stimme für den Koffer** — nach Gedächtnis, verstärkt die Persona.
3. **UGC-Editor mit GM-Playtest** — Plattform-Wette; erst evaluieren, wenn
   Core-Content > 5 Szenen steht.

### Backlog (Good but not now)
1. **Stream-/Twitch-Modus** — Injection-Risiken klären, Chat als
   Prompt-Daten behandeln; erst wenn die Kampagne (Gedächtnis) steht.
2. **Lokaler Offline-GM (Kleinstmodell)** — Evaluierung nach Protokoll-Treue;
   bis dahin ist der SQLite-Fallback vollständig genug.
3. **Multiplayer-Koalition** — Spekulativ; das Spiel lebt an der
   Einzelperspektive gegen den Apparat.

---

## Questions

### Answered
- **Q**: Ist der Kern-Loop spielbar? **A**: Ja — belegt: Szenen, Hotspots,
  W20+Boni, Events, Kombis, Minispiel, Perma-Death, Autosave (Snapshot der
  explore-Agentur).
- **Q**: Was ist der größte narrative Engpass? **A**: Statelesser Proxy —
  keinerlei Verlauf zwischen Calls.
- **Q**: Wo ist der Content-Engpass? **A**: 2 Szenen/9 Knoten/2 Kombis; Buff-
  Pfad ungenutzt.

### Blockers
- **Q**: Soll das Gedächtnis serverseitig (Proxy) oder clientseitig (Savegame)
  leben? Beeinflusst Datenschutz, Multi-Device, Token-Budget. (Architektur-
  Entscheidung → ADR nötig.)
- **Q**: Budget/Obergrenze für LLM-Kosten pro Run? Skaliert direkt mit
  Gedächtnis + TTS + Epitaph.
- **Q**: Zielplattformen (Steam? Itch? nur selbst spielen?) — entscheidet, ob
  Share-Features und UGC-Priorität bekommen.

## Next Steps
- [ ] Fix: `correct_index` im Minigame-Fallback permutieren (Client-seitig beim Laden)
- [ ] Buff-Item in `items.json` + Buff-Sichtbarkeit (Roll-History im Overlay)
- [ ] `llm-router-blueprint` dep absichern (Registry-Package oder Vendor ins Repo)
- [ ] ADR skizzieren: GM-Gedächtnis (Speicherort, Fakten-Log vs. Summary, Token-Budget)
- [ ] Prototyp `/run/epitaph` spezifizieren (Schema, Fallback-Epitaphs)

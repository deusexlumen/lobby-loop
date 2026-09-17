SYSTEM-SPEZIFIKATION: DIGITALES POINT-&-CLICK-RPG
CODENAME: LOBBY-LOOP
 * Technische Architektur & Stack
   Engine: Godot 4.x. Die Engine bietet nativen 2D-Support und integriert externe APIs direkt über HTTPRequest-Nodes.
   Schnittstelle: REST-API-Anbindung an ein Large Language Model. Die Kommunikation erfolgt ausschließlich über strukturierte JSON-Payloads. Dies verhindert String-Parsing-Fehler innerhalb der Game Engine.
   Fallback-System: Eine lokale SQLite-Datenbank enthält hartcodierte Dialogbäume und Standard-DCs (Difficulty Classes). Das Spiel greift auf diese Datenbank zu, sobald API-Timeouts oder Verbindungsabbrüche auftreten.
 * LLM-Integration (Der KI-Game-Master)
   Die KI agiert als System-Entität. Sie manipuliert aktiv die Spielwelt und kommentiert das Geschehen. Visuelle Repräsentation: Ein animierter, schwebender Aktenkoffer, der das Interface physisch durchbricht.
Request-Payload (Godot an API):
Jede Spielerinteraktion sendet den exakten Systemstatus an das LLM.
{
"player_inventory": ["unschuldsvermutung", "schwarzer_koffer"],
"current_scene": "Untersuchungsausschuss",
"alignment_score": -4,
"fraktionsdisziplin": 5,
"player_input": "Ich biete dem Vorsitzenden einen Aufsichtsratsposten an."
}
```

**Stat-System:** `alignment_score` (Zynismus-Kompass, vom GM gesteuert) und `fraktionsdisziplin` (mechanische Ressource 0–10, Perma-Death bei 0) sind zwei getrennte Werte. Der GM verändert `fraktionsdisziplin` ausschließlich durch die Engine-Mechanik, nie direkt.
Response-Payload (API an Godot):
Das LLM liefert zwingend Maschinen-Code zurück, den die Engine in Spielmechanik übersetzt.
{
"gm_dialogue": "Ein brillanter Schachzug. Die Integrität des Ausschusses sinkt auf Raumtemperatur.",
"required_roll": "W20",
"difficulty_class": 12,
"trigger_event": { "type": "remove_item", "item": "schwarzer_koffer" }
}
```

**Command-Events:** `trigger_event` ist ein geschlossenes Enum von Command-Objekten (kein String-Parsing): `add_item` {item}, `remove_item` {item}, `change_scene` {scene}, `modify_stat` {stat: "alignment"|"discipline", delta}, `start_minigame`. Unbekannte Typen verwirft die Engine mit Warnung — der SQLite-Fallback greift nie wegen eines Parse-Fehlers.

**Würfel-Protokoll (Hybrid):** Die Engine würfelt den W20 clientseitig, addiert die Boni und vergleicht mit der DC. Das Ergebnis wird anschließend als `roll`-Objekt `{dice, value, bonuses, total, difficulty_class, success}` an `/gm/result` gesendet; der GM kommentiert und liefert ggf. ein weiteres Command-Event.

**Beleidigungsfechten-Protokoll (Zwei Requests):** `/minigame/round` liefert `{accusation, phrases[3]}`; nach der Wahl bewertet `/minigame/judge` `{accusation, chosen_index, phrase}` mit `{correct, correct_index, commentary}`.
 * Kernmechanik (Game Loop)
   Die Fortbewegung im Raum erfolgt klassisch per Mausklick. Interagiert der Spieler mit systemrelevanten Knotenpunkten (NPCs, Akten, Mikrofone), friert das Spielgeschehen ein. Das P&P-Interface überlagert den Bildschirm.
Ablauf einer Aktion:
 * Der Spieler formuliert seine Absicht per Textfeld oder wählt eine absurde Aktion (z.B. "Aktenordner essen").
 * Der KI-GM liest die Aktion, bewertet den Zynismus-Grad und legt die DC fest (1 bis 20).
 * Der Spieler wirft einen digitalen 20-seitigen Würfel (W20).
 * Statische Boni aus dem Charakterbogen (z.B. Berufspolitischer Bonus: +3) und temporäre Inventar-Buffs werden auf den Wurf addiert.
 * Die Engine vergleicht den finalen Wert mit der DC. Der Boolean-Wert (Success/Fail) triggert die nächste Szene.
 * LucasArts-Rätselmatrix (Abstrakte Inventar-Logik)
   Das Inventar speichert keine physischen Gegenstände, sondern abstrakte politische Konzepte. Diese müssen nach strenger, aber absurder Logik kombiniert werden.
Beispiel-Matrix:
Item A: "Die Unschuldsvermutung" (dargestellt als reinweiße Weste).
Item B: "Der Schredder" (Umgebungsobjekt im Büro).
Kombination: Der Spieler zieht Item A auf Item B. Das Resultat ist das neue Inventar-Item "Konfetti der Straffreiheit".
Anwendung: Das Konfetti wird im nächsten Raum den Presse-NPCs ins Gesicht geworfen, um deren Sichtlinie (Line of Sight) dauerhaft zu blockieren.
 * Das Untersuchungsausschuss-Minispiel (Beleidigungsfechten)
   Das Kreuzverhör funktioniert als mechanisches Duell. Die LLM-API generiert spezifische, auf den Spielverlauf angepasste Vorwürfe. Der Spieler wählt aus drei PR-Phrasen diejenige, die logisch am wenigsten Sinn ergibt, aber politisch unangreifbar ist.
Regelwerk:
Gewinnt der Spieler drei Runden, erleidet der Ermittlungsführer einen Burnout (Szene gewonnen).
Verliert der Spieler, sinkt der Charakter-Wert "Fraktionsdisziplin". Fällt dieser Wert auf null, löscht das System den Spielstand irreversibel (Perma-Death). Der Spieler verliert sein Mandat und muss im Startgebiet (Kommunalpolitik) neu beginnen.

 * Implementierungs-Anhang (Stand Skeleton, abweichend/ergänzend zur Ursprungsspez)

   - **Architektur:** Godot 4.x (Client) ↔ lokaler GM-Proxy (Node, localhost:8787) ↔ LLM-API. Der Proxy nutzt das Routing von `llm-router-blueprint` (Model×Key-Kaskade, Free-Tier-Quota-Arbitrage, Provider-Keys nur serverseitig).
   - **Offline-Modus:** Vollständiger Fallback — statische Dialogbäume und feste DCs aus einer SQLite-DB, die aus deklarativem Content-JSON compiliert wird (JSON ist die einzige Content-Quelle).
   - **Persistenz:** Spielstand als JSON in `user://` (Autosave bei Szenenwechsel/Minispiel-Ende); Perma-Death überschreibt mit frischem Start-State.
   - **Doku:** Glossar in `CONTEXT.md`, Architekturentscheidungen in `docs/adr/`.

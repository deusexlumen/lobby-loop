# LOBBY-LOOP

Digitales Point-and-Click-RPG mit politisch-satirischem Setting. Der Game Master ist ein Large Language Model, das als System-Entität agiert, jede Spieleraktion bewertet und die Spielwelt durch Maschinen-Befehle manipuliert.

## Language

**Game Master (GM)**:
Die KI-System-Entität, die Aktionen bewertet, Schwierigkeitsgrade festlegt und das Geschehen kommentiert. Erscheinungsform: ein schwebender Aktenkoffer, der das Interface physisch durchbricht.
_Avoid_: LLM, KI, Chatbot, Narrator

**Alignment-Score**:
Der Zynismus-Kompass des Spielers — eine freie Ganzzahl, die der GM nach jeder Aktion nach oben oder unten schiebt. Beeinflusst Ton und Reaktionen der Spielwelt.
_Avoid_: Moral, Karma, Reputation

**Fraktionsdisziplin**:
Mechanische Ressource des Spielers (Bereich 0–10, Start 5). Sinkt bei verlorenen Beleidigungsfechten; bei 0 folgt Perma-Death. Wird ausschließlich durch Spielmechanik verändert, nie direkt vom GM.
_Avoid_: Lebenspunkte, HP, Treue

**Schwierigkeitsgrad (DC)**:
Die Zahl 1–20, die der GM nach dem Zynismus-Grad einer Aktion festlegt. Der finale Würfelwert plus Boni muss sie erreichen oder übertreffen.
_Avoid_: Schwierigkeit, Zielzahl (ungenau), Threshold

**W20-Wurf**:
Der digitale 20-seitige Würfelwurf einer Aktion plus additive Boni aus Charakterbogen und Inventar, verglichen mit dem DC. Ergebnis ist ein Boolean: Erfolg oder Misserfolg.
_Avoid_: Check, Probe (Paper-Roll-Vokabular bleibt im P&P-Interface-Flavour erlaubt, der Mechanik-Begriff ist W20-Wurf)

**Konzept-Item**:
Ein abstraktes politisches Konzept im Inventar (z. B. „Die Unschuldsvermutung", dargestellt als reinweiße Weste) — niemals ein physischer Gegenstand.
_Avoid_: Item, Gegenstand, Objekt

**Kombinationsmatrix**:
Das streng logische, absurde Regelwerk, nach dem zwei Konzept-Items zu einem neuen Konzept-Item kombiniert werden (z. B. Unschuldsvermutung + Schredder → „Konfetti der Straffreiheit").
_Avoid_: Crafting, Rezept, Fusion

**Szenen-Knoten**:
Ein interaktiver Punkt in einer Szene — NPC, Akte/Umgebungsobjekt oder Mikrofon. Anklicken friert das Geschehen ein und öffnet das P&P-Interface.
_Avoid_: Hotspot, Interaktionspunkt, Trigger

**Command-Event**:
Der Maschinen-Befehl, mit dem der GM die Engine steuert — ein geschlossenes Enum von Befehlen (Item geben/nehmen, Szene wechseln, Stat verändern, Minispiel starten). Nie ein frei parsbarer String.
_Avoid_: trigger_event (Implementierungsname), Befehlsstring, Aktion

**Beleidigungsfechten**:
Das Kreuzverhör-Duell gegen den Ermittlungsführer: Der GM erzeugt vorwurfsabhängige Angriffe, der Spieler pariert mit der politisch unangreifbarsten PR-Phrase. Drei gewonnene Runden bedeuten Burnout des Ermittlungsführers; eine verlorene Runde kostet Fraktionsdisziplin.
_Avoid_: Duell-Minispiel, Verhör, Debatte

**Offline-Modus**:
Der vollständig spielbare Zustand ohne LLM-Anbindung: statische Dialogbäume und feste DCs ersetzen den GM. Tritt bei API-Ausfall automatisch ein, ohne Datenverlust.
_Avoid_: Fallback (Implementierungsname), Notmodus

**Perma-Death**:
Das irreversible Löschen des Spielstands bei Fraktionsdisziplin 0 — der Spieler verliert sein Mandat und beginnt im Startgebiet (Kommunalpolitik) neu. Kernechanik, kein Fehlerzustand.
_Avoid_: Game Over, Neustart, Wipe

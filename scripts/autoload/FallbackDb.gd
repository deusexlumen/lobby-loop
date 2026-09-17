# PURPOSE: Offline-Fallback ueber godot-sqlite (nodes, minigame_rounds), liefert Proxy-kompatible Dictionaries.
# ARCHITECTURE: autoload
# DEPENDENCIES: godot-sqlite (GDExtension, Klasse SQLite), StatRules, MinigameShuffle
# PIPELINE: runtime
# LAST_VALIDATED: 2026-09-17
extends Node

const DB_PATH := "res://data/fallback.sqlite"

var db: Object = null
var available := false

var _round_robin_index := 0


func _ready() -> void:
	if not FileAccess.file_exists(DB_PATH):
		push_warning("FallbackDb: %s fehlt — Offline-Modus mit generischen Antworten." % DB_PATH)
		return
	var sqlite: Object = ClassDB.instantiate("SQLite")
	if sqlite == null:
		push_warning("FallbackDb: SQLite-GDExtension nicht verfuegbar.")
		return
	sqlite.path = DB_PATH
	var open_result: Variant = sqlite.open_db()
	var opened: bool = (typeof(open_result) == TYPE_BOOL and bool(open_result)) or open_result == OK
	if not opened:
		push_warning("FallbackDb: open_db() fehlgeschlagen — Offline-Modus mit generischen Antworten.")
		return
	db = sqlite
	available = true


## Aktion ohne API: fallback_dialogue + default_dc des Knotens aus der nodes-Tabelle,
## sonst generische GM-Antwort. Dictionary-Form exakt wie POST /gm/action.
func get_action_fallback(scene_id: String, node_id: String) -> Dictionary:
	var dialogue := "Der Aktenkoffer schwebt ratlos vorbei. 'Im Offline-Modus bleibe ich geheimnisvoll.'"
	var dc := 10
	if available:
		var rows := _query_nodes(scene_id, node_id)
		if not rows.is_empty():
			var row: Dictionary = rows[0]
			if not str(row.get("fallback_dialogue", "")).is_empty():
				dialogue = str(row["fallback_dialogue"])
			dc = StatRules.clamp_dc(int(row.get("default_dc", dc)))
	return {
		"gm_dialogue": dialogue,
		"required_roll": "W20",
		"difficulty_class": dc,
		"trigger_event": null,
	}


## Minispiel-Runde (scene-agnostisch, Round-Robin ueber minigame_rounds).
## Liefert {"accusation", "phrases", "correct_index"}; phrases ist ein Array.
## Die Phrasen werden pro Abruf deterministisch neu gemischt, damit der
## korrekte Index nicht auswendig gelernt werden kann (Content hat durchgehend Index 2).
func get_minigame_round() -> Dictionary:
	if available:
		var rows := _query_all("SELECT idx, accusation, phrases, correct_index FROM minigame_rounds ORDER BY idx")
		if not rows.is_empty():
			var row: Dictionary = rows[_round_robin_index % rows.size()]
			_round_robin_index += 1
			var phrases := _parse_phrases(row.get("phrases", "[]"))
			if phrases.size() >= 2:
				var correct_index := int(row.get("correct_index", 0))
				var seed_material := "%s#%d" % [str(row.get("accusation", "")), _round_robin_index]
				var shuffled: Dictionary = MinigameShuffle.shuffle_round(phrases, correct_index, seed_material)
				return {
					"accusation": str(row.get("accusation", "Unbekannter Vorwurf.")),
					"phrases": shuffled["phrases"],
					"correct_index": int(shuffled["correct_index"]),
				}
	return {
		"accusation": "Herr Zeuge, stimmt es, dass Sie 'nein' gesagt haben?",
		"phrases": [
			"Ich sage grundsaetzlich nur 'vorlaeufig'.",
			"'Nein' ist eine Form von 'noch nicht erklaert'.",
			"Diese Frage ist bereits beantwortet, nur nicht von mir.",
		],
		"correct_index": 2,
	}


## Generischer Ergebnis-Kommentar, wenn /gm/result offline ist.
func get_result_commentary(success: bool) -> Dictionary:
	var text := "Der Aktenkoffer klappert zufrieden. Erfolg — die Aktenlage verbessert sich spuerbar."
	if not success:
		text = "Der Aktenkoffer seufzt. Misserfolg — irgendwo im Protokoll wird das nachhallen."
	return {"gm_dialogue": text, "trigger_event": null}


## Kombinations-Matrix aus der DB (Fallback, wenn items.json fehlt).
func get_combinations() -> Array:
	if not available:
		return []
	return _query_all("SELECT a, b, result, flavor FROM item_combinations")


func _query_nodes(scene_id: String, node_id: String) -> Array:
	return _query_all(
		"SELECT scene_id, node_id, type, label, default_dc, fallback_dialogue FROM nodes WHERE scene_id = ? AND node_id = ?",
		[scene_id, node_id]
	)


func _query_all(sql: String, bindings: Array = []) -> Array:
	if db == null:
		return []
	var ok: Variant
	if bindings.is_empty():
		ok = db.query(sql)
	else:
		ok = db.query_with_bindings(sql, bindings)
	if not (typeof(ok) == TYPE_BOOL and ok):
		return []
	var result: Variant = db.query_result
	if not (result is Array):
		return []
	return result


func _parse_phrases(raw: Variant) -> Array:
	var phrases: Array = []
	var parsed: Variant = raw
	if raw is String:
		var parser := JSON.new()
		if parser.parse(raw) == OK:
			parsed = parser.data
	if parsed is Array:
		for entry in parsed:
			phrases.append(str(entry))
	return phrases

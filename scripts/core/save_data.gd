# PURPOSE: Savegame-Serialisierung nach user://savegame.json inkl. frischem Perma-Death-Start-State.
# ARCHITECTURE: core
# DEPENDENCIES: none
# PIPELINE: runtime
# LAST_VALIDATED: 2026-09-17
class_name SaveData
extends RefCounted

const SAVE_PATH := "user://savegame.json"


## Frischer Start-State nach Perma-Death: leeres Inventar, Alignment 0, Disziplin 5, Kommunalpolitik.
static func fresh_state() -> Dictionary:
	return {
		"inventory": [],
		"alignment_score": StatRules.ALIGNMENT_START,
		"fraktionsdisziplin": StatRules.DISCIPLINE_START,
		"current_scene": "kommunalpolitik",
		"flags": {},
		"minigame": {"round": 0, "won_rounds": 0, "lost_rounds": 0},
	}


static func has_save(path: String = SAVE_PATH) -> bool:
	return FileAccess.file_exists(path)


## Schreibt den State als JSON. Liefert OK oder den FileAccess-Fehler.
static func write(path: String, state: Dictionary) -> Error:
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file == null:
		return FileAccess.get_open_error()
	file.store_string(JSON.stringify(state, "  "))
	file.close()
	return OK


## Liest den State. Fehlende Datei oder ungueltiges JSON -> leeres Dictionary (kein Crash).
static func read(path: String = SAVE_PATH) -> Dictionary:
	if not FileAccess.file_exists(path):
		return {}
	var text := FileAccess.get_file_as_string(path)
	if text.is_empty():
		return {}
	var parser := JSON.new()
	if parser.parse(text) != OK:
		return {}
	if not (parser.data is Dictionary):
		return {}
	return parser.data


## Perma-Death: ueberschreibt den Spielstand mit frischem Start-State und liefert ihn.
static func write_fresh(path: String = SAVE_PATH) -> Dictionary:
	var fresh := fresh_state()
	write(path, fresh)
	return fresh

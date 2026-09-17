# PURPOSE: Laedt Content-JSONs (Szenen, Items, Kombinationen) strikt nach content/-Schema, tolerant bei Fehlern.
# ARCHITECTURE: core
# DEPENDENCIES: none
# PIPELINE: runtime
# LAST_VALIDATED: 2026-09-17
class_name ContentLoader
extends RefCounted

const SCENES_DIR := "res://content/scenes/"
const ITEMS_PATH := "res://content/items.json"


## Items.json -> {"items": [...], "combinations": [...]}. Fehlt/kaputt -> leere Arrays.
static func load_items() -> Dictionary:
	var result := {"items": [], "combinations": []}
	var parsed: Variant = _load_json(ITEMS_PATH)
	if parsed is Dictionary:
		if parsed.get("items") is Array:
			result["items"] = parsed["items"]
		if parsed.get("combinations") is Array:
			result["combinations"] = parsed["combinations"]
	return result


## Szene content/scenes/<id>.json -> Dictionary nach Szenen-Schema oder {} wenn nicht vorhanden.
static func load_scene(scene_id: String) -> Dictionary:
	var safe_id := sanitize_id(scene_id)
	if safe_id.is_empty():
		return {}
	var parsed: Variant = _load_json(SCENES_DIR + safe_id + ".json")
	if parsed is Dictionary:
		return parsed
	return {}


## Sucht ein Item nach id in der items-Liste -> Item-Dictionary oder {}.
static func find_item(items: Array, item_id: String) -> Dictionary:
	for entry in items:
		if entry is Dictionary and str(entry.get("id", "")) == item_id:
			return entry
	return {}


## Sucht einen Knoten nach id in einem geladenen Szenen-Dictionary -> Knoten oder {}.
static func find_node(scene: Dictionary, node_id: String) -> Dictionary:
	if scene.get("nodes") is Array:
		for entry in scene["nodes"]:
			if entry is Dictionary and str(entry.get("id", "")) == node_id:
				return entry
	return {}


## Aktenkoffer-Regel: nur Kleinbuchstaben, Ziffern und Unterstrich, keine Pfad-Traversal.
static func sanitize_id(raw_id: String) -> String:
	var cleaned := ""
	for character in raw_id.to_lower():
		if (character >= "a" and character <= "z") or (character >= "0" and character <= "9") or character == "_":
			cleaned += character
	return cleaned


static func _load_json(path: String) -> Variant:
	if not FileAccess.file_exists(path):
		return null
	var text := FileAccess.get_file_as_string(path)
	if text.is_empty():
		return null
	var parser := JSON.new()
	if parser.parse(text) != OK:
		return null
	return parser.data

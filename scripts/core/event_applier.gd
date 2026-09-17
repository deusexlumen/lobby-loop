# PURPOSE: Wendet trigger_event-Command-Objekte (geschlossenes 5er-Enum) auf den Spielstand an.
# ARCHITECTURE: core
# DEPENDENCIES: none
# PIPELINE: runtime
# LAST_VALIDATED: 2026-09-17
class_name EventApplier
extends RefCounted

const TYPE_ADD_ITEM := "add_item"
const TYPE_REMOVE_ITEM := "remove_item"
const TYPE_CHANGE_SCENE := "change_scene"
const TYPE_MODIFY_STAT := "modify_stat"
const TYPE_START_MINIGAME := "start_minigame"
const VALID_TYPES: Array = [
	TYPE_ADD_ITEM,
	TYPE_REMOVE_ITEM,
	TYPE_CHANGE_SCENE,
	TYPE_MODIFY_STAT,
	TYPE_START_MINIGAME,
]


## Nur bekannte Typen werden akzeptiert; null/nicht-Dictionary gilt als "kein Event".
static func is_valid(event: Variant) -> bool:
	if event == null:
		return false
	if not (event is Dictionary):
		return false
	return VALID_TYPES.has(str(event.get("type", "")))


## Wendet das Event auf state an (Duck-Typing: add_item/remove_item/change_scene/
## modify_stat/start_minigame). Unbekannte Typen: Warnung + false, kein Crash.
static func apply(event: Variant, state: Object) -> bool:
	if event == null:
		return false
	if not is_valid(event):
		push_warning("EventApplier: unbekannter trigger_event-Typ: %s" % [str(event)])
		return false
	if state == null:
		push_warning("EventApplier: kein Ziel-State uebergeben.")
		return false
	match str(event.get("type")):
		TYPE_ADD_ITEM:
			state.add_item(str(event.get("item", "")))
		TYPE_REMOVE_ITEM:
			state.remove_item(str(event.get("item", "")))
		TYPE_CHANGE_SCENE:
			state.change_scene(str(event.get("scene", "")))
		TYPE_MODIFY_STAT:
			state.modify_stat(str(event.get("stat", "")), int(event.get("delta", 0)))
		TYPE_START_MINIGAME:
			state.start_minigame()
	return true

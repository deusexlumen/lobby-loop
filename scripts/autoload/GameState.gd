# PURPOSE: Zentraler Spielstand: Inventar, Alignment, Fraktionsdisziplin, Szene, Flags, Minispiel-Stand; wendet trigger_events an.
# ARCHITECTURE: autoload
# DEPENDENCIES: StatRules, EventApplier, SaveData, SaveManager
# PIPELINE: runtime
# LAST_VALIDATED: 2026-09-17
extends Node

signal inventory_changed
signal stats_changed
signal scene_changed(scene_id: String)
signal minigame_requested
signal perma_death

var inventory: Array = []
var alignment_score: int = StatRules.ALIGNMENT_START
var fraktionsdisziplin: int = StatRules.DISCIPLINE_START
var current_scene := "kommunalpolitik"
var flags := {}
var minigame := {"round": 0, "won_rounds": 0, "lost_rounds": 0}

## Statischer Charakterbogen-Bonus, immer aktiv.
var character_bonus := {"source": "berufspolitischer_bonus", "value": 3}


func _ready() -> void:
	randomize()
	var saved := SaveManager.load_game()
	if not saved.is_empty():
		load_from_dict(saved)


# ---------------------------------------------------------------- Inventar

func has_item(item_id: String) -> bool:
	return inventory.has(item_id)


func add_item(item_id: String) -> void:
	if item_id.is_empty() or inventory.has(item_id):
		return
	inventory.append(item_id)
	inventory_changed.emit()


func remove_item(item_id: String) -> void:
	if inventory.has(item_id):
		inventory.erase(item_id)
		inventory_changed.emit()


# ---------------------------------------------------------------- Stats

func modify_stat(stat: String, delta: int) -> void:
	match stat:
		"alignment":
			alignment_score = StatRules.apply_alignment_delta(alignment_score, delta)
		"discipline":
			fraktionsdisziplin = StatRules.apply_discipline_delta(fraktionsdisziplin, delta)
		_:
			push_warning("GameState: unbekannter Stat '%s' (delta %d ignoriert)." % [stat, delta])
			return
	stats_changed.emit()
	if StatRules.is_perma_death(fraktionsdisziplin):
		_trigger_perma_death()


func _trigger_perma_death() -> void:
	var fresh: Dictionary = SaveManager.perma_death()
	load_from_dict(fresh)
	perma_death.emit()


# ---------------------------------------------------------------- Szene & Minispiel

func change_scene(scene_id: String) -> void:
	if scene_id.is_empty() or scene_id == current_scene:
		return
	current_scene = scene_id
	scene_changed.emit(scene_id)


func start_minigame() -> void:
	minigame = {"round": 0, "won_rounds": 0, "lost_rounds": 0}
	minigame_requested.emit()


# ---------------------------------------------------------------- Wurf-Boni

## Additive Boni: Charakterbogen (+3) plus optionale Inventar-Buffs
## (Items mit numerischem Feld "buff" in items.json).
func get_roll_bonuses(item_definitions: Array = []) -> Array:
	var bonuses: Array = [character_bonus.duplicate()]
	for item_id in inventory:
		var item := ContentLoader.find_item(item_definitions, item_id)
		if item.is_empty():
			continue
		var buff: Variant = item.get("buff")
		if (buff is int or buff is float) and int(buff) != 0:
			bonuses.append({"source": item_id, "value": int(buff)})
	return bonuses


# ---------------------------------------------------------------- Events

func apply_trigger_event(event: Variant) -> bool:
	return EventApplier.apply(event, self)


# ---------------------------------------------------------------- (De)Serialisierung

func get_save_dict() -> Dictionary:
	return {
		"inventory": inventory.duplicate(),
		"alignment_score": alignment_score,
		"fraktionsdisziplin": fraktionsdisziplin,
		"current_scene": current_scene,
		"flags": flags.duplicate(),
		"minigame": minigame.duplicate(),
	}


func load_from_dict(data: Dictionary) -> void:
	inventory = []
	if data.get("inventory") is Array:
		for entry in data["inventory"]:
			inventory.append(str(entry))
	alignment_score = int(data.get("alignment_score", StatRules.ALIGNMENT_START))
	fraktionsdisziplin = StatRules.clamp_discipline(int(data.get("fraktionsdisziplin", StatRules.DISCIPLINE_START)))
	current_scene = str(data.get("current_scene", "kommunalpolitik"))
	flags = {}
	if data.get("flags") is Dictionary:
		flags = data["flags"].duplicate()
	minigame = {"round": 0, "won_rounds": 0, "lost_rounds": 0}
	if data.get("minigame") is Dictionary:
		for key in ["round", "won_rounds", "lost_rounds"]:
			if data["minigame"].get(key) is float or data["minigame"].get(key) is int:
				minigame[key] = int(data["minigame"][key])
	inventory_changed.emit()
	stats_changed.emit()

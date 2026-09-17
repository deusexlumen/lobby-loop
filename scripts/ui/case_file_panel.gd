# PURPOSE: Ermittlungsstand-Panel: live-Akte des GMs — Stat-Verläufe, Item-Events, Wurfquote.
# ARCHITECTURE: ui
# DEPENDENCIES: GameState, ContentLoader
# PIPELINE: runtime
# LAST_VALIDATED: 2026-09-17
#
# Öffnen/Schließen über den Button "Ermittlungsstand" in der Inventarleiste
# (inventory_bar.gd). Inhalt refresht sich bei jeder Stat- oder Inventar-Änderung.
extends PanelContainer

const MAX_SHOWN_EVENTS := 12
const MAX_SHOWN_ROLLS := 5

var _item_definitions: Array = []

var _body_column: VBoxContainer


func _ready() -> void:
	visible = false
	name = "CaseFilePanel"
	set_anchors_preset(PRESET_TOP_RIGHT)
	position = Vector2(-396, 116)
	size = Vector2(380, 0)
	custom_minimum_size = Vector2(380, 0)
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.07, 0.075, 0.1, 0.96)
	style.border_color = Color(0.5, 0.42, 0.2)
	style.set_border_width_all(2)
	style.set_content_margin_all(12)
	add_theme_stylebox_override("panel", style)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 6)
	add_child(column)

	var caption := Label.new()
	caption.text = "Ermittlungsstand — die Akte über dich"
	caption.add_theme_font_size_override("font_size", 15)
	caption.add_theme_color_override("font_color", Color(0.95, 0.88, 0.6))
	column.add_child(caption)

	var scroll := ScrollContainer.new()
	scroll.custom_minimum_size = Vector2(0, 340)
	column.add_child(scroll)

	_body_column = VBoxContainer.new()
	_body_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_body_column.add_theme_constant_override("separation", 4)
	scroll.add_child(_body_column)


func set_item_definitions(definitions: Array) -> void:
	_item_definitions = definitions


func toggle() -> void:
	visible = not visible
	if visible:
		refresh()


func refresh() -> void:
	if not visible:
		return
	for child in _body_column.get_children():
		child.queue_free()
	_add_line("Fraktionsdisziplin: %d/10" % GameState.fraktionsdisziplin, Color(0.9, 0.6, 0.55))
	_add_line("Zynismus (Alignment): %+d" % GameState.alignment_score, Color(0.8, 0.82, 0.9))
	_add_line("Szene: %s" % GameState.current_scene, Color(0.65, 0.68, 0.75))
	var stats := GameState.get_run_stats()
	var timeline: Array = stats.get("discipline_timeline", [])
	if timeline.size() > 1:
		_add_line("Disziplin-Verlauf: %s" % _timeline_string(timeline), Color(0.55, 0.58, 0.66), 11)
	_add_rolls(stats)
	_add_events(stats)


func _add_rolls(stats: Dictionary) -> void:
	var rolls: Array = stats.get("rolls", [])
	_add_line("—", Color(0.3, 0.32, 0.38))
	if rolls.is_empty():
		_add_line("Noch keine Wurfproben.", Color(0.55, 0.58, 0.66), 11)
		return
	var successes := 0
	for roll in rolls:
		if roll is Dictionary and bool(roll.get("success", false)):
			successes += 1
	_add_line("Würfe: %d (%d erfolgreich)" % [rolls.size(), successes], Color(0.85, 0.87, 0.92), 12)
	var from := maxi(0, rolls.size() - MAX_SHOWN_ROLLS)
	for index in range(from, rolls.size()):
		var roll: Dictionary = rolls[index]
		var outcome := "✓" if bool(roll.get("success", false)) else "✗"
		_add_line("%s W20: %d = %d vs DC %d" % [outcome, int(roll.get("value", 0)), int(roll.get("total", 0)), int(roll.get("difficulty_class", 0))], Color(0.6, 0.63, 0.7), 11)


func _add_events(stats: Dictionary) -> void:
	var events: Array = stats.get("events", [])
	_add_line("—", Color(0.3, 0.32, 0.38))
	if events.is_empty():
		_add_line("Keine Verfehlungen aktenkundig. Noch.", Color(0.55, 0.58, 0.66), 11)
		return
	_add_line("Aktenkundige Vorkommnisse:", Color(0.85, 0.87, 0.92), 12)
	var from := maxi(0, events.size() - MAX_SHOWN_EVENTS)
	for index in range(from, events.size()):
		var event: Dictionary = events[index]
		_add_line(_event_line(event), Color(0.6, 0.63, 0.7), 11)


func _event_line(event: Dictionary) -> String:
	match str(event.get("type", "")):
		"add_item":
			return "+ Konzept eingesteckt: %s" % _display_name(str(event.get("item", "?")))
		"remove_item":
			return "− Konzept verbrannt: %s" % _display_name(str(event.get("item", "?")))
		"change_scene":
			return "→ Szene gewechselt: %s" % str(event.get("scene", "?"))
		"modify_stat":
			return "± %s %s" % [str(event.get("stat", "?")), str(int(event.get("delta", 0)))]
		"start_minigame":
			return "⚔ Kreuzverhör eröffnet"
	return str(event.get("type", "?"))


func _display_name(item_id: String) -> String:
	var item := ContentLoader.find_item(_item_definitions, item_id)
	if item.is_empty():
		return item_id
	return str(item.get("display_name", item_id))


func _timeline_string(timeline: Array) -> String:
	var parts: Array = []
	for value in timeline:
		parts.append(str(value))
	return " → ".join(parts)


func _add_line(text: String, color: Color, font_size := 12) -> Label:
	var label := Label.new()
	label.text = text
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	_body_column.add_child(label)
	return label

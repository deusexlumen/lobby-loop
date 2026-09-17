# PURPOSE: Inventar-Leiste mit Drag A-auf-B: löst Kombinationen gegen items.json auf.
# ARCHITECTURE: ui
# DEPENDENCIES: GameState, ContentLoader
# PIPELINE: runtime
# LAST_VALIDATED: 2026-09-17
extends PanelContainer

signal combine_attempted(item_a: String, item_b: String)

var _item_definitions: Array = []

var _row: HBoxContainer


class InventoryItemButton:
	extends Button

	var item_id := ""

	func _get_drag_data(_at_position: Vector2) -> Variant:
		var preview := Label.new()
		preview.text = text
		preview.add_theme_color_override("font_color", Color(0.95, 0.9, 0.7))
		set_drag_preview(preview)
		return {"type": "lobbyloop_item", "item_id": item_id}

	func _can_drop_data(_at_position: Vector2, data: Variant) -> bool:
		return data is Dictionary \
			and data.get("type") == "lobbyloop_item" \
			and str(data.get("item_id", "")) != item_id

	func _drop_data(_at_position: Vector2, data: Variant) -> void:
		if _can_drop_data(_at_position, data):
			var bar: PanelContainer = find_parent("InventoryBar")
			if bar != null:
				bar.combine_attempted.emit(str(data.get("item_id")), item_id)


func _ready() -> void:
	name = "InventoryBar"
	custom_minimum_size = Vector2(0, 110)
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.1, 0.11, 0.14, 0.95)
	add_theme_stylebox_override("panel", style)
	set_anchors_preset(PRESET_BOTTOM_WIDE)
	offset_top = -110

	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 12)
	margin.add_theme_constant_override("margin_right", 12)
	margin.add_theme_constant_override("margin_top", 8)
	margin.add_theme_constant_override("margin_bottom", 8)
	add_child(margin)

	var column := VBoxContainer.new()
	margin.add_child(column)

	var caption := Label.new()
	caption.text = "Inventar — Konzept auf Konzept ziehen zum Kombinieren"
	caption.add_theme_font_size_override("font_size", 12)
	caption.add_theme_color_override("font_color", Color(0.6, 0.63, 0.7))
	column.add_child(caption)

	_row = HBoxContainer.new()
	_row.add_theme_constant_override("separation", 8)
	column.add_child(_row)


## Baut die Leiste aus dem GameState-Inventar neu.
func refresh() -> void:
	for child in _row.get_children():
		child.queue_free()
	if GameState.inventory.is_empty():
		var hint := Label.new()
		hint.text = "Noch keine politischen Konzepte eingesteckt."
		hint.add_theme_color_override("font_color", Color(0.45, 0.48, 0.55))
		_row.add_child(hint)
		return
	for item_id in GameState.inventory:
		var item_id_str := str(item_id)
		var item := ContentLoader.find_item(_item_definitions, item_id_str)
		var display_name := item_id_str
		if not item.is_empty():
			display_name = str(item.get("display_name", item_id_str))
		_row.add_child(_make_item_button(item_id_str, display_name))


func set_item_definitions(definitions: Array) -> void:
	_item_definitions = definitions


func _make_item_button(item_id: String, display_name: String) -> Button:
	var button := InventoryItemButton.new()
	button.item_id = item_id
	button.text = display_name
	button.tooltip_text = _tooltip_for(item_id)
	button.custom_minimum_size = Vector2(150, 44)
	return button


func _tooltip_for(item_id: String) -> String:
	var item := ContentLoader.find_item(_item_definitions, item_id)
	if item.is_empty():
		return item_id
	return str(item.get("description", item_id))

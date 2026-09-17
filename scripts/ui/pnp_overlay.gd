# PURPOSE: P&P-Overlay: Absicht einreichen → GM-Antwort + DC → W20 → Ergebnis → trigger_event anwenden.
# ARCHITECTURE: ui
# DEPENDENCIES: GameState, ApiClient, FallbackDb, DiceRoller, EventApplier, StatRules
# PIPELINE: runtime
# LAST_VALIDATED: 2026-09-17
extends PanelContainer

signal action_finished
signal intent_submitted(text: String)
signal roll_requested
signal closed

const ROLL_NONE := "none"

var _node_data := {}
var _scene_id := ""
var _item_defs: Array = []
var _pending_action := {}
var _offline := false
var _aborted := false

var _title_label: Label
var _mode_label: Label
var _gm_label: Label
var _hint_label: Label
var _intent_edit: LineEdit
var _submit_button: Button
var _absurd_box: VBoxContainer
var _roll_button: Button
var _dc_label: Label
var _roll_result_label: Label
var _commentary_label: Label
var _close_button: Button


func _ready() -> void:
	visible = false
	set_anchors_preset(PRESET_FULL_RECT)
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.04, 0.05, 0.07, 0.93)
	add_theme_stylebox_override("panel", style)

	var center := CenterContainer.new()
	center.set_anchors_preset(PRESET_FULL_RECT)
	add_child(center)

	var panel := PanelContainer.new()
	var panel_style := StyleBoxFlat.new()
	panel_style.bg_color = Color(0.12, 0.13, 0.17)
	panel_style.border_color = Color(0.5, 0.42, 0.2)
	panel_style.set_border_width_all(2)
	panel_style.set_content_margin_all(16)
	panel.add_theme_stylebox_override("panel", panel_style)
	panel.custom_minimum_size = Vector2(760, 0)
	center.add_child(panel)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 8)
	panel.add_child(column)

	_title_label = _label(column, 20, Color(0.95, 0.88, 0.6))
	_mode_label = _label(column, 12, Color(0.9, 0.5, 0.3))
	_mode_label.visible = false
	_gm_label = _label(column, 15, Color(0.92, 0.92, 0.95))
	_gm_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_hint_label = _label(column, 12, Color(0.55, 0.58, 0.66))
	_hint_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART

	_intent_edit = LineEdit.new()
	_intent_edit.placeholder_text = "Deine Absicht formulieren … (Enter reicht)"
	_intent_edit.custom_minimum_size = Vector2(0, 36)
	_intent_edit.text_submitted.connect(func(text: String) -> void: intent_submitted.emit(text))
	column.add_child(_intent_edit)

	_submit_button = Button.new()
	_submit_button.text = "Absicht einreichen"
	_submit_button.pressed.connect(func() -> void: intent_submitted.emit(_intent_edit.text))
	column.add_child(_submit_button)

	var absurd_caption := _label(column, 12, Color(0.55, 0.58, 0.66))
	absurd_caption.text = "Absurde Aktionen:"
	_absurd_box = VBoxContainer.new()
	_absurd_box.add_theme_constant_override("separation", 4)
	column.add_child(_absurd_box)

	var roll_row := HBoxContainer.new()
	roll_row.add_theme_constant_override("separation", 12)
	column.add_child(roll_row)
	_roll_button = Button.new()
	_roll_button.text = "W20 würfeln"
	_roll_button.pressed.connect(func() -> void: roll_requested.emit())
	roll_row.add_child(_roll_button)
	_dc_label = _label(roll_row, 14, Color(0.8, 0.82, 0.9))
	_roll_result_label = _label(roll_row, 14, Color(0.95, 0.9, 0.6))
	_roll_result_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART

	_commentary_label = _label(column, 14, Color(0.85, 0.9, 0.85))
	_commentary_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART

	_close_button = Button.new()
	_close_button.text = "Zurück in den Raum"
	_close_button.pressed.connect(func() -> void: closed.emit())
	column.add_child(_close_button)


func _label(parent: Node, font_size: int, color: Color) -> Label:
	var label := Label.new()
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	parent.add_child(label)
	return label


## Oeffnet das Overlay fuer einen Knoten und fuehrt den kompletten Ablauf asynchron aus.
func open_for_node(node_data: Dictionary, scene_id: String, item_defs: Array) -> void:
	_node_data = node_data
	_scene_id = scene_id
	_item_defs = item_defs
	_aborted = false
	_reset_ui()
	visible = true
	await _run_flow()
	if not _aborted:
		action_finished.emit()


## Bricht einen laufenden Ablauf ab (z. B. weil das Minispiel startet oder Perma-Death eintritt).
func abort() -> void:
	_aborted = true
	visible = false
	intent_submitted.emit("")
	roll_requested.emit()
	closed.emit()


func is_busy() -> bool:
	return visible and not _aborted


func _reset_ui() -> void:
	_title_label.text = str(_node_data.get("label", "Unbekannter Knoten"))
	_mode_label.visible = false
	_gm_label.text = "Der Aktenkoffer beobachtet dich. Formuliere deine Absicht."
	_hint_label.text = str(_node_data.get("prompt_hint", ""))
	_intent_edit.text = ""
	_intent_edit.editable = true
	_submit_button.disabled = false
	_roll_button.disabled = true
	_dc_label.text = ""
	_roll_result_label.text = ""
	_commentary_label.text = ""
	_close_button.disabled = true
	for child in _absurd_box.get_children():
		child.queue_free()
	if _node_data.get("absurd_actions") is Array:
		for action in _node_data["absurd_actions"]:
			var action_text := str(action)
			var button := Button.new()
			button.text = action_text
			button.alignment = HORIZONTAL_ALIGNMENT_LEFT
			button.pressed.connect(func() -> void: intent_submitted.emit(action_text))
			_absurd_box.add_child(button)


func _run_flow() -> void:
	# 1. Absicht abwarten.
	var player_input: String = await intent_submitted
	if _aborted:
		return
	_intent_edit.editable = false
	_submit_button.disabled = true
	for child in _absurd_box.get_children():
		child.disabled = true

	# 2. GM-Aktion: API, bei Fehler FallbackDb.
	_offline = false
	var payload := _build_payload(player_input)
	var action_response: Variant = await ApiClient.gm_action(payload)
	if action_response == null:
		_offline = true
		action_response = FallbackDb.get_action_fallback(_scene_id, str(_node_data.get("id", "")))
	_pending_action = action_response
	_show_action_response(action_response)
	if _aborted:
		return

	# 3. Wurf — oder direkte Konsequenz bei required_roll == "none".
	var dc := StatRules.clamp_dc(int(action_response.get("difficulty_class", 10)))
	var roll: Dictionary
	if str(action_response.get("required_roll", "W20")) == ROLL_NONE:
		roll = DiceRoller.roll_none(dc)
		_roll_result_label.text = "Keine Wurfprobe — Konsequenz direkt."
	else:
		_roll_button.disabled = false
		await roll_requested
		if _aborted:
			return
		_roll_button.disabled = true
		roll = DiceRoller.roll_check(dc, _item_defs)
		_roll_result_label.text = _format_roll(roll)

	# 4. Ergebnis an den GM, Trigger anwenden.
	await _finish(payload, roll)
	if _aborted:
		return

	# 5. Auf Schliessen warten.
	await closed
	if not _aborted:
		visible = false


func _finish(payload: Dictionary, roll: Dictionary) -> void:
	var result: Variant = await ApiClient.gm_result(payload, roll)
	if result == null:
		result = FallbackDb.get_result_commentary(bool(roll.get("success", false)))
	var commentary := str(result.get("gm_dialogue", "Der Aktenkoffer schweigt bedeutungsschwer."))
	var outcome := "Erfolg: " if bool(roll.get("success", false)) else "Misserfolg: "
	_commentary_label.text = outcome + commentary
	_apply_trigger(result.get("trigger_event"))
	_close_button.disabled = false


func _apply_trigger(trigger: Variant) -> void:
	if trigger == null and _pending_action is Dictionary:
		trigger = _pending_action.get("trigger_event")
	if trigger == null:
		return
	if not EventApplier.is_valid(trigger):
		push_warning("PnpOverlay: unbekannter trigger_event ignoriert: %s" % [str(trigger)])
		return
	GameState.apply_trigger_event(trigger)


func _show_action_response(response: Dictionary) -> void:
	_gm_label.text = str(response.get("gm_dialogue", ""))
	_mode_label.visible = _offline
	_mode_label.text = "Offline-Modus — FallbackDb liefert den GM."
	_dc_label.text = "DC %d" % StatRules.clamp_dc(int(response.get("difficulty_class", 10)))


func _format_roll(roll: Dictionary) -> String:
	var parts: Array = ["W20: %d" % int(roll.get("value", 0))]
	for bonus in roll.get("bonuses", []):
		if bonus is Dictionary:
			parts.append("%+d (%s)" % [int(bonus.get("value", 0)), str(bonus.get("source", "?"))])
	var outcome := "Erfolg" if bool(roll.get("success", false)) else "Misserfolg"
	return "%s = %d vs DC %d → %s" % [" + ".join(parts), int(roll.get("total", 0)), int(roll.get("difficulty_class", 0)), outcome]


func _build_payload(player_input: String) -> Dictionary:
	return {
		"player_inventory": GameState.inventory.duplicate(),
		"current_scene": _scene_id,
		"alignment_score": GameState.alignment_score,
		"fraktionsdisziplin": GameState.fraktionsdisziplin,
		"player_input": player_input,
	}

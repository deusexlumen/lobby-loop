# PURPOSE: Beleidigungsfechten-Panel: Vorwurf + 3 PR-Phrasen; 3 Siege = Burnout, Niederlage = Disziplin −1.
# ARCHITECTURE: ui
# DEPENDENCIES: GameState, ApiClient, FallbackDb, SaveManager
# PIPELINE: runtime
# LAST_VALIDATED: 2026-09-17
extends PanelContainer

signal finished

const ROUNDS_TO_WIN := 3

var _aborted := false
var _offline := false
var _fallback_correct_index := 0

var _score_label: Label
var _mode_label: Label
var _accusation_label: Label
var _phrase_box: VBoxContainer
var _commentary_label: Label
var _next_button: Button
var _end_button: Button


func _ready() -> void:
	visible = false
	set_anchors_preset(PRESET_FULL_RECT)
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.05, 0.06, 0.09, 0.95)
	add_theme_stylebox_override("panel", style)

	var center := CenterContainer.new()
	center.set_anchors_preset(PRESET_FULL_RECT)
	add_child(center)

	var panel := PanelContainer.new()
	var panel_style := StyleBoxFlat.new()
	panel_style.bg_color = Color(0.13, 0.12, 0.16)
	panel_style.border_color = Color(0.55, 0.25, 0.25)
	panel_style.set_border_width_all(2)
	panel_style.set_content_margin_all(16)
	panel.add_theme_stylebox_override("panel", panel_style)
	panel.custom_minimum_size = Vector2(820, 0)
	center.add_child(panel)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 10)
	panel.add_child(column)

	var title := Label.new()
	title.text = "Kreuzverhör — Beleidigungsfechten"
	title.add_theme_font_size_override("font_size", 22)
	title.add_theme_color_override("font_color", Color(0.95, 0.6, 0.55))
	column.add_child(title)

	_score_label = Label.new()
	_score_label.add_theme_font_size_override("font_size", 13)
	_score_label.add_theme_color_override("font_color", Color(0.85, 0.87, 0.92))
	column.add_child(_score_label)

	_mode_label = Label.new()
	_mode_label.text = "Offline-Modus — FallbackDb spielt den Ermittlungsführer."
	_mode_label.add_theme_font_size_override("font_size", 12)
	_mode_label.add_theme_color_override("font_color", Color(0.9, 0.5, 0.3))
	_mode_label.visible = false
	column.add_child(_mode_label)

	_accusation_label = Label.new()
	_accusation_label.add_theme_font_size_override("font_size", 16)
	_accusation_label.add_theme_color_override("font_color", Color(0.95, 0.93, 0.85))
	_accusation_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(_accusation_label)

	_phrase_box = VBoxContainer.new()
	_phrase_box.add_theme_constant_override("separation", 6)
	column.add_child(_phrase_box)

	_commentary_label = Label.new()
	_commentary_label.add_theme_font_size_override("font_size", 14)
	_commentary_label.add_theme_color_override("font_color", Color(0.85, 0.9, 0.85))
	_commentary_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(_commentary_label)

	_next_button = Button.new()
	_next_button.text = "Nächste Runde"
	_next_button.pressed.connect(func() -> void: _next_round())
	column.add_child(_next_button)

	_end_button = Button.new()
	_end_button.text = "Ausschuss verlassen"
	_end_button.visible = false
	_end_button.pressed.connect(func() -> void: _end())
	column.add_child(_end_button)


## Startet ein neues Duell (3 gewonnene Runden → Burnout des Ermittlungsführers).
func start() -> void:
	_aborted = false
	GameState.minigame = {"round": 0, "won_rounds": 0, "lost_rounds": 0}
	_offline = false
	_mode_label.visible = false
	_commentary_label.text = ""
	_end_button.visible = false
	_next_button.visible = true
	visible = true
	_next_round()


func abort() -> void:
	_aborted = true
	visible = false


func is_open() -> bool:
	return visible and not _aborted


func _next_round() -> void:
	if _aborted:
		return
	GameState.minigame["round"] = int(GameState.minigame.get("round", 0)) + 1
	_update_score()
	_commentary_label.text = ""
	_next_button.visible = false
	_phrase_box.visible = true

	var payload := {
		"current_scene": GameState.current_scene,
		"alignment_score": GameState.alignment_score,
		"round": int(GameState.minigame.get("round", 0)),
		"won_rounds": int(GameState.minigame.get("won_rounds", 0)),
		"lost_rounds": int(GameState.minigame.get("lost_rounds", 0)),
	}
	var round_data: Variant = await ApiClient.minigame_round(payload)
	if round_data == null:
		_offline = true
		round_data = FallbackDb.get_minigame_round()
	_mode_label.visible = _offline
	_fallback_correct_index = int(round_data.get("correct_index", 0))
	_accusation_label.text = "„%s“" % str(round_data.get("accusation", "…"))

	for child in _phrase_box.get_children():
		child.queue_free()
	var phrases: Array = round_data.get("phrases", [])
	for index in phrases.size():
		var button := Button.new()
		button.text = "%d. %s" % [index + 1, str(phrases[index])]
		button.alignment = HORIZONTAL_ALIGNMENT_LEFT
		button.pressed.connect(_on_phrase_chosen.bind(str(round_data.get("accusation", "")), index, str(phrases[index])))
		_phrase_box.add_child(button)


func _on_phrase_chosen(accusation: String, chosen_index: int, phrase: String) -> void:
	if _aborted:
		return
	for child in _phrase_box.get_children():
		child.disabled = true
	var verdict: Variant = await ApiClient.minigame_judge({
		"accusation": accusation,
		"chosen_index": chosen_index,
		"phrase": phrase,
	})
	if verdict == null:
		verdict = {
			"correct": chosen_index == _fallback_correct_index,
			"correct_index": _fallback_correct_index,
			"commentary": "Der Ermittlungsführer kneift die Augen zusammen. (Offline-Bewertung)",
		}
	_mode_label.visible = _offline
	var correct := bool(verdict.get("correct", false))
	var outcome := "Erfolg: " if correct else "Misserfolg: "
	_commentary_label.text = outcome + str(verdict.get("commentary", ""))
	if correct:
		GameState.minigame["won_rounds"] = int(GameState.minigame.get("won_rounds", 0)) + 1
	else:
		GameState.minigame["lost_rounds"] = int(GameState.minigame.get("lost_rounds", 0)) + 1
		GameState.modify_stat("discipline", -1)
	_update_score()
	if _aborted:
		return
	if int(GameState.minigame.get("won_rounds", 0)) >= ROUNDS_TO_WIN:
		_accusation_label.text = "Der Ermittlungsführer erleidet Burnout. Das Kreuzverhör ist beendet — du gewinnst die Szene."
		_phrase_box.visible = false
		_next_button.visible = false
		_end_button.visible = true
	else:
		_next_button.visible = true


func _update_score() -> void:
	_score_label.text = "Runde %d — gewonnen: %d/%d — verloren: %d — Fraktionsdisziplin: %d" % [
		int(GameState.minigame.get("round", 0)),
		int(GameState.minigame.get("won_rounds", 0)),
		ROUNDS_TO_WIN,
		int(GameState.minigame.get("lost_rounds", 0)),
		GameState.fraktionsdisziplin,
	]


func _end() -> void:
	visible = false
	SaveManager.autosave()
	finished.emit()

# PURPOSE: Game-Root: Raumansicht + Hotspots aus Szenen-JSON, Inventar, Overlay, Minispiel, Perma-Death-Screen.
# ARCHITECTURE: main
# DEPENDENCIES: GameState, SaveManager, ApiClient, FallbackDb, DiceRoller, ContentLoader, CombinationResolver, StatRules
# PIPELINE: runtime
# LAST_VALIDATED: 2026-09-17
extends Control

const InventoryBarScript := preload("res://scripts/ui/inventory_bar.gd")
const PnpOverlayScript := preload("res://scripts/ui/pnp_overlay.gd")
const MinigamePanelScript := preload("res://scripts/ui/minigame_panel.gd")
const BriefcaseScript := preload("res://scripts/ui/briefcase.gd")
const CaseFilePanelScript := preload("res://scripts/ui/case_file_panel.gd")

const HEADER_HEIGHT := 100
const NODE_COLORS := {
	"npc": Color(0.62, 0.48, 0.2),
	"object": Color(0.32, 0.48, 0.28),
	"microphone": Color(0.55, 0.25, 0.25),
}
const EXIT_COLOR := Color(0.2, 0.38, 0.55)

var _items_data := {"items": [], "combinations": []}
var _scene_data := {}

var _background: ColorRect
var _title_label: Label
var _intro_label: Label
var _stats_label: Label
var _room_area: Control
var _inventory_bar: PanelContainer
var _case_file: PanelContainer
var _overlay: PanelContainer
var _minigame: PanelContainer
var _briefcase: Control
var _toast: Label
var _perma_screen: PanelContainer
var _epitaph_label: Label
var _highlights_label: Label


func _ready() -> void:
	_build_ui()
	_load_content()
	_connect_signals()
	_briefcase.position = Vector2((size.x - 96) / 2, 8) if size.x > 0 else Vector2(592, 8)
	load_scene(GameState.current_scene)


# ---------------------------------------------------------------- Aufbau

func _build_ui() -> void:
	_background = ColorRect.new()
	_background.color = Color(0.078, 0.09, 0.114)
	_background.set_anchors_preset(PRESET_FULL_RECT)
	add_child(_background)

	_title_label = Label.new()
	_title_label.position = Vector2(16, 8)
	_title_label.add_theme_font_size_override("font_size", 24)
	_title_label.add_theme_color_override("font_color", Color(0.95, 0.88, 0.6))
	add_child(_title_label)

	_intro_label = Label.new()
	_intro_label.position = Vector2(16, 42)
	_intro_label.size = Vector2(1000, 56)
	_intro_label.add_theme_font_size_override("font_size", 12)
	_intro_label.add_theme_color_override("font_color", Color(0.65, 0.68, 0.75))
	_intro_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	add_child(_intro_label)

	_stats_label = Label.new()
	_stats_label.set_anchors_preset(PRESET_TOP_RIGHT)
	_stats_label.position = Vector2(-420, 12)
	_stats_label.size = Vector2(404, 40)
	_stats_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_stats_label.add_theme_font_size_override("font_size", 13)
	_stats_label.add_theme_color_override("font_color", Color(0.8, 0.82, 0.9))
	add_child(_stats_label)

	_room_area = Control.new()
	_room_area.name = "RoomArea"
	_room_area.position = Vector2(0, HEADER_HEIGHT)
	_room_area.size = Vector2(1280, 720 - HEADER_HEIGHT - 110)
	add_child(_room_area)

	_inventory_bar = InventoryBarScript.new()
	add_child(_inventory_bar)

	_briefcase = BriefcaseScript.new()
	add_child(_briefcase)

	_case_file = CaseFilePanelScript.new()
	add_child(_case_file)

	_overlay = PnpOverlayScript.new()
	add_child(_overlay)

	_minigame = MinigamePanelScript.new()
	add_child(_minigame)

	_toast = Label.new()
	_toast.set_anchors_preset(PRESET_CENTER_BOTTOM)
	_toast.position = Vector2(-320, -140)
	_toast.size = Vector2(640, 30)
	_toast.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_toast.add_theme_font_size_override("font_size", 14)
	_toast.add_theme_color_override("font_color", Color(0.95, 0.9, 0.65))
	add_child(_toast)

	_perma_screen = _build_perma_screen()
	add_child(_perma_screen)


func _build_perma_screen() -> PanelContainer:
	var screen := PanelContainer.new()
	screen.name = "PermaDeathScreen"
	screen.set_anchors_preset(PRESET_FULL_RECT)
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.02, 0.02, 0.03, 0.97)
	screen.add_theme_stylebox_override("panel", style)

	var center := CenterContainer.new()
	center.set_anchors_preset(PRESET_FULL_RECT)
	screen.add_child(center)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 12)
	center.add_child(column)

	var title := Label.new()
	title.text = "MANDAT VERLOREN"
	title.add_theme_font_size_override("font_size", 34)
	title.add_theme_color_override("font_color", Color(0.9, 0.3, 0.25))
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	column.add_child(title)

	var text := Label.new()
	text.text = "Die Fraktionsdisziplin ist auf null gefallen.\nDas System löscht deinen Spielstand — Perma-Death, kein Bug.\nDu verlierst dein Mandat und startest in der Kommunalpolitik neu."
	text.add_theme_font_size_override("font_size", 15)
	text.add_theme_color_override("font_color", Color(0.85, 0.85, 0.9))
	text.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	column.add_child(text)

	_epitaph_label = Label.new()
	_epitaph_label.text = "Die Akte wird gefertigt …"
	_epitaph_label.add_theme_font_size_override("font_size", 13)
	_epitaph_label.add_theme_color_override("font_color", Color(0.75, 0.72, 0.55))
	_epitaph_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_epitaph_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_epitaph_label.custom_minimum_size = Vector2(560, 0)
	column.add_child(_epitaph_label)

	_highlights_label = Label.new()
	_highlights_label.add_theme_font_size_override("font_size", 12)
	_highlights_label.add_theme_color_override("font_color", Color(0.6, 0.63, 0.7))
	_highlights_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_highlights_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_highlights_label.custom_minimum_size = Vector2(560, 0)
	column.add_child(_highlights_label)

	var button := Button.new()
	button.text = "Neustart in der Kommunalpolitik"
	button.pressed.connect(func() -> void:
		_perma_screen.visible = false
		load_scene(GameState.current_scene)
	)
	column.add_child(button)
	return screen


# ---------------------------------------------------------------- Content & Signale

func _load_content() -> void:
	_items_data = ContentLoader.load_items()
	if (_items_data["combinations"] as Array).is_empty() and FallbackDb.available:
		_items_data["combinations"] = FallbackDb.get_combinations()
	_inventory_bar.set_item_definitions(_items_data["items"])
	_inventory_bar.refresh()
	_case_file.set_item_definitions(_items_data["items"])


func _connect_signals() -> void:
	GameState.inventory_changed.connect(_inventory_bar.refresh)
	GameState.inventory_changed.connect(_case_file.refresh)
	GameState.stats_changed.connect(_update_stats_label)
	GameState.stats_changed.connect(_case_file.refresh)
	GameState.scene_changed.connect(_on_scene_changed)
	GameState.minigame_requested.connect(_on_minigame_requested)
	GameState.perma_death.connect(_on_perma_death)
	_inventory_bar.combine_attempted.connect(_on_combine_attempted)
	_inventory_bar.case_file_toggled.connect(_case_file.toggle)
	_overlay.action_finished.connect(func() -> void: SaveManager.autosave())
	# Würfe landen in der Run-Statistik (Akten-Grundlage).
	DiceRoller.roll_performed.connect(GameState.record_roll)


# ---------------------------------------------------------------- Raum

func load_scene(scene_id: String) -> void:
	_scene_data = ContentLoader.load_scene(scene_id)
	for child in _room_area.get_children():
		child.queue_free()
	if _scene_data.is_empty():
		_title_label.text = "Szene nicht gefunden: %s" % scene_id
		_intro_label.text = "Der Aktenkoffer findet kein Szenen-JSON unter content/scenes/."
		return
	_title_label.text = str(_scene_data.get("display_name", scene_id))
	_intro_label.text = str(_scene_data.get("intro", ""))
	_background.color = _scene_tint(scene_id)
	if _scene_data.get("nodes") is Array:
		for node in _scene_data["nodes"]:
			if node is Dictionary:
				_room_area.add_child(_make_hotspot(node, false))
	if _scene_data.get("exits") is Array:
		for exit_data in _scene_data["exits"]:
			if exit_data is Dictionary:
				_room_area.add_child(_make_hotspot(exit_data, true))
	_update_stats_label()


func _scene_tint(scene_id: String) -> Color:
	var hue := absf(float(hash(scene_id) % 1000)) / 1000.0
	return Color.from_hsv(hue, 0.22, 0.13)


func _make_hotspot(data: Dictionary, is_exit: bool) -> Button:
	var button := Button.new()
	button.text = str(data.get("label", "?"))
	button.position = _hotspot_position(data)
	button.custom_minimum_size = Vector2(160, 40)
	button.size = Vector2(160, 40)
	var color: Color = EXIT_COLOR if is_exit else NODE_COLORS.get(str(data.get("type", "object")), Color(0.4, 0.4, 0.4))
	_style_hotspot(button, color)
	if is_exit:
		var exit_to := str(data.get("to", ""))
		button.pressed.connect(func() -> void: GameState.change_scene(exit_to))
	else:
		var node_data := data
		button.pressed.connect(func() -> void:
			if _overlay.is_busy() or _minigame.is_open():
				return
			_overlay.open_for_node(node_data, GameState.current_scene, _items_data["items"])
		)
	return button


func _hotspot_position(data: Dictionary) -> Vector2:
	var pos := Vector2(400, 200)
	if data.get("position") is Dictionary:
		pos = Vector2(float(data["position"].get("x", 400)), float(data["position"].get("y", 200)))
	return Vector2(pos.x - 80, maxf(pos.y - HEADER_HEIGHT - 20, 4))


func _style_hotspot(button: Button, color: Color) -> void:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.set_corner_radius_all(6)
	style.set_content_margin_all(8)
	button.add_theme_stylebox_override("normal", style)
	var hover := style.duplicate()
	hover.bg_color = color.lightened(0.15)
	button.add_theme_stylebox_override("hover", hover)


# ---------------------------------------------------------------- Signale

func _on_scene_changed(scene_id: String) -> void:
	load_scene(scene_id)
	SaveManager.autosave()


func _on_minigame_requested() -> void:
	_overlay.abort()
	_minigame.start()


func _on_perma_death() -> void:
	_overlay.abort()
	_minigame.abort()
	_case_file.visible = false
	_epitaph_label.text = "Die Akte wird gefertigt …"
	_highlights_label.text = ""
	_perma_screen.visible = true
	_request_epitaph()


## Karriere-Akte vom GM anfordern (POST /run/epitaph); bei jedem Fehler lokaler Fallback.
func _request_epitaph() -> void:
	var stats: Dictionary = GameState.last_run_stats
	var payload := {
		"session_id": _session_id(),
		"stats": stats,
	}
	# ApiClient._post ist die bestehende generische POST-Hilfe (kein eigener HTTP-Code).
	var response: Variant = await ApiClient._post("/run/epitaph", payload, ["epitaph"])
	if response is Dictionary:
		_show_epitaph(str(response.get("epitaph", "")), response.get("highlights", []))
	else:
		# Endpoint down, 503 oder ungueltig: amtliche Akte lokal fertigen.
		var local: Dictionary = EpitaphGenerator.generate(stats)
		_show_epitaph(str(local.get("epitaph", "")), local.get("highlights", []))


func _show_epitaph(epitaph: String, highlights: Variant) -> void:
	_epitaph_label.text = epitaph
	var lines: Array = []
	if highlights is Array:
		for highlight in highlights:
			lines.append("• %s" % str(highlight))
	_highlights_label.text = "\n".join(lines)


func _session_id() -> String:
	# Dieselbe Konvention wie ApiClient (Savegame-Name), damit Chronik und
	# Karriere-Akte auf derselben Session liegen.
	return ApiClient.session_id()


func _on_combine_attempted(item_a: String, item_b: String) -> void:
	var combo: Variant = CombinationResolver.find(item_a, item_b, _items_data["combinations"])
	if combo == null:
		_show_toast("Die Kommune lehnt diese Kombination strikt, aber hoeflich ab.")
		return
	GameState.remove_item(item_a)
	GameState.remove_item(item_b)
	GameState.add_item(str(combo.get("result", "")))
	_show_toast(str(combo.get("flavor", "Kombination gespendet.")))


func _show_toast(message: String) -> void:
	_toast.text = message
	_toast.modulate = Color(1, 1, 1, 1)
	var tween := create_tween()
	tween.tween_interval(3.0)
	tween.tween_property(_toast, "modulate:a", 0.0, 0.8)


func _update_stats_label() -> void:
	_stats_label.text = "Alignment: %+d   Fraktionsdisziplin: %d/10   Szene: %s" % [
		GameState.alignment_score,
		GameState.fraktionsdisziplin,
		GameState.current_scene,
	]

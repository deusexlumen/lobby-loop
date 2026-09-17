# PURPOSE: Visuelle GM-Repräsentation: schwebender Aktenkoffer (Tween-Animation), drawn per Code.
# ARCHITECTURE: ui
# DEPENDENCIES: none
# PIPELINE: runtime
# LAST_VALIDATED: 2026-09-17
extends Control

const FLOAT_DISTANCE := 10.0
const FLOAT_DURATION := 1.6

var _body: ColorRect
var _float_tween: Tween


func _ready() -> void:
	custom_minimum_size = Vector2(96, 84)
	size = custom_minimum_size
	mouse_filter = MOUSE_FILTER_IGNORE
	_draw_briefcase()
	_start_float()


func _draw_briefcase() -> void:
	var handle := ColorRect.new()
	handle.color = Color(0.24, 0.16, 0.09)
	handle.position = Vector2(30, 0)
	handle.size = Vector2(36, 18)
	add_child(handle)

	_body = ColorRect.new()
	_body.color = Color(0.42, 0.29, 0.16)
	_body.position = Vector2(0, 16)
	_body.size = Vector2(96, 62)
	add_child(_body)

	var lid_line := ColorRect.new()
	lid_line.color = Color(0.2, 0.13, 0.07)
	lid_line.position = Vector2(0, 44)
	lid_line.size = Vector2(96, 4)
	_body.add_child(lid_line)

	var buckle := ColorRect.new()
	buckle.color = Color(0.85, 0.72, 0.3)
	buckle.position = Vector2(42, 26)
	buckle.size = Vector2(12, 12)
	_body.add_child(buckle)

	var label := Label.new()
	label.text = "GM"
	label.add_theme_color_override("font_color", Color(0.92, 0.88, 0.78))
	label.position = Vector2(4, 2)
	_body.add_child(label)


func _start_float() -> void:
	var base_y := position.y
	_float_tween = create_tween().set_loops()
	_float_tween.tween_property(self, "position:y", base_y - FLOAT_DISTANCE, FLOAT_DURATION)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	_float_tween.tween_property(self, "position:y", base_y + FLOAT_DISTANCE, FLOAT_DURATION)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)


## Kleiner Schuetteleffekt, wenn der GM spricht.
func flutter() -> void:
	var shake := create_tween()
	shake.tween_property(_body, "rotation", 0.08, 0.08)
	shake.tween_property(_body, "rotation", -0.08, 0.08)
	shake.tween_property(_body, "rotation", 0.0, 0.08)

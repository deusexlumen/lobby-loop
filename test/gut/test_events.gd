# PURPOSE: EventApplier: alle 5 trigger_event-Typen, unbekannte Typen → Warnung + false, kein Crash.
# ARCHITECTURE: test
# DEPENDENCIES: EventApplier
# PIPELINE: test
# LAST_VALIDATED: 2026-09-17
extends GutTest


class StubState:
	extends RefCounted

	var calls: Array = []

	func add_item(item_id: String) -> void:
		calls.append(["add_item", item_id])

	func remove_item(item_id: String) -> void:
		calls.append(["remove_item", item_id])

	func change_scene(scene_id: String) -> void:
		calls.append(["change_scene", scene_id])

	func modify_stat(stat: String, delta: int) -> void:
		calls.append(["modify_stat", stat, delta])

	func start_minigame() -> void:
		calls.append(["start_minigame"])


var state: StubState


func before_each() -> void:
	state = StubState.new()


func test_add_item() -> void:
	assert_true(EventApplier.apply({"type": "add_item", "item": "konfetti_der_straffreiheit"}, state))
	assert_eq(state.calls, [["add_item", "konfetti_der_straffreiheit"]])


func test_remove_item() -> void:
	assert_true(EventApplier.apply({"type": "remove_item", "item": "schwarzer_koffer"}, state))
	assert_eq(state.calls, [["remove_item", "schwarzer_koffer"]])


func test_change_scene() -> void:
	assert_true(EventApplier.apply({"type": "change_scene", "scene": "untersuchungsausschuss"}, state))
	assert_eq(state.calls, [["change_scene", "untersuchungsausschuss"]])


func test_modify_stat_alignment() -> void:
	assert_true(EventApplier.apply({"type": "modify_stat", "stat": "alignment", "delta": -2}, state))
	assert_eq(state.calls, [["modify_stat", "alignment", -2]])


func test_modify_stat_discipline() -> void:
	assert_true(EventApplier.apply({"type": "modify_stat", "stat": "discipline", "delta": -1}, state))
	assert_eq(state.calls, [["modify_stat", "discipline", -1]])


func test_start_minigame() -> void:
	assert_true(EventApplier.apply({"type": "start_minigame"}, state))
	assert_eq(state.calls, [["start_minigame"]])


func test_unknown_type_warns_and_returns_false() -> void:
	assert_false(EventApplier.apply({"type": "reset_galaxy"}, state))
	assert_eq(state.calls.size(), 0, "Unbekannter Typ darf keine Mutation ausloesen")


func test_null_event_is_noop() -> void:
	assert_false(EventApplier.apply(null, state))
	assert_false(EventApplier.is_valid(null))
	assert_eq(state.calls.size(), 0)


func test_non_dictionary_event_is_noop() -> void:
	assert_false(EventApplier.apply("add_item:schredder", state))
	assert_eq(state.calls.size(), 0)


func test_valid_type_enum() -> void:
	assert_true(EventApplier.is_valid({"type": "add_item"}))
	assert_false(EventApplier.is_valid({"type": "rigged_wahl"}))
	assert_false(EventApplier.is_valid({"type": ""}))

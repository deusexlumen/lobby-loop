# PURPOSE: DiceCore: Wurf-Bereich 1-20, Bonus-Addition, DC-Vergleich, roll_none-Form.
# ARCHITECTURE: test
# DEPENDENCIES: DiceCore
# PIPELINE: test
# LAST_VALIDATED: 2026-09-17
extends GutTest


func test_value_within_w20_range() -> void:
	for iteration in 200:
		var roll := DiceCore.roll(10)
		assert_true(int(roll["value"]) >= 1, "Wurf mindestens 1")
		assert_true(int(roll["value"]) <= 20, "Wurf hoechstens 20")


func test_response_shape_matches_contract() -> void:
	var roll := DiceCore.roll(10)
	for key in ["dice", "value", "bonuses", "total", "difficulty_class", "success"]:
		assert_true(roll.has(key), "Schluessel %s vorhanden" % key)
	assert_eq(roll["dice"], "W20")
	assert_eq(roll["difficulty_class"], 10)


func test_bonuses_are_additive() -> void:
	var bonuses := [
		{"source": "berufspolitischer_bonus", "value": 3},
		{"source": "konfetti_der_straffreiheit", "value": 2},
	]
	var roll := DiceCore.roll(20, bonuses)
	assert_eq(int(roll["total"]), int(roll["value"]) + 5)
	assert_eq((roll["bonuses"] as Array).size(), 2)


func test_broken_bonus_entries_are_tolerated() -> void:
	var roll := DiceCore.roll(10, [null, "Quatsch", {"source": "ohne_wert"}, {"value": 4}])
	assert_eq(int(roll["total"]), int(roll["value"]) + 4)
	assert_eq((roll["bonuses"] as Array).size(), 1)


func test_success_when_total_meets_dc() -> void:
	var roll := DiceCore.roll(1, [{"source": "test", "value": 19}])
	assert_true(bool(roll["success"]), "total >= DC muss Erfolg sein")


func test_failure_when_total_below_dc() -> void:
	var roll := DiceCore.roll(20, [])
	assert_true(not bool(roll["success"]), "total < DC muss Misserfolg sein")


func test_roll_none_needs_no_dice() -> void:
	var roll := DiceCore.roll_none(12)
	assert_eq(roll["dice"], "none")
	assert_true(bool(roll["success"]))
	assert_eq(int(roll["difficulty_class"]), 12)
	assert_eq((roll["bonuses"] as Array).size(), 0)

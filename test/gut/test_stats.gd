# PURPOSE: StatRules: Disziplin-Clamp 0-10, Startwerte, Alignment ohne Clamp, Perma-Death-Grenze, DC-Clamp.
# ARCHITECTURE: test
# DEPENDENCIES: StatRules
# PIPELINE: test
# LAST_VALIDATED: 2026-09-17
extends GutTest


func test_start_values() -> void:
	assert_eq(StatRules.ALIGNMENT_START, 0)
	assert_eq(StatRules.DISCIPLINE_START, 5)


func test_discipline_delta_applies_and_clamps_high() -> void:
	assert_eq(StatRules.apply_discipline_delta(8, 5), 10)


func test_discipline_delta_clamps_low() -> void:
	assert_eq(StatRules.apply_discipline_delta(2, -5), 0)


func test_discipline_within_range_unchanged() -> void:
	assert_eq(StatRules.apply_discipline_delta(5, -1), 4)
	assert_eq(StatRules.apply_discipline_delta(5, 1), 6)


func test_alignment_is_unbounded() -> void:
	assert_eq(StatRules.apply_alignment_delta(0, -4), -4)
	assert_eq(StatRules.apply_alignment_delta(-4, 10), 6)


func test_perma_death_only_at_or_below_zero() -> void:
	assert_true(StatRules.is_perma_death(0))
	assert_true(StatRules.is_perma_death(-1))
	assert_false(StatRules.is_perma_death(1))
	assert_false(StatRules.is_perma_death(5))


func test_dc_clamped_to_1_20() -> void:
	assert_eq(StatRules.clamp_dc(0), 1)
	assert_eq(StatRules.clamp_dc(25), 20)
	assert_eq(StatRules.clamp_dc(12), 12)

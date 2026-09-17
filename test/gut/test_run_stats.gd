# PURPOSE: RunStats (Würfe/Events/Verläufe, Caps, Serialisierung) und EpitaphGenerator (lokale Karriere-Akte).
# ARCHITECTURE: test
# DEPENDENCIES: RunStats, EpitaphGenerator
# PIPELINE: test
# LAST_VALIDATED: 2026-09-17
extends GutTest

var stats: RunStats


func before_each() -> void:
	stats = RunStats.new()


func test_records_rolls() -> void:
	stats.record_roll({"dice": "W20", "value": 14, "total": 17, "difficulty_class": 12, "success": true})
	stats.record_roll({"dice": "W20", "value": 3, "total": 6, "difficulty_class": 12, "success": false})
	assert_eq(stats.roll_count(), 2)
	assert_eq(stats.successful_rolls(), 1)


func test_roll_cap_drops_oldest() -> void:
	for index in RunStats.MAX_ROLLS + 5:
		stats.record_roll({"dice": "W20", "value": 10, "total": 10, "difficulty_class": 10, "success": true})
	assert_eq(stats.roll_count(), RunStats.MAX_ROLLS)


func test_records_events_and_caps() -> void:
	for index in RunStats.MAX_EVENTS + 3:
		stats.record_event({"type": "remove_item", "item": "schwarzer_koffer"})
	assert_eq(stats.events.size(), RunStats.MAX_EVENTS)


func test_stat_snapshots_tracked_in_order() -> void:
	stats.record_stat_snapshot(-2, 4)
	stats.record_stat_snapshot(-5, 3)
	assert_eq(stats.alignment_timeline, [-2, -5])
	assert_eq(stats.discipline_timeline, [4, 3])


func test_to_dict_contains_all_sections() -> void:
	stats.record_roll({"dice": "W20", "value": 20, "total": 23, "difficulty_class": 12, "success": true})
	stats.record_event({"type": "add_item", "item": "gedaechtnisluecke"})
	stats.record_stat_snapshot(1, 5)
	var dump: Dictionary = stats.to_dict()
	assert_has(dump, "started_at")
	assert_eq(dump["rolls"].size(), 1)
	assert_eq(dump["events"].size(), 1)
	assert_eq(dump["alignment_timeline"], [1])
	assert_false(str(dump["started_at"]).is_empty())


func test_started_at_is_iso_string() -> void:
	assert_true(stats.started_at.contains("T") or stats.started_at.contains(" "))


func test_epitaph_mentions_death_cause_and_stats() -> void:
	stats.record_roll({"dice": "W20", "value": 15, "total": 18, "difficulty_class": 12, "success": true})
	stats.record_roll({"dice": "W20", "value": 2, "total": 5, "difficulty_class": 12, "success": false})
	stats.record_event({"type": "remove_item", "item": "schwarzer_koffer"})
	stats.record_event({"type": "remove_item", "item": "schamgrenze"})
	stats.record_stat_snapshot(-7, 0)
	var payload := stats.to_dict()
	payload["minigame"] = {"round": 4, "won_rounds": 2, "lost_rounds": 2}
	payload["alignment_score"] = -7
	payload["fraktionsdisziplin"] = 0
	var result: Dictionary = EpitaphGenerator.generate(payload)
	var epitaph := str(result["epitaph"])
	assert_string_contains(epitaph, "KARRIERE-AKTE")
	assert_string_contains(epitaph, "Fraktionsdisziplin")
	assert_string_contains(epitaph, "2 (1 erfolgreich)")
	assert_string_contains(epitaph, "Verbrannte Konzepte: 2")
	assert_string_contains(epitaph, "Endzynismus: -7")
	assert_eq((result["highlights"] as Array).size(), 3)


func test_epitaph_empty_run_still_works() -> void:
	var result: Dictionary = EpitaphGenerator.generate({"minigame": {}, "alignment_score": 0})
	assert_string_contains(str(result["epitaph"]), "Fraktionsdisziplin")
	assert_true((result["highlights"] as Array).size() >= 1)


func test_epitaph_burned_items_drive_sentence() -> void:
	for index in 3:
		stats.record_event({"type": "remove_item", "item": "schwarzer_koffer"})
	var result: Dictionary = EpitaphGenerator.generate(stats.to_dict())
	assert_string_contains(str(result["epitaph"]), "verbrannte")

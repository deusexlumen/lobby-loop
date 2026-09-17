# PURPOSE: SaveData: Fresh-State-Form, Write/Read-Roundtrip, Toleranz gegen fehlende/kaputte Dateien, Perma-Death-Overwrite.
# ARCHITECTURE: test
# DEPENDENCIES: SaveData
# PIPELINE: test
# LAST_VALIDATED: 2026-09-17
extends GutTest

const TEST_PATH := "user://gut_save_roundtrip.json"


func after_each() -> void:
	if FileAccess.file_exists(TEST_PATH):
		DirAccess.remove_absolute(TEST_PATH)


func test_fresh_state_shape() -> void:
	var fresh := SaveData.fresh_state()
	assert_eq(fresh["inventory"], [])
	assert_eq(int(fresh["alignment_score"]), 0)
	assert_eq(int(fresh["fraktionsdisziplin"]), 5)
	assert_eq(str(fresh["current_scene"]), "kommunalpolitik")
	assert_true(fresh["flags"] is Dictionary)
	assert_true(fresh["minigame"] is Dictionary)


func test_write_read_roundtrip() -> void:
	var state := {
		"inventory": ["schwarzer_koffer", "gedaechtnisluecke"],
		"alignment_score": -4,
		"fraktionsdisziplin": 7,
		"current_scene": "untersuchungsausschuss",
		"flags": {"presse_geblendet": true},
		"minigame": {"round": 2, "won_rounds": 1, "lost_rounds": 1},
	}
	assert_eq(SaveData.write(TEST_PATH, state), OK)
	var loaded := SaveData.read(TEST_PATH)
	assert_eq(loaded["inventory"], ["schwarzer_koffer", "gedaechtnisluecke"])
	assert_eq(int(loaded["alignment_score"]), -4)
	assert_eq(int(loaded["fraktionsdisziplin"]), 7)
	assert_eq(str(loaded["current_scene"]), "untersuchungsausschuss")
	assert_true(bool(loaded["flags"]["presse_geblendet"]))
	assert_eq(int(loaded["minigame"]["won_rounds"]), 1)


func test_missing_file_returns_empty_dict() -> void:
	assert_eq(SaveData.read(TEST_PATH), {})
	assert_false(SaveData.has_save(TEST_PATH))


func test_corrupt_json_returns_empty_dict() -> void:
	var file := FileAccess.open(TEST_PATH, FileAccess.WRITE)
	file.store_string("{{ kein json")
	file.close()
	assert_eq(SaveData.read(TEST_PATH), {})


func test_perma_death_overwrites_with_fresh_state() -> void:
	SaveData.write(TEST_PATH, {
		"inventory": ["alles_weg"],
		"alignment_score": -20,
		"fraktionsdisziplin": 0,
		"current_scene": "untersuchungsausschuss",
		"flags": {},
		"minigame": {"round": 9, "won_rounds": 0, "lost_rounds": 9},
	})
	var fresh := SaveData.write_fresh(TEST_PATH)
	assert_eq(fresh["inventory"], [])
	assert_eq(int(fresh["fraktionsdisziplin"]), 5)
	assert_eq(str(fresh["current_scene"]), "kommunalpolitik")
	var reloaded := SaveData.read(TEST_PATH)
	assert_eq(reloaded["inventory"], [])
	assert_eq(int(reloaded["alignment_score"]), 0)

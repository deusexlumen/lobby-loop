# PURPOSE: MinigameShuffle: Determinismus, Korrektheit des verschobenen correct_index, Ausnahmefaelle.
# ARCHITECTURE: test
# DEPENDENCIES: MinigameShuffle
# PIPELINE: test
# LAST_VALIDATED: 2026-09-17
extends GutTest

const PHRASES := ["alpha", "beta", "gamma"]


func test_same_seed_is_deterministic() -> void:
	var a: Dictionary = MinigameShuffle.shuffle_round(PHRASES, 2, "runde#1")
	var b: Dictionary = MinigameShuffle.shuffle_round(PHRASES, 2, "runde#1")
	assert_eq(a["phrases"], b["phrases"])
	assert_eq(int(a["correct_index"]), int(b["correct_index"]))


func test_correct_phrase_stays_identifiable() -> void:
	for seed in ["a#1", "b#2", "c#3", "d#4", "e#5"]:
		var result: Dictionary = MinigameShuffle.shuffle_round(PHRASES, 2, seed)
		var phrases: Array = result["phrases"]
		var index := int(result["correct_index"])
		assert_true(index >= 0 and index < phrases.size(), "Index in Reichweite")
		assert_eq(str(phrases[index]), "gamma", "Korrekte Phrase an neuer Position")


func test_content_index_two_does_not_stick() -> void:
	# Der Content-Bug: correct_index immer 2. Nach dem Mischen darf das Muster gebrochen sein.
	var positions: Array = []
	for i in 12:
		var result: Dictionary = MinigameShuffle.shuffle_round(PHRASES, 2, "vorwurf#%d" % i)
		positions.append(int(result["correct_index"]))
	var varied := false
	for p in positions:
		if int(p) != 2:
			varied = true
	assert_true(varied, "Korrekte Position variiert ueber verschiedene Seeds")


func test_all_permutations_valid_bags() -> void:
	for i in 10:
		var result: Dictionary = MinigameShuffle.shuffle_round(PHRASES, 1, "seed#%d" % i)
		var phrases: Array = (result["phrases"] as Array).duplicate()
		phrases.sort()
		var expected := PHRASES.duplicate()
		expected.sort()
		assert_eq(phrases, expected, "Keine Phrase verloren, keine hinzugekommen")


func test_single_phrase_passes_through() -> void:
	var result: Dictionary = MinigameShuffle.shuffle_round(["nur_eine"], 0, "x")
	assert_eq(result["phrases"], ["nur_eine"])
	assert_eq(int(result["correct_index"]), 0)


func test_empty_phrases_pass_through() -> void:
	var result: Dictionary = MinigameShuffle.shuffle_round([], 0, "x")
	assert_eq((result["phrases"] as Array).size(), 0)


func test_out_of_range_index_clamps_to_last() -> void:
	var result: Dictionary = MinigameShuffle.shuffle_round(PHRASES, 99, "clamp")
	var phrases: Array = result["phrases"]
	assert_eq(str(phrases[int(result["correct_index"])]), "gamma")


func test_duplicate_phrases_still_identifiable() -> void:
	# Bei Mehrfachtreffern zeigt der Index auf den ersten Treffer der korrekten Phrase.
	var dupes := ["gleich", "anders", "gleich"]
	var result: Dictionary = MinigameShuffle.shuffle_round(dupes, 2, "dup")
	var phrases: Array = result["phrases"]
	var index := int(result["correct_index"])
	assert_true(index >= 0 and index < phrases.size(), "Index in Reichweite")
	assert_eq(str(phrases[index]), "gleich", "Korrekte Phrase identifizierbar")
	var sorted: Array = phrases.duplicate()
	sorted.sort()
	var expected := dupes.duplicate()
	expected.sort()
	assert_eq(sorted, expected, "Keine Phrase verloren")

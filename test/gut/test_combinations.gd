# PURPOSE: CombinationResolver: Treffer (auch spiegelverkehrt), Miss, Toleranz gegen kaputte Eintraege.
# ARCHITECTURE: test
# DEPENDENCIES: CombinationResolver
# PIPELINE: test
# LAST_VALIDATED: 2026-09-17
extends GutTest

var combinations := [
	{"a": "unschuldsvermutung", "b": "schredder", "result": "konfetti_der_straffreiheit", "flavor": "Papierregen."},
	{"a": "schamgrenze", "b": "schwarzer_koffer", "result": "gedaechtnisluecke", "flavor": "Elegant gefaltet."},
]


func test_hit_returns_combo_dict() -> void:
	var combo: Variant = CombinationResolver.find("unschuldsvermutung", "schredder", combinations)
	assert_not_null(combo)
	assert_eq(str(combo["result"]), "konfetti_der_straffreiheit")


func test_hit_is_order_independent() -> void:
	var combo: Variant = CombinationResolver.find("schredder", "unschuldsvermutung", combinations)
	assert_not_null(combo)
	assert_eq(str(combo["result"]), "konfetti_der_straffreiheit")


func test_miss_returns_null() -> void:
	assert_null(CombinationResolver.find("unschuldsvermutung", "schwarzer_koffer", combinations))


func test_unknown_ids_return_null() -> void:
	assert_null(CombinationResolver.find("nicht_da", "auch_nicht", combinations))


func test_same_item_combines_with_nothing() -> void:
	assert_null(CombinationResolver.find("schredder", "schredder", combinations))


func test_broken_entries_are_skipped() -> void:
	var messy: Array = [null, "Krawatte", {"a": "nur_a"}, {"a": "a", "b": "b"}]
	assert_null(CombinationResolver.find("x", "y", messy))
	var combo: Variant = CombinationResolver.find("a", "b", messy)
	assert_not_null(combo)


func test_find_result_shortcut() -> void:
	assert_eq(CombinationResolver.find_result("schamgrenze", "schwarzer_koffer", combinations), "gedaechtnisluecke")
	assert_null(CombinationResolver.find_result("schamgrenze", "schredder", combinations))

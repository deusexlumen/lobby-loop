# PURPOSE: Loescht Inventar-Kombinationen (LucasArts-Matrix) gegen items.json-Eintraege auf.
# ARCHITECTURE: core
# DEPENDENCIES: none
# PIPELINE: runtime
# LAST_VALIDATED: 2026-09-17
class_name CombinationResolver
extends RefCounted

## Findet eine Kombination fuer a+b (Reihenfolge egal). Liefert das Kombinations-
## Dictionary {"a", "b", "result", "flavor"} oder null. Toleriert kaputte Eintraege.
static func find(a: String, b: String, combinations: Array) -> Variant:
	if a.is_empty() or b.is_empty() or a == b:
		return null
	for entry in combinations:
		if not (entry is Dictionary):
			continue
		var combo_a := str(entry.get("a", ""))
		var combo_b := str(entry.get("b", ""))
		if (combo_a == a and combo_b == b) or (combo_a == b and combo_b == a):
			return entry
	return null


## Kurzform: nur das Resultat-Item einer Kombination (oder null).
static func find_result(a: String, b: String, combinations: Array) -> Variant:
	var combo: Variant = find(a, b, combinations)
	if combo == null:
		return null
	return str(combo.get("result", ""))

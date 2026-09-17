# PURPOSE: Deterministische Phrasen-Permutation fuer Minispiel-Runden (verhindert auswendig lernbare correct_index-Muster).
# ARCHITECTURE: core
# DEPENDENCIES: none
# PIPELINE: runtime
# LAST_VALIDATED: 2026-09-17
class_name MinigameShuffle
extends RefCounted

const _FNV_OFFSET := 0x811c9dc5
const _FNV_PRIME := 0x01000193
const _LCG_A := 1103515245
const _LCG_C := 12345
const _MASK := 0x7fffffff


## Mischt die Phrasen einer Runde deterministisch (seeded Fisher-Yates) und rechnet
## den correct_index mit, sodass die korrekte Phrase an ihrer neuen Position liegt.
## seed_material unterscheidet die Aufrufe (z. B. Vorwurf + Abrufzaehler), damit dieselbe
## Runde bei Wiederholung neu gemischt wird. Bei <2 Phrasen oder Mehrfachtreffern: unveraendert.
static func shuffle_round(phrases: Array, correct_index: int, seed_material: String) -> Dictionary:
	var shuffled := phrases.duplicate()
	var n := shuffled.size()
	if n < 2:
		return {"phrases": shuffled, "correct_index": correct_index}
	var correct_text := str(phrases[clampi(correct_index, 0, n - 1)])
	var seed := _fnv1a(seed_material)
	for i in range(n - 1, 0, -1):
		seed = _lcg(seed)
		var j: int = seed % (i + 1)
		var tmp: Variant = shuffled[i]
		shuffled[i] = shuffled[j]
		shuffled[j] = tmp
	var new_index := shuffled.find(correct_text)
	if new_index == -1:
		# Mehrfach vorhandener Text: Position nicht eindeutig — ungemischt zurueckgeben.
		return {"phrases": phrases.duplicate(), "correct_index": correct_index}
	return {"phrases": shuffled, "correct_index": new_index}


## FNV-1a ueber den String — stabil, plattformunabhaengig, nicht Godot-String.hash().
static func _fnv1a(text: String) -> int:
	var h := _FNV_OFFSET
	for i in text.length():
		h = int((h ^ text.unicode_at(i)) * _FNV_PRIME) & _MASK
	return h


static func _lcg(seed: int) -> int:
	return int((seed * _LCG_A + _LCG_C) & _MASK)

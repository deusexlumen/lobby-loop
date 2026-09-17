# PURPOSE: W20-Wurf mit additiven Boni und DC-Vergleich als reine, testbare Logik.
# ARCHITECTURE: core
# DEPENDENCIES: none
# PIPELINE: runtime
# LAST_VALIDATED: 2026-09-17
class_name DiceCore
extends RefCounted

const DICE_TYPE := "W20"
const DIE_MIN := 1
const DIE_MAX := 20

## Wuerfelt einen W20, addiert alle Boni und vergleicht mit der Difficulty Class.
## bonuses: Array von Dictionaries {"source": String, "value": int}.
## Liefert exakt die Dictionary-Form, die POST /gm/result als "roll" erwartet.
static func roll(difficulty_class: int, bonuses: Array = []) -> Dictionary:
	var value := randi_range(DIE_MIN, DIE_MAX)
	var total := value
	var applied: Array = []
	for entry in bonuses:
		if entry is Dictionary and entry.has("value"):
			var bonus_value := int(entry.get("value"))
			total += bonus_value
			applied.append({
				"source": str(entry.get("source", "unbekannt")),
				"value": bonus_value,
			})
	return {
		"dice": DICE_TYPE,
		"value": value,
		"bonuses": applied,
		"total": total,
		"difficulty_class": difficulty_class,
		"success": total >= difficulty_class,
	}


## Baut das Roll-Dictionary fuer Aktionen ohne Wurfprobe (required_roll == "none").
static func roll_none(difficulty_class: int) -> Dictionary:
	return {
		"dice": "none",
		"value": 0,
		"bonuses": [],
		"total": 0,
		"difficulty_class": difficulty_class,
		"success": true,
	}

# PURPOSE: Laufende Run-Statistik: Würfe, Item-Events, Stat-Verläufe, Startzeit — rein, serialisierbar.
# ARCHITECTURE: core
# DEPENDENCIES: none
# PIPELINE: runtime
# LAST_VALIDATED: 2026-09-17
class_name RunStats
extends RefCounted

const MAX_ROLLS := 200
const MAX_EVENTS := 100
const MAX_TIMELINE := 100

var started_at := ""

var rolls: Array = []
var events: Array = []
var alignment_timeline: Array = []
var discipline_timeline: Array = []


func _init() -> void:
	started_at = Time.get_datetime_string_from_system(true, true)


## Nimmt ein roll-Objekt {dice, value, bonuses, total, difficulty_class, success} auf.
func record_roll(roll: Dictionary) -> void:
	if rolls.size() >= MAX_ROLLS:
		rolls.pop_front()
	rolls.append(roll.duplicate())


## Nimmt ein angewendetes trigger_event-Command-Objekt auf (nur validierte Typen).
func record_event(event: Dictionary) -> void:
	if events.size() >= MAX_EVENTS:
		events.pop_front()
	events.append(event.duplicate())


## Snapshot der Stats nach einer modify_stat-Aenderung (Verlauf fürs Ermittlungsstand-Panel).
func record_stat_snapshot(alignment: int, discipline: int) -> void:
	if alignment_timeline.size() >= MAX_TIMELINE:
		alignment_timeline.pop_front()
		discipline_timeline.pop_front()
	alignment_timeline.append(alignment)
	discipline_timeline.append(discipline)


func roll_count() -> int:
	return rolls.size()


func successful_rolls() -> int:
	var count := 0
	for roll in rolls:
		if roll is Dictionary and bool(roll.get("success", false)):
			count += 1
	return count


## Kompaktes, JSON-taugliches Abbild der Akte.
func to_dict() -> Dictionary:
	return {
		"started_at": started_at,
		"rolls": rolls.duplicate(true),
		"events": events.duplicate(true),
		"alignment_timeline": alignment_timeline.duplicate(),
		"discipline_timeline": discipline_timeline.duplicate(),
	}

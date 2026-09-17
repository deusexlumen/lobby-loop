# PURPOSE: Lokaler Fallback-Epitaph-Generator: Karriere-Akte aus Run-Stats, amtlich-satirisch.
# ARCHITECTURE: core
# DEPENDENCIES: none
# PIPELINE: runtime
# LAST_VALIDATED: 2026-09-17
class_name EpitaphGenerator
extends RefCounted

const DEATH_CAUSE := "Fraktionsdisziplin"


## Baut die Karriere-Akte als Dictionary {epitaph, highlights} — identisches Format wie /run/epitaph.
static func generate(stats: Dictionary) -> Dictionary:
	var rolls: Array = stats.get("rolls", []) if stats.get("rolls") is Array else []
	var events: Array = stats.get("events", []) if stats.get("events") is Array else []
	var minigame: Dictionary = stats.get("minigame", {}) if stats.get("minigame") is Dictionary else {}
	var alignment := int(stats.get("alignment_score", 0))

	var minutes := _run_minutes(str(stats.get("started_at", "")))
	var burned := _count_removed_items(events)
	var won := int(minigame.get("won_rounds", 0))
	var lost := int(minigame.get("lost_rounds", 0))
	var successes := _count_successes(rolls)

	var lines: Array = [
		"KARRIERE-AKTE — amtlich gefertigt",
		"",
		"Mandatsdauer: %s" % _format_duration(minutes),
		"Wurfproben: %d (%d erfolgreich)" % [rolls.size(), successes],
		"Verbrannte Konzepte: %d" % burned,
		"Kreuzverhör: %d gewonnen, %d verloren" % [won, lost],
		"Endzynismus: %+d" % alignment,
		"Todesursache: %s" % DEATH_CAUSE,
		"",
		"„%s“" % _epitaph_sentence(minutes, burned, alignment),
	]

	return {
		"epitaph": "\n".join(lines),
		"highlights": _highlights(rolls, burned, won),
	}


static func _run_minutes(started_at: String) -> int:
	if started_at.is_empty():
		return 0
	var started := Time.get_datetime_dict_from_system(true)
	var parsed := Time.get_datetime_dict_from_datetime_string(started_at.replace("T", " "), false)
	var started_unix := Time.get_unix_time_from_datetime_dict(started)
	var parsed_unix := Time.get_unix_time_from_datetime_dict(parsed)
	return maxi(0, int((started_unix - parsed_unix) / 60.0))


static func _format_duration(minutes: int) -> String:
	if minutes < 1:
		return "unter einer Minute (Eilverfahren)"
	if minutes == 1:
		return "1 Minute"
	return "%d Minuten" % minutes


static func _count_removed_items(events: Array) -> int:
	var count := 0
	for event in events:
		if event is Dictionary and str(event.get("type", "")) == "remove_item":
			count += 1
	return count


static func _count_successes(rolls: Array) -> int:
	var count := 0
	for roll in rolls:
		if roll is Dictionary and bool(roll.get("success", false)):
			count += 1
	return count


static func _epitaph_sentence(minutes: int, burned: int, alignment: int) -> String:
	if burned >= 3:
		return "Er verbrannte, was ihn belastete, und am Ende auch sich selbst."
	if alignment <= -5:
		return "So zynisch war er schon lange — nur der Ausschuss hat es jetzt auch gemerkt."
	if minutes < 2:
		return "Ein Mandat im Eilverfahren: schneller verloren als beantragt."
	if minutes >= 30:
		return "Lange hat er durchgehalten. Das System hat länger."
	return "Das System dankt ab. Die Akte wird geschreddert — aus Tradition."


static func _highlights(rolls: Array, burned: int, won: int) -> Array:
	var highlights: Array = []
	if rolls.size() > 0:
		highlights.append("%d Wurfproben gegen den Apparat" % rolls.size())
	if burned > 0:
		highlights.append("%d Konzepte restlos verbrannt" % burned)
	if won > 0:
		highlights.append("Ermittlungsführer %d× in den Burnout geredet" % won)
	if highlights.is_empty():
		highlights.append("Ein stiller Abgang ohne nennenswerte Vorkommnisse — verdächtig still.")
	return highlights

# PURPOSE: Stat-Regeln: Fraktionsdisziplin clamp 0-10, Startwerte, Perma-Death-Grenze.
# ARCHITECTURE: core
# DEPENDENCIES: none
# PIPELINE: runtime
# LAST_VALIDATED: 2026-09-17
class_name StatRules
extends RefCounted

const ALIGNMENT_START := 0
const DISCIPLINE_START := 5
const DISCIPLINE_MIN := 0
const DISCIPLINE_MAX := 10
const DC_MIN := 1
const DC_MAX := 20


## Alignment ist unbegrenzt (int), nur die Disziplin wird geclamped.
static func apply_alignment_delta(current: int, delta: int) -> int:
	return current + delta


static func clamp_discipline(value: int) -> int:
	return clampi(value, DISCIPLINE_MIN, DISCIPLINE_MAX)


static func apply_discipline_delta(current: int, delta: int) -> int:
	return clamp_discipline(current + delta)


## Perma-Death: Disziplin auf (oder unter) null -> Mandat verloren.
static func is_perma_death(discipline: int) -> bool:
	return discipline <= DISCIPLINE_MIN


## DCs liegen laut Spezifikation zwischen 1 und 20.
static func clamp_dc(dc: int) -> int:
	return clampi(dc, DC_MIN, DC_MAX)

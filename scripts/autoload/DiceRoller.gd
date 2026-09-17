# PURPOSE: Digitaler W20: wuerfelt mit Charakterbogen- und Inventar-Boni gegen den DC.
# ARCHITECTURE: autoload
# DEPENDENCIES: DiceCore, GameState
# PIPELINE: runtime
# LAST_VALIDATED: 2026-09-17
extends Node

signal roll_performed(roll: Dictionary)


## Wurf inkl. aller aktiven Boni (Charakterbogen +3 plus Inventar-Buffs).
func roll_check(difficulty_class: int, item_definitions: Array = []) -> Dictionary:
	var dc := StatRules.clamp_dc(difficulty_class)
	var roll := DiceCore.roll(dc, GameState.get_roll_bonuses(item_definitions))
	roll_performed.emit(roll)
	return roll


## Aktion ohne Wurfprobe (required_roll == "none"): Konsequenz direkt erfolgreich.
func roll_none(difficulty_class: int) -> Dictionary:
	var roll := DiceCore.roll_none(StatRules.clamp_dc(difficulty_class))
	roll_performed.emit(roll)
	return roll

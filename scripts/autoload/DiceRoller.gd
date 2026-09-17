# PURPOSE: Digitaler W20: wuerfelt mit Charakterbogen- und Inventar-Boni gegen den DC.
# ARCHITECTURE: autoload
# DEPENDENCIES: DiceCore, GameState
# PIPELINE: runtime
# LAST_VALIDATED: 2026-09-17
extends Node

## Wurf inkl. aller aktiven Boni (Charakterbogen +3 plus Inventar-Buffs).
func roll_check(difficulty_class: int, item_definitions: Array = []) -> Dictionary:
	var dc := StatRules.clamp_dc(difficulty_class)
	return DiceCore.roll(dc, GameState.get_roll_bonuses(item_definitions))


## Aktion ohne Wurfprobe (required_roll == "none"): Konsequenz direkt erfolgreich.
func roll_none(difficulty_class: int) -> Dictionary:
	return DiceCore.roll_none(StatRules.clamp_dc(difficulty_class))

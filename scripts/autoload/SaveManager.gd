# PURPOSE: Speichert/lädt user://savegame.json, autospeichert, Perma-Death überschreibt mit frischem Start-State.
# ARCHITECTURE: autoload
# DEPENDENCIES: SaveData, GameState
# PIPELINE: runtime
# LAST_VALIDATED: 2026-09-17
extends Node

signal perma_death_restarted


func save_game() -> Error:
	return SaveData.write(SaveData.SAVE_PATH, GameState.get_save_dict())


func load_game() -> Dictionary:
	return SaveData.read(SaveData.SAVE_PATH)


func has_save() -> bool:
	return SaveData.has_save(SaveData.SAVE_PATH)


## Autosave bei Szenenwechsel und Minispiel-Ende (durch main aufgerufen).
func autosave() -> Error:
	return save_game()


## Perma-Death: irreversibel mit frischem Start-State ueberschreiben und Neustart signalisieren.
func perma_death() -> Dictionary:
	var fresh := SaveData.write_fresh(SaveData.SAVE_PATH)
	perma_death_restarted.emit()
	return fresh

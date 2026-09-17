# PURPOSE: REST-Client fuer den gm-proxy (4 Endpoints), asynchron, 15s-Timeout, liefert Dictionary oder null.
# ARCHITECTURE: autoload
# DEPENDENCIES: none
# PIPELINE: runtime
# LAST_VALIDATED: 2026-09-17
extends Node

const BASE_URL := "http://localhost:8787"
const REQUEST_TIMEOUT := 15.0

signal request_failed(endpoint: String)


## POST /gm/action — GM bewertet die Absicht, legt DC fest.
func gm_action(payload: Dictionary) -> Variant:
	return await _post("/gm/action", payload, ["gm_dialogue"])


## POST /gm/result — Action-Request plus "roll"-Block, GM kommentiert Ergebnis.
func gm_result(payload: Dictionary, roll: Dictionary) -> Variant:
	var full := payload.duplicate()
	full["roll"] = roll
	return await _post("/gm/result", full, ["gm_dialogue"])


## POST /minigame/round — liefert Vorwurf + 3 PR-Phrasen.
func minigame_round(payload: Dictionary) -> Variant:
	return await _post("/minigame/round", payload, ["accusation", "phrases"])


## POST /minigame/judge — liefert correct/correct_index/commentary.
func minigame_judge(payload: Dictionary) -> Variant:
	return await _post("/minigame/judge", payload, ["correct", "correct_index"])


func _post(path: String, payload: Dictionary, required_keys: Array) -> Variant:
	var http := HTTPRequest.new()
	http.timeout = REQUEST_TIMEOUT
	# Auch bei pausiertem Szenenbaum muss die Antwort ankommen.
	http.process_mode = Node.PROCESS_MODE_ALWAYS
	add_child(http)
	var headers := ["Content-Type: application/json"]
	var error := http.request(BASE_URL + path, headers, HTTPClient.METHOD_POST, JSON.stringify(payload))
	if error != OK:
		http.queue_free()
		request_failed.emit(path)
		return null
	var response: Array = await http.request_completed
	http.queue_free()
	var request_result: int = response[0]
	var response_code: int = response[1]
	var body: PackedByteArray = response[3]
	if request_result != HTTPRequest.RESULT_SUCCESS or response_code != 200:
		request_failed.emit(path)
		return null
	var parser := JSON.new()
	if parser.parse(body.get_string_from_utf8()) != OK:
		request_failed.emit(path)
		return null
	if not (parser.data is Dictionary):
		request_failed.emit(path)
		return null
	var parsed: Dictionary = parser.data
	for key in required_keys:
		if not parsed.has(key):
			request_failed.emit(path)
			return null
	return parsed

/*
 * PURPOSE: JSON-Vertrags-Typen des GM-Proxy (Requests, Responses, Trigger-Event-Enum)
 * ARCHITECTURE: gm-proxy/contracts
 * DEPENDENCIES: none
 * PIPELINE: runtime, test
 * LAST_VALIDATED: 2026-09-17
 */

/** Geschlossenes Enum aller vom Client ausführbaren Welt-Events. */
export type TriggerEvent =
  | { type: 'add_item'; item: string }
  | { type: 'remove_item'; item: string }
  | { type: 'change_scene'; scene: string }
  | { type: 'modify_stat'; stat: 'alignment' | 'discipline'; delta: number }
  | { type: 'start_minigame' };

export interface GmActionRequest {
  player_inventory: string[];
  current_scene: string;
  alignment_score: number;
  fraktionsdisziplin?: number;
  player_input: string;
}

export interface RollBonus {
  source: string;
  value: number;
}

export interface Roll {
  dice: string;
  value: number;
  bonuses: RollBonus[];
  total: number;
  difficulty_class: number;
  success: boolean;
}

export interface GmResultRequest extends GmActionRequest {
  roll: Roll;
}

/** Antwort auf /gm/action und /gm/result — exakt dieses Feld-Set liefert der Client. */
export interface GmResponse {
  gm_dialogue: string;
  required_roll: string;
  difficulty_class: number;
  trigger_event: TriggerEvent | null;
}

export interface MinigameRoundRequest {
  current_scene: string;
  alignment_score: number;
  round: number;
  won_rounds: number;
  lost_rounds: number;
}

export interface MinigameRoundResponse {
  accusation: string;
  phrases: string[];
}

export interface MinigameJudgeRequest {
  accusation: string;
  chosen_index: number;
  phrase: string;
}

export interface MinigameJudgeResponse {
  correct: boolean;
  correct_index: number;
  commentary: string;
}

/** Seams des Servers: 4 Endpoints, produktionsreell per LLM, in Tests gemockt. */
export interface GmHandlers {
  action: (req: GmActionRequest) => Promise<GmResponse>;
  result: (req: GmResultRequest) => Promise<GmResponse>;
  minigameRound: (req: MinigameRoundRequest) => Promise<MinigameRoundResponse>;
  minigameJudge: (req: MinigameJudgeRequest) => Promise<MinigameJudgeResponse>;
}

// ── WebSocket message types: Client → Server ────────────────────────────────

import { Card, GamePhase, PlayerIndex, Suit } from "../engine/types";

export interface MsgJoinRoom {
  type: "join_room";
  roomCode: string;
}

export interface MsgReady {
  type: "ready";
}

export interface MsgChooseTrump {
  type: "choose_trump";
  suit: Suit;
}

export interface MsgDiscard {
  type: "discard";
  cardIndices: number[];
}

export interface MsgDrawChoice {
  type: "draw_choice";
  action: "keep" | "pass";
}

export interface MsgFinalPick {
  type: "final_pick";
  keepIndex: number;
}

export interface MsgPlayCard {
  type: "play_card";
  cardIndex: number;
}

export interface MsgPing {
  type: "ping";
}

export type ClientMessage =
  | MsgJoinRoom
  | MsgReady
  | MsgChooseTrump
  | MsgDiscard
  | MsgDrawChoice
  | MsgFinalPick
  | MsgPlayCard
  | MsgPing;

// ── Server → Client message shapes ──────────────────────────────────────────

export interface SrvRoomJoined {
  type: "room_joined";
  playerIndex: PlayerIndex;
  opponentName: string | null;
  roomCode: string;
}

export interface SrvOpponentJoined {
  type: "opponent_joined";
  name: string;
}

export interface SrvOpponentLeft {
  type: "opponent_left";
}

export interface SrvCountdown {
  type: "countdown";
  seconds: number;
}

export interface SrvGameStart {
  type: "game_start";
  state: import("../engine/types").SanitizedGameState;
}

export interface SrvTrumpChosen {
  type: "trump_chosen";
  suit: Suit;
}

export interface SrvYourTurn {
  type: "your_turn";
  phase: GamePhase;
}

export interface SrvDrawnCard {
  type: "drawn_card";
  card: Card;
}

export interface SrvForcedCard {
  type: "forced_card";
  card: Card;
}

export interface SrvFinalCards {
  type: "final_cards";
  cards: [Card, Card];
}

export interface SrvOpponentDrew {
  type: "opponent_drew";
}

export interface SrvCardPlayed {
  type: "card_played";
  playerIndex: PlayerIndex;
  card: Card;
}

export interface SrvTrickResult {
  type: "trick_result";
  winner: PlayerIndex;
  score: [number, number];
}

export interface SrvRoundResult {
  type: "round_result";
  winner: PlayerIndex;
  tricks: [number, number];
  matchScore: [number, number];
}

export interface SrvNewRound {
  type: "new_round";
  hakem: PlayerIndex;
  state: import("../engine/types").SanitizedGameState;
}

export interface SrvGameOver {
  type: "game_over";
  matchWinner: PlayerIndex;
  finalScore: [number, number];
}

export interface SrvTimeout {
  type: "timeout";
  playerIndex: PlayerIndex;
}

export interface SrvForfeit {
  type: "forfeit";
  playerIndex: PlayerIndex;
}

export interface SrvStateUpdate {
  type: "state_update";
  state: import("../engine/types").SanitizedGameState;
}

export interface SrvError {
  type: "error";
  message: string;
  code: string;
}

export interface SrvPong {
  type: "pong";
}

// ── Factory functions (serialize to JSON string) ─────────────────────────────

export function msgRoomJoined(
  playerIndex: PlayerIndex,
  opponentName: string | null,
  roomCode: string
): string {
  return JSON.stringify({
    type: "room_joined",
    playerIndex,
    opponentName,
    roomCode,
  } satisfies SrvRoomJoined);
}

export function msgOpponentJoined(name: string): string {
  return JSON.stringify({ type: "opponent_joined", name } satisfies SrvOpponentJoined);
}

export function msgOpponentLeft(): string {
  return JSON.stringify({ type: "opponent_left" } satisfies SrvOpponentLeft);
}

export function msgCountdown(seconds: number): string {
  return JSON.stringify({ type: "countdown", seconds } satisfies SrvCountdown);
}

export function msgGameStart(
  state: import("../engine/types").SanitizedGameState
): string {
  return JSON.stringify({ type: "game_start", state } satisfies SrvGameStart);
}

export function msgTrumpChosen(suit: Suit): string {
  return JSON.stringify({ type: "trump_chosen", suit } satisfies SrvTrumpChosen);
}

export function msgYourTurn(phase: GamePhase): string {
  return JSON.stringify({ type: "your_turn", phase } satisfies SrvYourTurn);
}

export function msgDrawnCard(card: Card): string {
  return JSON.stringify({ type: "drawn_card", card } satisfies SrvDrawnCard);
}

export function msgForcedCard(card: Card): string {
  return JSON.stringify({ type: "forced_card", card } satisfies SrvForcedCard);
}

export function msgFinalCards(cards: [Card, Card]): string {
  return JSON.stringify({ type: "final_cards", cards } satisfies SrvFinalCards);
}

export function msgOpponentDrew(): string {
  return JSON.stringify({ type: "opponent_drew" } satisfies SrvOpponentDrew);
}

export function msgCardPlayed(playerIndex: PlayerIndex, card: Card): string {
  return JSON.stringify({
    type: "card_played",
    playerIndex,
    card,
  } satisfies SrvCardPlayed);
}

export function msgTrickResult(
  winner: PlayerIndex,
  score: [number, number]
): string {
  return JSON.stringify({
    type: "trick_result",
    winner,
    score,
  } satisfies SrvTrickResult);
}

export function msgRoundResult(
  winner: PlayerIndex,
  tricks: [number, number],
  matchScore: [number, number]
): string {
  return JSON.stringify({
    type: "round_result",
    winner,
    tricks,
    matchScore,
  } satisfies SrvRoundResult);
}

export function msgNewRound(
  hakem: PlayerIndex,
  state: import("../engine/types").SanitizedGameState
): string {
  return JSON.stringify({ type: "new_round", hakem, state } satisfies SrvNewRound);
}

export function msgGameOver(
  matchWinner: PlayerIndex,
  finalScore: [number, number]
): string {
  return JSON.stringify({
    type: "game_over",
    matchWinner,
    finalScore,
  } satisfies SrvGameOver);
}

export function msgTimeout(playerIndex: PlayerIndex): string {
  return JSON.stringify({ type: "timeout", playerIndex } satisfies SrvTimeout);
}

export function msgForfeit(playerIndex: PlayerIndex): string {
  return JSON.stringify({ type: "forfeit", playerIndex } satisfies SrvForfeit);
}

export function msgStateUpdate(
  state: import("../engine/types").SanitizedGameState
): string {
  return JSON.stringify({ type: "state_update", state } satisfies SrvStateUpdate);
}

export function msgError(message: string, code: string): string {
  return JSON.stringify({ type: "error", message, code } satisfies SrvError);
}

export function msgPong(): string {
  return JSON.stringify({ type: "pong" } satisfies SrvPong);
}

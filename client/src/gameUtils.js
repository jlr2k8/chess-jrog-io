import { Chess } from "chess.js";

export function cloneGame(chess) {
  const copy = new Chess();
  copy.loadPgn(chess.pgn());
  return copy;
}

export function statusMessage(game, side, thinking, error, takebackHint) {
  if (error) return error;
  if (thinking) return "Computer is thinking…";
  if (takebackHint) return takebackHint;
  if (game.isCheckmate()) {
    return game.turn() === side ? "Checkmate - you lose." : "Checkmate - you win!";
  }
  if (game.isStalemate()) return "Stalemate.";
  if (game.isDraw()) return "Draw.";
  if (game.isCheck()) return "Check!";
  return game.turn() === side ? "Your move." : "Computer to move.";
}

export function formatMoveList(history) {
  const rows = [];
  for (let i = 0; i < history.length; i += 2) {
    rows.push({
      number: Math.floor(i / 2) + 1,
      white: history[i] ?? "",
      black: history[i + 1] ?? "",
    });
  }
  return rows;
}

export function undoGame(game, playerColor) {
  if (game.history().length === 0) return null;

  const next = cloneGame(game);
  const verbose = game.history({ verbose: true });
  const removed = verbose[verbose.length - 1];
  if (!next.undo()) return null;

  if (removed?.color !== playerColor && next.history().length > 0) {
    next.undo();
  }

  return next;
}
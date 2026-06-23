import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { cloneGame, formatMoveList, statusMessage, undoGame } from "./gameUtils.js";

describe("statusMessage", () => {
  it("prioritizes errors and thinking state", () => {
    const game = new Chess();
    expect(statusMessage(game, "w", false, "Network error", null)).toBe("Network error");
    expect(statusMessage(game, "w", true, "", null)).toBe("Computer is thinking…");
    expect(statusMessage(game, "w", false, "", "Tap Undo again")).toBe("Tap Undo again");
  });

  it("describes game-over and in-progress states", () => {
    const game = new Chess("rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3");
    expect(statusMessage(game, "w", false, "", null)).toBe("Checkmate — you lose.");

    const inProgress = new Chess();
    expect(statusMessage(inProgress, "w", false, "", null)).toBe("Your move.");
  });
});

describe("formatMoveList", () => {
  it("groups SAN moves into numbered rows", () => {
    expect(formatMoveList([])).toEqual([]);
    expect(formatMoveList(["e4", "e5", "Nf3"])).toEqual([
      { number: 1, white: "e4", black: "e5" },
      { number: 2, white: "Nf3", black: "" },
    ]);
  });
});

describe("cloneGame", () => {
  it("preserves position and move history", () => {
    const game = new Chess();
    game.move("e4");
    game.move("e5");

    const copy = cloneGame(game);
    expect(copy.fen()).toBe(game.fen());
    expect(copy.history()).toEqual(game.history());
    expect(copy).not.toBe(game);
  });
});

describe("undoGame", () => {
  it("undoes only the player move when the last move was theirs", () => {
    const game = new Chess();
    game.move("e4");

    const next = undoGame(game, "w");
    expect(next.history()).toEqual([]);
  });

  it("also undoes the player move when rewinding a computer reply", () => {
    const game = new Chess();
    game.move("e4");
    game.move("e5");

    const next = undoGame(game, "w");
    expect(next.history()).toEqual([]);
  });
});

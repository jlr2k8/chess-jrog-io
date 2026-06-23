import { Chess } from "chess.js";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { DIFFICULTY_IDS } from "../../shared/difficulty.js";
import { createApp } from "./app.js";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const FOOLS_MATE_FEN = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3";
const MAX_PLIES = 24;

function pickDeterministicMove(game) {
  const moves = game.moves({ verbose: true });
  moves.sort((a, b) => {
    const key = (m) => `${m.from}${m.to}${m.promotion ?? ""}`;
    return key(a).localeCompare(key(b));
  });
  return moves[0] ?? null;
}

function isUserTurn(game, userColor) {
  return game.turn() === (userColor === "white" ? "w" : "b");
}

async function requestComputerMove(app, fen, difficulty) {
  return request(app).post("/api/move").send({ fen, difficulty });
}

async function simulateGame(app, { difficulty, userColor, maxPlies = MAX_PLIES }) {
  const game = new Chess();
  let plies = 0;
  let illegalMove = false;

  while (!game.isGameOver() && plies < maxPlies) {
    if (isUserTurn(game, userColor)) {
      const move = pickDeterministicMove(game);
      if (!move) break;
      game.move(move);
      plies += 1;
      continue;
    }

    const res = await requestComputerMove(app, game.fen(), difficulty);
    if (res.status !== 200) {
      const legalMovesRemain = game.moves().length > 0;
      return {
        game,
        plies,
        gameOver: game.isGameOver(),
        maxPliesReached: false,
        unexpectedStatus: res.status,
        error: res.body?.error,
        legalMovesRemain,
      };
    }

    expect(res.status).toBe(200);

    const { from, to, promotion } = res.body;
    const applied = game.move({ from, to, promotion });
    if (!applied) {
      illegalMove = true;
      break;
    }
    plies += 1;
  }

  return {
    game,
    plies,
    gameOver: game.isGameOver(),
    maxPliesReached: plies >= maxPlies && !game.isGameOver(),
    illegalMove,
  };
}

function testTimeoutForDifficulty(difficulty) {
  if (difficulty === "hard") return 90_000;
  if (difficulty === "middle") return 60_000;
  return 45_000;
}

describe("full game integration", () => {
  const app = createApp();

  for (const difficulty of DIFFICULTY_IDS) {
    for (const userColor of ["white", "black"]) {
      it(
        `plays through ${difficulty} with user as ${userColor}`,
        async () => {
          const result = await simulateGame(app, { difficulty, userColor });

          expect(result.illegalMove).toBe(false);
          expect(result.unexpectedStatus).toBeUndefined();
          expect(result.legalMovesRemain).toBeUndefined();
          expect(result.gameOver || result.maxPliesReached).toBe(true);
          expect(result.plies).toBeGreaterThan(0);
        },
        testTimeoutForDifficulty(difficulty),
      );
    }
  }
});

describe("terminal position integration", () => {
  const app = createApp();

  it("returns 400 when the side to move has no legal moves (checkmate)", async () => {
    const res = await request(app)
      .post("/api/move")
      .send({ fen: FOOLS_MATE_FEN, difficulty: "hard" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("No legal moves.");

    const game = new Chess(FOOLS_MATE_FEN);
    expect(game.isCheckmate()).toBe(true);
    expect(game.moves()).toHaveLength(0);
  });

  it("reaches checkmate in a forced sequence from a near-terminal FEN", async () => {
    const scholarsMateFen =
      "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4";
    const game = new Chess(scholarsMateFen);
    const mate = game.move({ from: "h5", to: "f7" });
    expect(mate).toBeTruthy();
    expect(game.isCheckmate()).toBe(true);
    expect(game.moves()).toHaveLength(0);

    const res = await request(app)
      .post("/api/move")
      .send({ fen: game.fen(), difficulty: "easy" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("No legal moves.");
  });

  it("returns 200 for computer while legal moves exist from the starting position", async () => {
    const res = await request(app)
      .post("/api/move")
      .send({ fen: START_FEN, difficulty: "middle" });

    expect(res.status).toBe(200);

    const game = new Chess(START_FEN);
    const applied = game.move({
      from: res.body.from,
      to: res.body.to,
      promotion: res.body.promotion,
    });
    expect(applied).toBeTruthy();
  });
});
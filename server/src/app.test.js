import { Chess } from "chess.js";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const FOOLS_MATE_FEN = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3";

vi.mock("./engine.js", () => ({
  getComputerMove: vi.fn(),
}));

const { getComputerMove } = await import("./engine.js");

describe("POST /api/move", () => {
  const app = createApp();

  beforeEach(() => {
    vi.mocked(getComputerMove).mockReset();
  });

  it("returns 400 when fen is missing", async () => {
    const res = await request(app).post("/api/move").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Missing fen.");
  });

  it("defaults invalid difficulty to middle", async () => {
    const game = new Chess(START_FEN);
    game.move("e4");
    vi.mocked(getComputerMove).mockResolvedValue({
      move: { from: "e7", to: "e5", san: "e5", promotion: undefined },
      fen: "updated-fen",
      engine: "fallback",
      difficulty: "middle",
    });

    await request(app)
      .post("/api/move")
      .send({ fen: START_FEN, difficulty: "impossible" });

    expect(getComputerMove).toHaveBeenCalledWith(START_FEN, "middle");
  });

  it("returns 400 when there are no legal moves", async () => {
    vi.mocked(getComputerMove).mockResolvedValue(null);

    const res = await request(app)
      .post("/api/move")
      .send({ fen: FOOLS_MATE_FEN, difficulty: "easy" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("No legal moves.");
  });

  it("returns the computer move payload", async () => {
    const afterMove = new Chess(START_FEN);
    afterMove.move("e4");
    vi.mocked(getComputerMove).mockResolvedValue({
      move: { from: "e2", to: "e4", san: "e4", promotion: undefined },
      fen: afterMove.fen(),
      engine: "stockfish",
      difficulty: "hard",
    });

    const res = await request(app)
      .post("/api/move")
      .send({ fen: START_FEN, difficulty: "hard" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      from: "e2",
      to: "e4",
      san: "e4",
      fen: afterMove.fen(),
      engine: "stockfish",
    });
  });
});

describe("GET /api/health", () => {
  it("reports service health", async () => {
    const res = await request(createApp()).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      service: "chess.jrog.io",
    });
  });
});

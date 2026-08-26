import { EventEmitter } from "node:events";
import { Chess } from "chess.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockProc = Object.assign(new EventEmitter(), {
  stdout: new EventEmitter(),
  stderr: new EventEmitter(),
  stdin: { write: vi.fn() },
});

vi.mock("node:child_process", () => ({
  spawn: vi.fn(() => mockProc),
}));

const { StockfishEngine, fallbackMove, getComputerMove } = await import("./engine.js");

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const CAPTURE_FEN = "4k3/8/8/8/8/8/4r3/4R2K w - - 0 1";
const FOOLS_MATE_FEN = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3";

describe("fallbackMove", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a legal move from the starting position", () => {
    const move = fallbackMove(START_FEN, "expert");
    const game = new Chess(START_FEN);
    expect(game.move(move)).toBeTruthy();
  });

  it("returns null when there are no legal moves", () => {
    expect(fallbackMove(FOOLS_MATE_FEN, "expert")).toBeNull();
  });

  it("prefers captures on expert difficulty", () => {
    const move = fallbackMove(CAPTURE_FEN, "expert");
    expect(move.from).toBe("e1");
    expect(move.to).toBe("e2");
    expect(move.captured).toBe("r");
  });

  it("picks from the top pool on beginner difficulty", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const move = fallbackMove(START_FEN, "beginner");
    const game = new Chess(START_FEN);
    expect(game.move(move)).toBeTruthy();
  });
});

describe("getComputerMove", () => {
  beforeEach(() => {
    mockProc.removeAllListeners();
    mockProc.stdout.removeAllListeners();
    mockProc.stderr.removeAllListeners();
    mockProc.stdin.write.mockClear();
  });

  it("uses the fallback engine when Stockfish is unavailable", async () => {
    const resultPromise = getComputerMove(START_FEN, "intermediate");
    mockProc.emit("error", new Error("Stockfish unavailable"));

    const result = await resultPromise;
    expect(result.engine).toBe("fallback");
    expect(result.move).toBeTruthy();
    expect(result.fen).not.toBe(START_FEN);
  });
});

describe("StockfishEngine", () => {
  let engine;

  beforeEach(() => {
    engine = new StockfishEngine();
    mockProc.removeAllListeners();
    mockProc.stdout.removeAllListeners();
    mockProc.stderr.removeAllListeners();
    mockProc.stdin.write.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("parses readyok and bestmove from stdout", async () => {
    const movePromise = engine.bestMove(START_FEN, "intermediate");

    mockProc.stdout.emit("data", "readyok\n");
    await vi.advanceTimersByTimeAsync(20);
    mockProc.stdout.emit("data", "bestmove e2e4\n");

    await expect(movePromise).resolves.toBe("e2e4");
    expect(mockProc.stdin.write).toHaveBeenCalledWith("go movetime 1200\n");
  });

  it("buffers partial stdout lines across chunks", async () => {
    const movePromise = engine.bestMove(START_FEN, "intermediate");

    mockProc.stdout.emit("data", "ready");
    mockProc.stdout.emit("data", "ok\nbestmove d2d");
    mockProc.stdout.emit("data", "4\n");

    await expect(movePromise).resolves.toBe("d2d4");
  });

  it("rejects when the process exits before a move", async () => {
    const movePromise = engine.bestMove(START_FEN, "intermediate");
    mockProc.emit("close");

    await expect(movePromise).rejects.toThrow("Stockfish exited");
  });
});
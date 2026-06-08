import { spawn } from "node:child_process";
import { Chess } from "chess.js";

const STOCKFISH_PATH = process.env.STOCKFISH_PATH || "/usr/games/stockfish";
const ENGINE_MOVETIME_MS = Number(process.env.STOCKFISH_MOVETIME_MS || 1500);
const ENGINE_TIMEOUT_MS = Number(process.env.STOCKFISH_TIMEOUT_MS || 8000);

function fallbackMove(fen) {
  const game = new Chess(fen);
  const moves = game.moves({ verbose: true });
  if (moves.length === 0) return null;

  const scored = moves.map((move) => {
    let score = Math.random();
    if (move.captured) score += 10;
    if (move.san.includes("+")) score += 3;
    if (["d4", "d5", "e4", "e5", "c4", "c5"].includes(move.to)) score += 1;
    return { move, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].move;
}

class StockfishEngine {
  constructor() {
    this.proc = null;
    this.ready = false;
    this.busy = false;
    this.queue = [];
    this.current = null;
    this.buffer = "";
  }

  start() {
    if (this.proc) return;

    this.proc = spawn(STOCKFISH_PATH, []);
    this.proc.stdout.on("data", (chunk) => this.onStdout(chunk.toString()));
    this.proc.stderr.on("data", () => {});
    this.proc.on("error", () => this.failCurrent(new Error("Stockfish unavailable")));
    this.proc.on("close", () => {
      this.proc = null;
      this.ready = false;
      this.failCurrent(new Error("Stockfish exited"));
    });

    this.send("uci");
    this.send("isready");
  }

  send(cmd) {
    this.proc?.stdin.write(`${cmd}\n`);
  }

  onStdout(chunk) {
    this.buffer += chunk;
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === "readyok") this.ready = true;
      if (trimmed.startsWith("bestmove ")) {
        const move = trimmed.split(/\s+/)[1];
        if (this.current && move && move !== "(none)") {
          this.finishCurrent(move);
        }
      }
    }
  }

  finishCurrent(move) {
    const job = this.current;
    if (!job) return;
    clearTimeout(job.timer);
    this.current = null;
    this.busy = false;
    job.resolve(move);
    this.pump();
  }

  failCurrent(err) {
    const job = this.current;
    if (!job) return;
    clearTimeout(job.timer);
    this.current = null;
    this.busy = false;
    job.reject(err);
    this.pump();
  }

  pump() {
    if (this.busy || this.queue.length === 0) return;

    this.start();
    if (!this.proc) {
      const job = this.queue.shift();
      job.reject(new Error("Stockfish unavailable"));
      this.pump();
      return;
    }

    const job = this.queue.shift();
    this.busy = true;
    this.current = job;

    job.timer = setTimeout(() => {
      this.failCurrent(new Error("Stockfish timed out"));
    }, ENGINE_TIMEOUT_MS);

    const run = () => {
      this.send(`position fen ${job.fen}`);
      this.send(`go movetime ${ENGINE_MOVETIME_MS}`);
    };

    if (this.ready) {
      run();
      return;
    }

    const wait = setInterval(() => {
      if (!this.ready) return;
      clearInterval(wait);
      run();
    }, 10);
  }

  bestMove(fen) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fen, resolve, reject, timer: null });
      this.pump();
    });
  }
}

const engine = new StockfishEngine();

async function runStockfish(fen) {
  return engine.bestMove(fen);
}

export async function getComputerMove(fen) {
  try {
    const uci = await runStockfish(fen);
    const game = new Chess(fen);
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length > 4 ? uci[4] : undefined;
    const move = game.move({ from, to, promotion });
    if (!move) throw new Error(`Illegal engine move: ${uci}`);
    return { move, fen: game.fen(), engine: "stockfish" };
  } catch {
    const game = new Chess(fen);
    const move = fallbackMove(fen);
    if (!move) return null;
    game.move(move);
    return { move, fen: game.fen(), engine: "fallback" };
  }
}

import { spawn } from "node:child_process";
import { Chess } from "chess.js";

const STOCKFISH_PATH = process.env.STOCKFISH_PATH || "/usr/games/stockfish";
const ENGINE_DEPTH = Number(process.env.STOCKFISH_DEPTH || 10);

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

function runStockfish(fen, depth) {
  return new Promise((resolve, reject) => {
    let sawReady = false;
    let settled = false;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      fn(value);
    };

    const proc = spawn(STOCKFISH_PATH, []);
    const timeout = setTimeout(() => {
      proc.kill();
      finish(reject, new Error("Stockfish timed out"));
    }, 30000);

    proc.stdout.on("data", (chunk) => {
      for (const line of chunk.toString().split("\n")) {
        const trimmed = line.trim();
        if (trimmed === "readyok") sawReady = true;
        if (trimmed.startsWith("bestmove ")) {
          const move = trimmed.split(/\s+/)[1];
          if (move && move !== "(none)") {
            proc.kill();
            finish(resolve, move);
          }
        }
      }
    });

    proc.stderr.on("data", () => {});

    proc.on("error", (err) => {
      finish(reject, err);
    });

    proc.on("close", (code) => {
      if (!settled) finish(reject, new Error(`Stockfish exited ${code}`));
    });

    const send = (cmd) => {
      proc.stdin.write(`${cmd}\n`);
    };

    send("uci");
    send("isready");

    const waitForReady = setInterval(() => {
      if (!sawReady) return;
      clearInterval(waitForReady);
      send(`position fen ${fen}`);
      send(`go depth ${depth}`);
    }, 10);
  });
}

export async function getComputerMove(fen) {
  try {
    const uci = await runStockfish(fen, ENGINE_DEPTH);
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

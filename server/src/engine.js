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
    let bestMove = "";
    let stderr = "";

    const proc = spawn(STOCKFISH_PATH, [], { stdio: ["pipe", "pipe", "pipe"] });

    const timeout = setTimeout(() => {
      proc.kill();
      reject(new Error("Stockfish timed out"));
    }, 15000);

    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    proc.stdout.on("data", (chunk) => {
      const lines = chunk.toString().split("\n");
      for (const line of lines) {
        const match = line.match(/^bestmove\s+(\S+)/);
        if (match) bestMove = match[1];
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    proc.on("close", (code) => {
      clearTimeout(timeout);
      if (bestMove && bestMove !== "(none)") {
        resolve(bestMove);
        return;
      }
      reject(new Error(stderr || `Stockfish exited ${code}`));
    });

    proc.stdin.write("uci\n");
    proc.stdin.write("isready\n");
    proc.stdin.write(`position fen ${fen}\n`);
    proc.stdin.write(`go depth ${depth}\n`);
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import "./App.css";

function statusMessage(game, side, thinking) {
  if (thinking) return "Computer is thinking…";
  if (game.isCheckmate()) {
    return game.turn() === side ? "Checkmate — you lose." : "Checkmate — you win!";
  }
  if (game.isStalemate()) return "Stalemate.";
  if (game.isDraw()) return "Draw.";
  if (game.isCheck()) return "Check!";
  return game.turn() === side ? "Your move." : "Computer to move.";
}

export default function App() {
  const [game, setGame] = useState(() => new Chess());
  const [moveFrom, setMoveFrom] = useState("");
  const [thinking, setThinking] = useState(false);
  const boardPanelRef = useRef(null);
  const [boardWidth, setBoardWidth] = useState(480);
  const playerColor = "w";

  const fen = game.fen();
  const status = useMemo(
    () => statusMessage(game, playerColor, thinking),
    [game, playerColor, thinking],
  );

  useEffect(() => {
    const el = boardPanelRef.current;
    if (!el) return;

    const updateWidth = () => {
      const width = el.clientWidth - 32;
      setBoardWidth(Math.max(280, Math.min(560, width)));
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const requestComputerMove = useCallback(async (nextFen) => {
    setThinking(true);
    try {
      const res = await fetch("/api/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fen: nextFen }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Computer move failed.");

      setGame(new Chess(data.fen));
    } catch (err) {
      console.error(err);
    } finally {
      setThinking(false);
    }
  }, []);

  const applyPlayerMove = useCallback(
    (next) => {
      setGame(next);
      setMoveFrom("");
      if (!next.isGameOver() && next.turn() !== playerColor) {
        requestComputerMove(next.fen());
      }
    },
    [playerColor, requestComputerMove],
  );

  function resetGame() {
    setGame(new Chess());
    setMoveFrom("");
    setThinking(false);
  }

  function onSquareClick(square) {
    if (thinking || game.turn() !== playerColor || game.isGameOver()) return;

    if (!moveFrom) {
      const piece = game.get(square);
      if (piece && piece.color === playerColor) setMoveFrom(square);
      return;
    }

    if (moveFrom === square) {
      setMoveFrom("");
      return;
    }

    const next = new Chess(game.fen());
    const move = next.move({ from: moveFrom, to: square, promotion: "q" });

    if (move) {
      applyPlayerMove(next);
      return;
    }

    const piece = game.get(square);
    setMoveFrom(piece && piece.color === playerColor ? square : "");
  }

  function onPieceDrop(sourceSquare, targetSquare) {
    if (thinking || game.turn() !== playerColor || game.isGameOver()) return false;

    const next = new Chess(game.fen());
    const move = next.move({
      from: sourceSquare,
      to: targetSquare,
      promotion: "q",
    });

    if (!move) return false;

    applyPlayerMove(next);
    return true;
  }

  const customSquareStyles = moveFrom
    ? {
        [moveFrom]: {
          backgroundColor: "rgba(255, 214, 102, 0.45)",
        },
      }
    : {};

  const canInteract = !thinking && !game.isGameOver() && game.turn() === playerColor;

  return (
    <div className="app">
      <header className="header">
        <div>
          <p className="eyebrow">chess.jrog.io</p>
          <h1>Chess</h1>
          <p className="lede">Play white against the computer.</p>
        </div>
        <button type="button" className="reset" onClick={resetGame} disabled={thinking}>
          New game
        </button>
      </header>

      <main className="layout">
        <section className="board-panel" ref={boardPanelRef}>
          <Chessboard
            id="main-board"
            position={fen}
            boardWidth={boardWidth}
            onPieceDrop={onPieceDrop}
            onSquareClick={onSquareClick}
            customSquareStyles={customSquareStyles}
            boardOrientation="white"
            animationDuration={200}
            arePiecesDraggable={canInteract}
          />
        </section>

        <aside className="sidebar">
          <div className="card">
            <h2>Status</h2>
            <p className="status">{status}</p>
          </div>

          <div className="card">
            <h2>Moves</h2>
            <ol className="move-list">
              {game.history().length === 0 ? (
                <li className="muted">No moves yet.</li>
              ) : (
                game.history().map((move, index) => (
                  <li key={`${move}-${index}`}>{move}</li>
                ))
              )}
            </ol>
          </div>
        </aside>
      </main>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import "./App.css";

const MOVE_ANIMATION_MS = 500;

function cloneGame(chess) {
  const copy = new Chess();
  copy.loadPgn(chess.pgn());
  return copy;
}

function statusMessage(game, side, thinking, error, takebackHint) {
  if (error) return error;
  if (thinking) return "Computer is thinking…";
  if (takebackHint) return takebackHint;
  if (game.isCheckmate()) {
    return game.turn() === side ? "Checkmate — you lose." : "Checkmate — you win!";
  }
  if (game.isStalemate()) return "Stalemate.";
  if (game.isDraw()) return "Draw.";
  if (game.isCheck()) return "Check!";
  return game.turn() === side ? "Your move." : "Computer to move.";
}

function formatMoveList(history) {
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

export default function App() {
  const [game, setGame] = useState(() => new Chess());
  const [moveFrom, setMoveFrom] = useState("");
  const [thinking, setThinking] = useState(false);
  const [boardLocked, setBoardLocked] = useState(false);
  const [error, setError] = useState("");
  const pendingFenRef = useRef("");
  const abortRef = useRef(null);
  const lockTimerRef = useRef(null);
  const computerMoveTimerRef = useRef(null);
  const moveGenerationRef = useRef(0);
  const boardPanelRef = useRef(null);
  const [boardWidth, setBoardWidth] = useState(480);
  const [boardRevision, setBoardRevision] = useState(0);
  const playerColor = "w";

  const fen = game.fen();
  const history = game.history();
  const takebackHint = useMemo(() => {
    if (thinking || game.isGameOver() || game.turn() === playerColor) return null;

    const verbose = game.history({ verbose: true });
    const last = verbose[verbose.length - 1];
    if (last?.color === playerColor) {
      return "Tap Undo again to take back your move.";
    }

    return null;
  }, [game, playerColor, thinking]);

  const status = useMemo(
    () => statusMessage(game, playerColor, thinking, error, takebackHint),
    [game, playerColor, thinking, error, takebackHint],
  );
  const moveRows = useMemo(() => formatMoveList(history), [history]);

  const lockBoard = useCallback((ms = MOVE_ANIMATION_MS) => {
    setBoardLocked(true);
    if (lockTimerRef.current) window.clearTimeout(lockTimerRef.current);
    lockTimerRef.current = window.setTimeout(() => {
      setBoardLocked(false);
      lockTimerRef.current = null;
    }, ms);
  }, []);

  useEffect(() => {
    return () => {
      if (lockTimerRef.current) window.clearTimeout(lockTimerRef.current);
      if (computerMoveTimerRef.current) window.clearTimeout(computerMoveTimerRef.current);
    };
  }, []);

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

  const clearComputerMoveTimer = useCallback(() => {
    if (computerMoveTimerRef.current) {
      window.clearTimeout(computerMoveTimerRef.current);
      computerMoveTimerRef.current = null;
    }
  }, []);

  const cancelComputerRequest = useCallback(() => {
    moveGenerationRef.current += 1;
    clearComputerMoveTimer();
    abortRef.current?.abort();
    abortRef.current = null;
    pendingFenRef.current = "";
    setThinking(false);
    if (lockTimerRef.current) window.clearTimeout(lockTimerRef.current);
    lockTimerRef.current = null;
    setBoardLocked(false);
  }, [clearComputerMoveTimer]);

  const requestComputerMove = useCallback(
    async (nextFen, generation) => {
      if (generation !== moveGenerationRef.current) {
        setBoardLocked(false);
        return;
      }

      pendingFenRef.current = nextFen;
      setThinking(true);
      setError("");

      const controller = new AbortController();
      abortRef.current = controller;
      const timeout = setTimeout(() => controller.abort(), 15000);

      try {
        const res = await fetch("/api/move", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fen: nextFen }),
          signal: controller.signal,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Computer move failed.");
        if (generation !== moveGenerationRef.current) {
          setBoardLocked(false);
          return;
        }

        setGame((current) => {
          if (generation !== moveGenerationRef.current || current.fen() !== nextFen) {
            return current;
          }

          const next = cloneGame(current);
          const move = next.move({
            from: data.from,
            to: data.to,
            promotion: data.promotion,
          });
          return move ? next : current;
        });
        lockBoard(MOVE_ANIMATION_MS);
        pendingFenRef.current = "";
      } catch (err) {
        if (err.name === "AbortError") {
          setBoardLocked(false);
          return;
        }
        if (generation !== moveGenerationRef.current) {
          setBoardLocked(false);
          return;
        }
        const message =
          err.message === "Computer move failed."
            ? "Computer move failed — tap Retry."
            : err.message || "Computer move failed — tap Retry.";
        setError(message);
        setBoardLocked(false);
        console.error(err);
      } finally {
        clearTimeout(timeout);
        if (generation === moveGenerationRef.current && abortRef.current === controller) {
          abortRef.current = null;
          setThinking(false);
        }
      }
    },
    [lockBoard],
  );

  const applyPlayerMove = useCallback(
    (next) => {
      const generation = moveGenerationRef.current;
      setGame(next);
      setMoveFrom("");
      setError("");

      const needsComputer = !next.isGameOver() && next.turn() !== playerColor;
      if (needsComputer) {
        // Stay locked through the 500ms pause and the computer's reply/animation.
        setBoardLocked(true);
        if (lockTimerRef.current) window.clearTimeout(lockTimerRef.current);
        lockTimerRef.current = null;
        clearComputerMoveTimer();
        computerMoveTimerRef.current = window.setTimeout(() => {
          computerMoveTimerRef.current = null;
          requestComputerMove(next.fen(), generation);
        }, MOVE_ANIMATION_MS);
      } else {
        lockBoard(MOVE_ANIMATION_MS);
      }
    },
    [clearComputerMoveTimer, lockBoard, playerColor, requestComputerMove],
  );

  function resetGame() {
    cancelComputerRequest();
    if (lockTimerRef.current) window.clearTimeout(lockTimerRef.current);
    setBoardLocked(false);
    setGame(new Chess());
    setMoveFrom("");
    setError("");
  }

  function retryComputerMove() {
    if (pendingFenRef.current) {
      requestComputerMove(pendingFenRef.current, moveGenerationRef.current);
    }
  }

  function undoLastMove() {
    if (history.length === 0) return;

    clearComputerMoveTimer();
    abortRef.current?.abort();
    abortRef.current = null;
    pendingFenRef.current = "";
    setThinking(false);
    if (lockTimerRef.current) window.clearTimeout(lockTimerRef.current);
    lockTimerRef.current = null;
    setBoardLocked(false);
    moveGenerationRef.current += 1;

    const next = cloneGame(game);
    const verbose = game.history({ verbose: true });
    const removed = verbose[verbose.length - 1];
    if (!next.undo()) return;

    // Vs computer: rewinding the computer's reply also rewinds your move so you can play again.
    if (removed?.color !== playerColor && next.history().length > 0) {
      next.undo();
    }

    setBoardRevision((revision) => revision + 1);
    setGame(next);
    setMoveFrom("");
    setError("");
  }

  const canUndo = history.length > 0;

  function onSquareClick(square) {
    if (thinking || boardLocked || game.turn() !== playerColor || game.isGameOver()) return;

    const piece = game.get(square);

    if (!moveFrom) {
      if (piece?.color === playerColor) setMoveFrom(square);
      return;
    }

    if (square === moveFrom) {
      setMoveFrom("");
      return;
    }

    if (piece?.color === playerColor) {
      setMoveFrom(square);
      return;
    }

    const next = cloneGame(game);
    const move = next.move({ from: moveFrom, to: square, promotion: "q" });

    if (move) {
      applyPlayerMove(next);
      return;
    }

    setMoveFrom("");
  }

  function onPieceDrop(sourceSquare, targetSquare, _piece) {
    if (thinking || boardLocked || game.turn() !== playerColor || game.isGameOver()) return false;

    if (sourceSquare === targetSquare) {
      setMoveFrom("");
      return false;
    }

    const targetPiece = game.get(targetSquare);
    if (targetPiece?.color === playerColor) {
      setMoveFrom(targetSquare);
      return false;
    }

    const next = cloneGame(game);
    const move = next.move({
      from: sourceSquare,
      to: targetSquare,
      promotion: "q",
    });

    if (!move) return false;

    applyPlayerMove(next);
    return true;
  }

  const customSquareStyles = useMemo(() => {
    if (!moveFrom) return {};

    const styles = {
      [moveFrom]: {
        backgroundColor: "rgba(255, 214, 102, 0.45)",
      },
    };

    const legalMoves = game.moves({ square: moveFrom, verbose: true });
    for (const move of legalMoves) {
      styles[move.to] = {
        background:
          game.get(move.to)
            ? "radial-gradient(circle, rgba(0, 0, 0, 0.18) 85%, transparent 86%)"
            : "radial-gradient(circle, rgba(0, 0, 0, 0.14) 22%, transparent 23%)",
      };
    }

    return styles;
  }, [game, moveFrom]);

  const canInteract =
    !thinking && !boardLocked && !game.isGameOver() && game.turn() === playerColor;

  return (
    <div className="app">
      <header className="header">
        <div>
          <p className="eyebrow">chess.jrog.io</p>
          <h1>Chess</h1>
          <p className="lede">Play white against the computer.</p>
        </div>
        <div className="header-actions">
          {error ? (
            <button type="button" className="reset" onClick={retryComputerMove} disabled={thinking}>
              Retry
            </button>
          ) : null}
          <button type="button" className="reset" onClick={resetGame} disabled={thinking}>
            New game
          </button>
        </div>
      </header>

      <main className="layout">
        <div className="board-column">
          <section className="board-panel" ref={boardPanelRef}>
            <Chessboard
              key={boardRevision}
              id="main-board"
              position={fen}
              boardWidth={boardWidth}
              onPieceDrop={onPieceDrop}
              onSquareClick={onSquareClick}
              customSquareStyles={customSquareStyles}
              boardOrientation="white"
              animationDuration={MOVE_ANIMATION_MS}
              arePiecesDraggable={canInteract}
              autoPromoteToQueen
            />
          </section>
          <button
            type="button"
            className="undo-btn"
            onClick={undoLastMove}
            disabled={!canUndo}
            title="Undo the last move (click again to keep going back)"
            aria-label="Undo last move"
          >
            <span className="undo-btn-icon" aria-hidden="true">
              ↩
            </span>
            Undo
          </button>
        </div>

        <aside className="sidebar">
          <div className="card">
            <h2>Status</h2>
            <p className={`status${error ? " status-error" : ""}`}>{status}</p>
          </div>

          <div className="card">
            <h2>Moves</h2>
            <ol className="move-list">
              {moveRows.length === 0 ? (
                <li className="muted">No moves yet.</li>
              ) : (
                moveRows.map((row) => (
                  <li key={row.number} className="move-row">
                    <span className="move-number">{row.number}.</span>
                    <span>{row.white}</span>
                    <span className="muted">{row.black || "…"}</span>
                  </li>
                ))
              )}
            </ol>
          </div>
        </aside>
      </main>
    </div>
  );
}
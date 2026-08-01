import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import {
  DEFAULT_DIFFICULTY,
  DIFFICULTY_IDS,
  DIFFICULTY_LEVELS,
} from "../../shared/difficulty.js";
import { cloneGame, formatMoveList, statusMessage, undoGame } from "./gameUtils.js";
import "./App.css";

const MOVE_ANIMATION_MS = 500;
const COLOR_PREFERENCES = [
  { id: "white", label: "White" },
  { id: "black", label: "Black" },
  { id: "random", label: "Random" },
];

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
  const [difficulty, setDifficulty] = useState(DEFAULT_DIFFICULTY);
  const [playerColor, setPlayerColor] = useState("w");
  const [newGameModalOpen, setNewGameModalOpen] = useState(false);

  const fen = game.fen();
  const history = game.history();
  const canChangeDifficulty = history.length === 0 && !thinking;
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
    if (!newGameModalOpen) return;

    function onKeyDown(event) {
      if (event.key === "Escape") setNewGameModalOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [newGameModalOpen]);

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
    async (nextFen, generation, difficultyId) => {
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
          body: JSON.stringify({ fen: nextFen, difficulty: difficultyId }),
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
            ? "Computer move failed - tap Retry."
            : err.message || "Computer move failed - tap Retry.";
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

  const scheduleComputerMove = useCallback(
    (nextFen, generation, difficultyId) => {
      setBoardLocked(true);
      if (lockTimerRef.current) window.clearTimeout(lockTimerRef.current);
      lockTimerRef.current = null;
      clearComputerMoveTimer();
      computerMoveTimerRef.current = window.setTimeout(() => {
        computerMoveTimerRef.current = null;
        requestComputerMove(nextFen, generation, difficultyId);
      }, MOVE_ANIMATION_MS);
    },
    [clearComputerMoveTimer, requestComputerMove],
  );

  const applyPlayerMove = useCallback(
    (next) => {
      const generation = moveGenerationRef.current;
      setGame(next);
      setMoveFrom("");
      setError("");

      const needsComputer = !next.isGameOver() && next.turn() !== playerColor;
      if (needsComputer) {
        scheduleComputerMove(next.fen(), generation, difficulty);
      } else {
        lockBoard(MOVE_ANIMATION_MS);
      }
    },
    [difficulty, lockBoard, playerColor, scheduleComputerMove],
  );

  function resetGame(preference) {
    cancelComputerRequest();
    if (lockTimerRef.current) window.clearTimeout(lockTimerRef.current);
    setBoardLocked(false);

    let nextPlayerColor = "w";
    if (preference === "black") {
      nextPlayerColor = "b";
    } else if (preference === "random") {
      nextPlayerColor = Math.random() < 0.5 ? "w" : "b";
    }
    setPlayerColor(nextPlayerColor);
    setBoardRevision((revision) => revision + 1);

    const nextGame = new Chess();
    setGame(nextGame);
    setMoveFrom("");
    setError("");

    if (nextPlayerColor === "b") {
      scheduleComputerMove(nextGame.fen(), moveGenerationRef.current, difficulty);
    }
  }

  function startNewGame(preference) {
    setNewGameModalOpen(false);
    resetGame(preference);
  }

  function retryComputerMove() {
    if (pendingFenRef.current) {
      requestComputerMove(pendingFenRef.current, moveGenerationRef.current, difficulty);
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

    const next = undoGame(game, playerColor);
    if (!next) return;

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

  return (
    <div className="app">
      <header className="header">
        <div>
          <p className="eyebrow">chess.jrog.io</p>
          <h1>Chess (Beta)</h1>
          <p className="lede">Play chess against the computer. Tap a piece, then tap a square.</p>
        </div>
        <div className="header-actions">
          {error ? (
            <button type="button" className="reset" onClick={retryComputerMove} disabled={thinking}>
              Retry
            </button>
          ) : null}
          <button
            type="button"
            className="reset"
            onClick={() => setNewGameModalOpen(true)}
            disabled={thinking}
          >
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
              onSquareClick={onSquareClick}
              customSquareStyles={customSquareStyles}
              boardOrientation={playerColor === "w" ? "white" : "black"}
              animationDuration={MOVE_ANIMATION_MS}
              arePiecesDraggable={false}
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
            <h2>Difficulty</h2>
            <div className="difficulty-options" role="group" aria-label="Computer difficulty">
              {DIFFICULTY_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={`difficulty-btn${difficulty === id ? " is-active" : ""}`}
                  onClick={() => setDifficulty(id)}
                  disabled={!canChangeDifficulty}
                  aria-pressed={difficulty === id}
                >
                  {DIFFICULTY_LEVELS[id].label}
                </button>
              ))}
            </div>
            {!canChangeDifficulty ? (
              <p className="difficulty-note muted">Change before the first move or start a new game.</p>
            ) : null}
          </div>

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

      {newGameModalOpen ? (
        <div
          className="modal-backdrop"
          onClick={() => setNewGameModalOpen(false)}
          role="presentation"
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-game-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="new-game-title">New game</h2>
            <p className="modal-lede muted">Choose your color.</p>
            <div className="difficulty-options" role="group" aria-label="Your color">
              {COLOR_PREFERENCES.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  className="difficulty-btn"
                  onClick={() => startNewGame(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
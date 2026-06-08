import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getComputerMove } from "./engine.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT || 3001);
const isProduction = process.env.NODE_ENV === "production";
const clientDevUrl = process.env.CLIENT_DEV_URL || "http://127.0.0.1:5173";

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "chess.jrog.io",
    phase: "board-ui",
  });
});

app.post("/api/move", async (req, res) => {
  const { fen } = req.body ?? {};
  if (!fen || typeof fen !== "string") {
    res.status(400).json({ error: "Missing fen." });
    return;
  }

  try {
    const result = await getComputerMove(fen);
    if (!result) {
      res.status(400).json({ error: "No legal moves." });
      return;
    }

    res.json({
      from: result.move.from,
      to: result.move.to,
      san: result.move.san,
      promotion: result.move.promotion,
      fen: result.fen,
      engine: result.engine,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Engine error." });
  }
});

if (isProduction) {
  const clientDist = path.resolve(__dirname, "../../client/dist");
  app.use(express.static(clientDist));
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
} else {
  app.get("/", (_req, res) => {
    res.redirect(302, clientDevUrl);
  });

  app.get(/.*/, (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.redirect(302, `${clientDevUrl}${req.path}`);
  });
}

app.listen(port, () => {
  console.log(`chess-net server listening on http://127.0.0.1:${port}`);
  if (!isProduction) {
    console.log(`Open the board at ${clientDevUrl} (run: npm run dev)`);
  }
});

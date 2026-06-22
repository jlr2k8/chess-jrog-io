import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getComputerMove } from "./engine.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 3001);
const isProduction = process.env.NODE_ENV === "production";
const clientDist = path.resolve(__dirname, "../../client/dist");
const clientIndex = path.join(clientDist, "index.html");
const hasClientBuild = fs.existsSync(clientIndex);
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

if (isProduction || hasClientBuild) {
  app.use(express.static(clientDist));
  app.get(/.*/, (_req, res) => {
    res.sendFile(clientIndex);
  });
} else {
  app.get("/", (_req, res) => {
    res.type("html").send(`<!doctype html>
<html lang="en">
  <head><meta charset="UTF-8"><title>chess.jrog.io</title></head>
  <body style="font-family: system-ui, sans-serif; padding: 2rem;">
    <h1>Chess dev server</h1>
    <p>API is running on port ${port}. Build the client with <code>npm run build -w client</code>, or run <code>npm run dev</code> from the repo root.</p>
    <p>Hot reload UI: <a href="${clientDevUrl}">${clientDevUrl}</a></p>
  </body>
</html>`);
  });
}

app.listen(port, host, () => {
  const localUrl = `http://127.0.0.1:${port}`;
  console.log(`chess-net server listening on ${localUrl}`);
  if (isProduction || hasClientBuild) {
    console.log(`Open the board at ${localUrl}`);
  } else {
    console.log(`Dev UI: ${clientDevUrl} (npm run dev from repo root)`);
  }
});
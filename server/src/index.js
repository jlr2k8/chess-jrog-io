import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 3001);
const isProduction = process.env.NODE_ENV === "production";
const clientIndex = path.join(path.resolve(__dirname, "../../client/dist"), "index.html");
const hasClientBuild = fs.existsSync(clientIndex);
const clientDevUrl = process.env.CLIENT_DEV_URL || "http://127.0.0.1:5173";

const app = createApp();

app.listen(port, host, () => {
  const localUrl = `http://127.0.0.1:${port}`;
  console.log(`chess-net server listening on ${localUrl}`);
  if (isProduction || hasClientBuild) {
    console.log(`Open the board at ${localUrl}`);
  } else {
    console.log(`Dev UI: ${clientDevUrl} (npm run dev from repo root)`);
  }
});

# chess.jrog.io

Play chess against the computer — React board + Node/Stockfish on App Runner.

## Quick start (local)

```bash
cd ~/chess-jrog-io
npm install
npm run dev
```

- **Board UI:** http://127.0.0.1:5173
- **API:** http://127.0.0.1:3001/api/health

Use `npm run dev` — it starts both the Vite client and Express API. Port 3001 alone is API-only; visiting it redirects to the Vite dev server.

Production-like local run:

```bash
npm run build
NODE_ENV=production PORT=3001 npm start
# → http://127.0.0.1:3001
```

## Deploy

Manual (bootstrap):

```bash
export STACK_NAME=chess-jrog-io DOMAIN_NAME=chess.jrog.io \
  HOSTED_ZONE_ID=Z3FQ1J6D2XJRDT ECR_REPOSITORY_NAME=chess-jrog-io
./scripts/deploy.sh
./scripts/ensure-custom-domain.sh
```

CI/CD (push to `main` → build → ECR → App Runner):

```bash
./scripts/deploy-pipeline.sh
```

Requires GitHub repo `jlr2k8/chess-jrog-io` with `main` branch. Uses the same GitHub token secret as chat (`chat-jrog-io/github-token`).

## Roadmap

1. Board + computer opponent (Stockfish in prod, heuristic fallback locally)
2. Difficulty / think time
3. CI/CD pipeline

# chess.jrog.io

Play chess against the computer — React board + Node/Stockfish on App Runner.

## Quick start (local)

```bash
cd ~/chess-jrog-io
npm install
npm start
```

- **Full app:** http://localhost:3001 (builds client + serves board + API)
- On WSL, use `localhost:3001` from Windows — the server binds to all interfaces.

Hot reload during development:

```bash
npm run dev
# Board UI: http://localhost:5173  (API proxied to :3001)
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
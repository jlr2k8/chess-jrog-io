FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci

COPY client client/
RUN npm run build -w client

FROM node:22-bookworm-slim AS final
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends stockfish \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=8080

COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
COPY server server/
COPY --from=build /app/client/dist client/dist

RUN npm ci --omit=dev

EXPOSE 8080
CMD ["node", "server/src/index.js"]
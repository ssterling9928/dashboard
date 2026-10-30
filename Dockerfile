# Homelab dashboard: one image, one port.
# The Express backend serves the API and the built React frontend.
#
#   docker compose up -d --build   (from /opt on titan; see docker-compose.yml)

# ── Frontend build ────────────────────────────────────────
FROM node:22-alpine AS frontend
WORKDIR /app
COPY shared/ shared/
COPY frontend/package.json frontend/package-lock.json frontend/.npmrc frontend/
RUN cd frontend && npm ci
COPY frontend/ frontend/
# Built into the JavaScript, so it's a build argument, not a runtime setting.
# Optional: without it the Grafana buttons are hidden.
ARG VITE_GRAFANA_URL
RUN cd frontend && npm run build

# ── Backend build ─────────────────────────────────────────
FROM node:22-alpine AS backend
WORKDIR /app
COPY shared/ shared/
COPY backend/package.json backend/package-lock.json backend/.npmrc backend/
RUN cd backend && npm ci
COPY backend/ backend/
RUN cd backend && npm run build

# ── Runtime ───────────────────────────────────────────────
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=4000 \
    STATIC_DIR=/app/public \
    HISTORY_FILE=/data/history.json
WORKDIR /app/backend

COPY backend/package.json backend/package-lock.json backend/.npmrc ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=backend  /app/backend/dist  ./dist
COPY --from=frontend /app/frontend/dist /app/public

# Metric history is saved here (bind-mounted from the host in
# docker-compose.yml, which also sets the uid the folder must be owned by).
RUN mkdir /data && chown node:node /data

USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" || exit 1

# Settings come from the environment (compose's env_file), not backend.env.
CMD ["node", "dist/backend/src/server.js"]

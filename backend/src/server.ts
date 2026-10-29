import 'dotenv/config'
import express from "express";
import cors from "cors";
import path from "path";
import servicesRouter from "./routes/services.js"
import metricsRouter from "./routes/metrics.js"
import logsRouter from "./routes/logs.js"
import packagesRouter from "./routes/packages.js"
import statusRouter from "./routes/status.js"
import { UpstreamError } from "./lib/http.js"

const app = express();
const PORT = process.env.PORT || 4000;

// The code-server proxy forwards requests to this port with the
// "/proxy/<port>" prefix left on the path (mirrors frontend/vite.config.ts),
// so strip it before Express routes the request.
const PROXY_PREFIX = `/proxy/${PORT}`
app.use((req, _res, next) => {
  if (req.url === PROXY_PREFIX || req.url.startsWith(`${PROXY_PREFIX}/`)) {
    req.url = req.url.slice(PROXY_PREFIX.length) || '/'
  }
  next()
})

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/services', servicesRouter)
app.use('/api/metrics', metricsRouter)
app.use('/api/logs', logsRouter)
app.use('/api/packages', packagesRouter)
app.use('/api/status', statusRouter)

// In the Docker image the backend also serves the built frontend, so the
// dashboard is one container on one port. STATIC_DIR is unset in dev, where
// Vite serves the frontend.
const STATIC_DIR = process.env.STATIC_DIR
if (STATIC_DIR) {
  app.use(express.static(STATIC_DIR))
  app.get('/{*path}', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next()
    res.sendFile(path.resolve(STATIC_DIR, 'index.html'))
  })
}

app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof UpstreamError) {
    // Expected when a host is down; the message already says which and why
    console.error(`${req.method} ${req.originalUrl}: ${err.message}`)
    res.status(err.status).json({ error: err.message })
    return
  }
  console.error(err.stack)
  res.status(500).json({ error: err.message })
})

app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
});
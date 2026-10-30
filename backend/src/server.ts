import 'dotenv/config'
import express from "express";
import path from "path";
import servicesRouter from "./routes/services.js"
import metricsRouter, { saveMetricHistory } from "./routes/metrics.js"
import logsRouter from "./routes/logs.js"
import packagesRouter from "./routes/packages.js"
import statusRouter from "./routes/status.js"
import { UpstreamError } from "./lib/http.js"
import { MIN_SECRET_LENGTH, csrfGuard, proxySecretGuard, securityHeaders } from "./lib/requestGuards.js"

const app = express();
const PORT = process.env.PORT || 4000;
const PRODUCTION = process.env.NODE_ENV === 'production'

// The shared secret NPM adds to every request it forwards (see
// requestGuards.ts). Required in production, so the container fails to start
// rather than run without it. Dev has no NPM in front, so it's skipped there.
const PROXY_SECRET = process.env.PROXY_SECRET ?? ''
if (PRODUCTION && PROXY_SECRET.length < MIN_SECRET_LENGTH) {
  console.error(`PROXY_SECRET must be set to at least ${MIN_SECRET_LENGTH} characters in production (openssl rand -hex 32)`)
  process.exit(1)
}
const proxyEnforced = PROXY_SECRET.length > 0
if (!proxyEnforced) console.warn('PROXY_SECRET is not set: requests are not checked for the proxy secret (dev only)')
app.locals.proxyEnforced = proxyEnforced

app.disable('x-powered-by')

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

// No CORS: the frontend is served from the same origin (by this server in
// production, through Vite's proxy or code-server's in dev), so no other
// site is ever allowed to read the API or send it non-simple requests.
app.use(securityHeaders)
if (proxyEnforced) app.use(proxySecretGuard(PROXY_SECRET))
app.use(express.json());
app.use('/api', csrfGuard)

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

const server = app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
});

// `docker stop` and redeploys send SIGTERM (Ctrl+C sends SIGINT). Save the
// metric history before exiting. As PID 1 in the container, Node would
// otherwise ignore SIGTERM and be killed 10s later without saving.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, async () => {
    console.log(`${signal} received, saving metric history`)
    server.close()
    await saveMetricHistory()
    process.exit(0)
  })
}
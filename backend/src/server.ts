import 'dotenv/config'
import express from "express";
import cors from "cors";
import { synoRequest } from './lib/synology.js'
import servicesRouter from "./routes/services.js"
import metricsRouter from "./routes/metrics.js"
import logsRouter from "./routes/logs.js"
import packagesRouter from "./routes/packages.js"

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/services', servicesRouter)
app.use('/api/metrics', metricsRouter)
app.use('/api/logs', logsRouter)
app.use('/api/packages', packagesRouter)

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack)
  res.status(500).json({ error: err.message })
})

app.get('/api/debug', async (_req, res) => {
  try {
    const data = await synoRequest('SYNO.API.Info', 'query', 1, {
      query: 'all'
    })
    res.json(data)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
});
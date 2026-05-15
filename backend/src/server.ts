import 'dotenv/config'
import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/services", (_req, res) => {
  res.json([
    { id: "plex", name: "Plex", status: "healthy" },
    { id: "grafana", name: "Grafana", status: "healthy" }
  ]);
});

app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
});
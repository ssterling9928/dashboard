# Homelab Dashboard: frontend

The React single-page app for the [Homelab Dashboard](../README.md). It reads everything from the backend's `/api/*` endpoints; see the root README for the architecture, the API and how to run the whole thing.

**Stack:** React 19, TypeScript, Vite, Tailwind CSS 4, TanStack Query, Recharts, React Router, lucide-react.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server on :5173. `/api` is forwarded to the dev backend on :4000. |
| `npm run build` | Type-checks, then builds to `dist/`. The Docker image serves this from the backend. |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests (formatting, log collapsing, saved chart ranges, theme) |

From the repo root, `npm run dev` starts this and the backend together.

## Settings

Vite reads these from `frontend/.env` (gitignored). They're built into the JavaScript at build time, so they can't be changed when the container starts. None of them are needed for a plain local setup.

| Variable | Purpose |
|---|---|
| `VITE_BASE_PATH` | Path prefix when served behind a path-based proxy, e.g. `/proxy/5173` for code-server |
| `VITE_HMR_HOST` | Public hostname for hot reload behind that proxy |
| `VITE_API_URL` | Backend base URL, e.g. `/proxy/4000`. Unset means the same origin, which is right in the Docker image and with the dev proxy. |
| `VITE_GRAFANA_URL` | Grafana base URL for the "Open Grafana" and per-container "Logs" links. The Grafana button is hidden when unset. |

## Layout

```
src/
├── pages/Dashboard.tsx    # the one page: header, stat rows, tabs, sidebar
├── components/            # cards, tabs, charts, modals, badges, theme switch
├── hooks/                 # one TanStack Query hook per endpoint, plus theme and host selection
├── utils/                 # pure, unit-tested helpers
└── config/                # API base URL, sidebar quick links
```

Data shapes come from `shared/types.ts` (the `@shared` alias), which the backend uses too.

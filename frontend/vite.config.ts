
import path from 'path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // Set in .env when developing behind the code-server proxy
  // (e.g. VITE_BASE_PATH=/proxy/5173, VITE_HMR_HOST=code.home.sterling-dev.com).
  // Leave both unset for local dev — Vite falls back to normal root-path
  // serving and same-host HMR.
  const PREFIX = (env.VITE_BASE_PATH || '').replace(/\/$/, '')
  const BASE = PREFIX ? `${PREFIX}/` : '/'

  return {
    base: BASE,
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'strip-base',
        apply: 'serve',           // dev server only, not build
        configureServer({ middlewares }) {
          if (!PREFIX) return
          middlewares.use((req, _res, next) => {
            if (req.url && !req.url.startsWith(PREFIX)) {
              req.url = PREFIX + req.url
            }
            next()
          })
        },
      },
    ],
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      hmr: env.VITE_HMR_HOST
        ? {
            host: env.VITE_HMR_HOST,
            clientPort: 443,
            protocol: 'wss',
          }
        : undefined,
      // With no VITE_API_URL the frontend calls "/api/..." on its own origin
      // (as in the Docker image), so forward those to the dev backend
      proxy: {
        '/api': 'http://localhost:4000',
      },
    },
    resolve: {
      alias: {
        '@shared': path.resolve(__dirname, '../shared'),
      },
    },
  }
})

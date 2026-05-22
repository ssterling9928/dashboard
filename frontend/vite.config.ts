
import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const BASE = '/proxy/5173'

export default defineConfig({
  base: BASE + '/',
  plugins: [
    react(),
    {
      name: 'strip-base',
      apply: 'serve',           // dev server only, not build
      configureServer({ middlewares }) {
        middlewares.use((req, _res, next) => {
          if (req.url && !req.url.startsWith(BASE)) {
            req.url = BASE + req.url
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
    hmr: {
      host: "code.sterling-dev.com",
      clientPort: 443,
      protocol: 'wss',
    },
  },
  resolve: {
  alias: {
    '@shared': path.resolve(__dirname, '../shared'),
  },
},
})
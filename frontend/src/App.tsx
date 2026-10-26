
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Dashboard from './pages/Dashboard'

// Vite's BASE_URL is the `base` from vite.config.ts ("/proxy/5173/" behind
// the code-server proxy, "/" otherwise); the router wants it without the
// trailing slash.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'

export default function App() {
  return (
    <BrowserRouter basename={basename}>
      <div className="min-h-screen bg-[#f8f8f7] dark:bg-gray-950">
        <Routes>
          <Route path="/" element={<Dashboard />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Dashboard from './pages/Dashboard'

// Must match vite.config.ts's BASE default/override (VITE_BASE_PATH).
const basename = import.meta.env.VITE_BASE_PATH ?? '/proxy/5173'

export default function App() {
  return (
    <BrowserRouter basename={basename}>
      <div className="min-h-screen bg-[#f8f8f7]">
        <Routes>
          <Route path="/" element={<Dashboard />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
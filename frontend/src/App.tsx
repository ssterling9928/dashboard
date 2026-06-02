
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Dashboard from './pages/Dashboard'

export default function App() {
  return (
    <BrowserRouter basename="/proxy/5173">
      <div className="min-h-screen bg-[#f8f8f7]">
        <Routes>
          <Route path="/" element={<Dashboard />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
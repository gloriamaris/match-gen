import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import AppV2 from './components/v2/AppV2.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppV2 />} />
        <Route path="/v2" element={<AppV2 />} />
        <Route path="/v1" element={<App />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { initTheme } from './styles/theme-config.js'

// Initialize the active brand theme (defaults to Botanical Wellness)
initTheme();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

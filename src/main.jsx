import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { SettingsProvider } from './context/SettingsContext.jsx'
import { BonusGrantsProvider } from './context/BonusGrantsContext.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <SettingsProvider>
      <BonusGrantsProvider>
        <App />
      </BonusGrantsProvider>
    </SettingsProvider>
  </React.StrictMode>,
)

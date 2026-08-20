import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { i18nReady } from './i18n/config'
import './index.css'
import App from './App.tsx'

const root = createRoot(document.getElementById('root')!)

// Wait for the active language's translations to load before mounting — otherwise
// components that read arrays/objects via t(key, { returnObjects: true }) can crash on
// first paint (see src/i18n/config.ts).
void i18nReady.then(() => {
  root.render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  )
})

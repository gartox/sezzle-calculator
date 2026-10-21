import { StrictMode } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import './design/tokens.css'
import './index.css'
import App from './App.tsx'

const root = createRoot(document.getElementById('root')!)
// The first render commits synchronously, while this module runs and so
// before the load event, so the keyboard listener is in place for keys typed
// the moment the page appears.
flushSync(() => {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})

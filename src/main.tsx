import '@fontsource-variable/space-grotesk/index.css'
import '@fontsource-variable/manrope/index.css'
import '@fontsource-variable/jetbrains-mono/index.css'
import './styles.css'

import { attachConsole, error as logError } from '@tauri-apps/plugin-log'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import { RootErrorBoundary } from './app/error-boundary'
import { Providers } from './app/providers'
import { router } from './app/router'
import { isTauri } from './lib/tauri'

if (isTauri()) {
  void attachConsole()

  // Errors that escape React entirely (async callbacks, event handlers,
  // rejected promises with no `.catch`) never reach an error boundary — log
  // them so a crash still leaves a trace in the log file.
  window.addEventListener('error', (event) => {
    void logError(`window.onerror: ${event.message}`)
  })
  window.addEventListener('unhandledrejection', (event) => {
    void logError(`unhandledrejection: ${String(event.reason)}`)
  })
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <Providers>
        <RouterProvider router={router} />
      </Providers>
    </RootErrorBoundary>
  </React.StrictMode>,
)

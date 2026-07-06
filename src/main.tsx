import '@fontsource-variable/space-grotesk/index.css'
import '@fontsource-variable/manrope/index.css'
import '@fontsource-variable/jetbrains-mono/index.css'
import './styles.css'

import { attachConsole } from '@tauri-apps/plugin-log'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import { Providers } from './app/providers'
import { router } from './app/router'

if ('__TAURI_INTERNALS__' in window) void attachConsole()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </React.StrictMode>,
)

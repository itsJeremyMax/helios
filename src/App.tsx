import { invoke } from '@tauri-apps/api/core'
import { useState } from 'react'
import reactLogo from './assets/react.svg'

function App() {
  const [greetMsg, setGreetMsg] = useState('')
  const [name, setName] = useState('')

  async function greet() {
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    setGreetMsg(await invoke('greet', { name }))
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">
        Welcome to Tauri + React
      </h1>

      <div className="flex items-center justify-center gap-6">
        <a href="https://vite.dev" target="_blank" rel="noopener">
          <img
            src="/vite.svg"
            className="h-16 p-3 transition-[filter] duration-300 hover:drop-shadow-[0_0_1.5em_oklch(70%_0.15_260)]"
            alt="Vite logo"
          />
        </a>
        <a href="https://tauri.app" target="_blank" rel="noopener">
          <img
            src="/tauri.svg"
            className="h-16 p-3 transition-[filter] duration-300 hover:drop-shadow-[0_0_1.5em_var(--color-primary)]"
            alt="Tauri logo"
          />
        </a>
        <a href="https://react.dev" target="_blank" rel="noopener">
          <img
            src={reactLogo}
            className="h-16 p-3 transition-[filter] duration-300 hover:drop-shadow-[0_0_1.5em_oklch(75%_0.15_220)]"
            alt="React logo"
          />
        </a>
      </div>
      <p className="text-muted-foreground">
        Click on the Tauri, Vite, and React logos to learn more.
      </p>

      <form
        className="flex items-center justify-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          greet()
        }}
      >
        <input
          id="greet-input"
          onChange={(e) => setName(e.currentTarget.value)}
          placeholder="Enter a name..."
          className="rounded-lg border border-border bg-background px-4 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
        >
          Greet
        </button>
      </form>
      <p className="font-mono text-sm">{greetMsg}</p>
    </main>
  )
}

export default App

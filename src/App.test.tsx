import { mockIPC } from '@tauri-apps/api/mocks'
import { render, screen } from '@testing-library/react'
import App from './App'

it('renders and greets through mocked IPC', async () => {
  mockIPC((cmd, args) => {
    if (cmd === 'greet') return `Hello, ${(args as { name: string }).name}!`
  })
  render(<App />)
  expect(screen.getByRole('heading', { name: /tauri/i })).toBeInTheDocument()
})

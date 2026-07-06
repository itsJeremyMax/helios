import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { mockIPC } from '@tauri-apps/api/mocks'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'

// The updater's `Update` is a rid-backed `Resource` whose download/install and
// the subsequent relaunch round-trip through native channels — that lifecycle
// cannot be faithfully faked over raw `mockIPC`. So we mock the plugin modules
// directly, which lets us exercise the hook's full path (available →
// downloading → ready → relaunch) in jsdom. `mockIPC` is still used for the
// `app_info` command (and it sets `window.__TAURI_INTERNALS__`, so `isTauri()`
// reports true and the hook actually runs).
const { check, relaunch } = vi.hoisted(() => ({
  check: vi.fn(),
  relaunch: vi.fn(),
}))
vi.mock('@tauri-apps/plugin-updater', () => ({ check }))
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch }))

import { UpdateCard } from './update-card'

function renderCard() {
  mockIPC((cmd) => {
    if (cmd === 'app_info') return { version: '1.2.3', platform: 'macos' }
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <UpdateCard />
    </QueryClientProvider>,
  )
}

it('reports up to date when no update is available', async () => {
  check.mockResolvedValue(null)
  const user = userEvent.setup()
  renderCard()

  await user.click(
    await screen.findByRole('button', { name: /check for updates/i }),
  )

  expect(await screen.findByText(/up to date/i)).toBeInTheDocument()
})

it('downloads, installs and relaunches when an update is available', async () => {
  check.mockResolvedValue({
    version: '2.0.0',
    downloadAndInstall: async (
      onEvent: (e: {
        event: 'Started' | 'Progress' | 'Finished'
        data?: { contentLength?: number; chunkLength?: number }
      }) => void,
    ) => {
      onEvent({ event: 'Started', data: { contentLength: 100 } })
      onEvent({ event: 'Progress', data: { chunkLength: 50 } })
      onEvent({ event: 'Progress', data: { chunkLength: 50 } })
      onEvent({ event: 'Finished' })
    },
  })
  relaunch.mockResolvedValue(undefined)
  const user = userEvent.setup()
  renderCard()

  await user.click(
    await screen.findByRole('button', { name: /check for updates/i }),
  )

  expect(await screen.findByText(/2\.0\.0/)).toBeInTheDocument()
  await user.click(await screen.findByRole('button', { name: /install/i }))

  await waitFor(() => expect(relaunch).toHaveBeenCalledTimes(1))
})

it('surfaces an error when the check fails offline', async () => {
  check.mockRejectedValue(new Error('network error'))
  const user = userEvent.setup()
  renderCard()

  await user.click(
    await screen.findByRole('button', { name: /check for updates/i }),
  )

  expect(await screen.findByText(/couldn't check/i)).toBeInTheDocument()
  expect(
    await screen.findByRole('button', { name: /try again/i }),
  ).toBeInTheDocument()
})

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { mockIPC } from '@tauri-apps/api/mocks'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Settings } from '@/bindings'

// The launch check drives the shared `useUpdater` query, which round-trips
// through the native updater/process plugins — mock those directly (as the
// update-card test does) rather than over raw `mockIPC`. `isTauri` is mocked so
// each test can toggle the Tauri-only gating independently of `mockIPC`, which
// always sets `window.__TAURI_INTERNALS__`.
const { check, relaunch, toast, isTauri } = vi.hoisted(() => ({
  check: vi.fn(),
  relaunch: vi.fn(),
  toast: vi.fn(),
  isTauri: vi.fn(() => true),
}))
vi.mock('@tauri-apps/plugin-updater', () => ({ check }))
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch }))
vi.mock('sonner', () => ({ toast }))
vi.mock('@/lib/tauri', () => ({ isTauri }))

import { UpdateCard } from '@/features/updater'
import { applyTheme, LaunchUpdateCheck } from './providers'

const SETTINGS: Settings = {
  schemaVersion: 1,
  theme: 'system',
  checkUpdatesOnLaunch: true,
  launchAtStartup: false,
}

/** Stub `matchMedia` so `applyTheme` can be driven deterministically. */
function stubMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

beforeEach(() => {
  isTauri.mockReturnValue(true)
  document.documentElement.classList.remove('dark')
})

afterEach(() => {
  vi.clearAllMocks()
})

// --- applyTheme -----------------------------------------------------------

it('applyTheme("dark") adds the dark class regardless of OS preference', () => {
  stubMatchMedia(false)
  applyTheme('dark')
  expect(document.documentElement.classList.contains('dark')).toBe(true)
})

it('applyTheme("light") removes the dark class regardless of OS preference', () => {
  stubMatchMedia(true)
  document.documentElement.classList.add('dark')
  applyTheme('light')
  expect(document.documentElement.classList.contains('dark')).toBe(false)
})

it('applyTheme("system") follows matchMedia (dark when OS prefers dark)', () => {
  stubMatchMedia(true)
  applyTheme('system')
  expect(document.documentElement.classList.contains('dark')).toBe(true)
})

it('applyTheme("system") follows matchMedia (light when OS prefers light)', () => {
  stubMatchMedia(false)
  applyTheme('system')
  expect(document.documentElement.classList.contains('dark')).toBe(false)
})

// --- LaunchUpdateCheck gating --------------------------------------------

function renderLaunch(settings: Settings, node = <LaunchUpdateCheck />) {
  mockIPC((cmd) => {
    if (cmd === 'get_settings') return settings
    if (cmd === 'app_info') return { version: '1.2.3', platform: 'macos' }
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>)
}

it('does not check for updates when the opt-in is off', async () => {
  check.mockResolvedValue(null)
  renderLaunch({ ...SETTINGS, checkUpdatesOnLaunch: false })

  // Let the settings query settle so any (unwanted) check would have fired.
  await waitFor(() => expect(check).not.toHaveBeenCalled())
  expect(toast).not.toHaveBeenCalled()
})

it('does not check for updates outside a Tauri runtime', async () => {
  isTauri.mockReturnValue(false)
  check.mockResolvedValue({ version: '2.0.0' })
  renderLaunch(SETTINGS)

  await waitFor(() => expect(check).not.toHaveBeenCalled())
  expect(toast).not.toHaveBeenCalled()
})

it('checks once and toasts when opted in and an update is available', async () => {
  check.mockResolvedValue({ version: '2.0.0' })
  renderLaunch(SETTINGS)

  await waitFor(() => expect(toast).toHaveBeenCalledTimes(1))
  expect(check).toHaveBeenCalledTimes(1)
  expect(toast).toHaveBeenCalledWith(
    'An update is available',
    expect.objectContaining({
      description: expect.stringContaining('2.0.0'),
    }),
  )
})

it('stays silent when opted in but already up to date', async () => {
  check.mockResolvedValue(null)
  renderLaunch(SETTINGS)

  await waitFor(() => expect(check).toHaveBeenCalledTimes(1))
  expect(toast).not.toHaveBeenCalled()
})

// --- Shared updater state (launch check + card agree) ---------------------

it('the Settings card reads the launch check result without re-checking', async () => {
  check.mockResolvedValue({ version: '2.0.0' })
  renderLaunch(
    SETTINGS,
    <>
      <LaunchUpdateCheck />
      <UpdateCard />
    </>,
  )

  // The card shows the available update surfaced by the launch check…
  expect(await screen.findByText(/2\.0\.0/)).toBeInTheDocument()
  // …and the shared query means the check ran exactly once for both consumers.
  expect(check).toHaveBeenCalledTimes(1)
})

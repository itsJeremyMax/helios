import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { version as appVersion } from '../../package.json'
import { RootErrorBoundary } from './error-boundary'

// React logs the caught error to console.error (twice, in dev) — expected
// and noisy, so silence it and restore afterwards to keep test output clean.
let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  consoleError.mockRestore()
})

function Bomb(): never {
  throw new Error('kaboom')
}

it('renders the crash fallback with the error message when a child throws', () => {
  render(
    <RootErrorBoundary>
      <Bomb />
    </RootErrorBoundary>,
  )

  expect(
    screen.getByRole('heading', { name: /something went wrong/i }),
  ).toBeInTheDocument()
  expect(screen.getAllByText(/kaboom/i).length).toBeGreaterThan(0)
})

it('renders a Copy diagnostics button', () => {
  render(
    <RootErrorBoundary>
      <Bomb />
    </RootErrorBoundary>,
  )

  expect(
    screen.getByRole('button', { name: /copy diagnostics/i }),
  ).toBeInTheDocument()
})

it('renders a Restart button', () => {
  render(
    <RootErrorBoundary>
      <Bomb />
    </RootErrorBoundary>,
  )

  expect(
    screen.getByRole('button', { name: /restart app/i }),
  ).toBeInTheDocument()
})

it('copies message, stack, and app version to the clipboard', async () => {
  // `userEvent.setup()` installs its own clipboard stub on
  // `navigator.clipboard`, so spy on it only after setup runs — defining our
  // own stub beforehand just gets clobbered.
  const user = userEvent.setup()
  const writeText = vi
    .spyOn(navigator.clipboard, 'writeText')
    .mockResolvedValue(undefined)

  render(
    <RootErrorBoundary>
      <Bomb />
    </RootErrorBoundary>,
  )

  await user.click(screen.getByRole('button', { name: /copy diagnostics/i }))

  expect(writeText).toHaveBeenCalledTimes(1)
  const payload = JSON.parse(writeText.mock.calls[0][0] as string)
  expect(payload).toMatchObject({
    message: expect.stringContaining('kaboom'),
    version: appVersion,
  })
})

it('reloads the page when running outside Tauri and Restart is clicked', async () => {
  const reload = vi.fn()
  // jsdom's `location.reload` isn't configurable enough for `vi.spyOn`, so
  // swap the whole `location` object for one that is.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload },
  })
  const user = userEvent.setup()

  render(
    <RootErrorBoundary>
      <Bomb />
    </RootErrorBoundary>,
  )

  await user.click(screen.getByRole('button', { name: /restart app/i }))

  expect(reload).toHaveBeenCalled()
})

it('renders children normally when nothing throws', () => {
  render(
    <RootErrorBoundary>
      <div>all good</div>
    </RootErrorBoundary>,
  )

  expect(screen.getByText('all good')).toBeInTheDocument()
  expect(
    screen.queryByRole('heading', { name: /something went wrong/i }),
  ).not.toBeInTheDocument()
})

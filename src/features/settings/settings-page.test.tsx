import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { mockIPC } from '@tauri-apps/api/mocks'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Settings, SettingsPatch } from '@/bindings'
import { SettingsPage } from './settings-page'

type IpcCall = { cmd: string; args: Record<string, unknown> }

function renderSettings(initial: Settings) {
  const calls: IpcCall[] = []
  let current = initial

  // tauri-specta's generated `typedError` runtime wraps the raw invoke result
  // into `{ status, data }` itself, so the mock returns the plain payload.
  mockIPC((cmd, args) => {
    calls.push({ cmd, args: (args ?? {}) as Record<string, unknown> })
    if (cmd === 'get_settings') return current
    if (cmd === 'update_settings') {
      const patch = (args as { patch: SettingsPatch }).patch
      current = {
        ...current,
        ...(patch.theme != null ? { theme: patch.theme } : {}),
        ...(patch.checkUpdatesOnLaunch != null
          ? { checkUpdatesOnLaunch: patch.checkUpdatesOnLaunch }
          : {}),
        ...(patch.launchAtStartup != null
          ? { launchAtStartup: patch.launchAtStartup }
          : {}),
      }
      return current
    }
    if (cmd === 'reset_app_data') {
      current = {
        schemaVersion: 1,
        theme: 'system',
        checkUpdatesOnLaunch: true,
        launchAtStartup: false,
      }
      return current
    }
  })

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <SettingsPage />
    </QueryClientProvider>,
  )
  return { calls }
}

it('renders the persisted theme selection', async () => {
  renderSettings({
    schemaVersion: 1,
    theme: 'dark',
    checkUpdatesOnLaunch: true,
    launchAtStartup: false,
  })

  const themeControl = await screen.findByRole('button', { name: /theme/i })
  await waitFor(() => expect(themeControl).toHaveTextContent(/dark/i))
})

it('flipping the update switch calls update_settings with the patch', async () => {
  const user = userEvent.setup()
  const { calls } = renderSettings({
    schemaVersion: 1,
    theme: 'dark',
    checkUpdatesOnLaunch: true,
    launchAtStartup: false,
  })

  const toggle = await screen.findByRole('switch', {
    name: /check for updates/i,
  })
  expect(toggle).toBeChecked()

  await user.click(toggle)

  const update = calls.find((c) => c.cmd === 'update_settings')
  expect(update).toBeDefined()
  expect((update?.args as { patch: SettingsPatch }).patch).toMatchObject({
    checkUpdatesOnLaunch: false,
  })
})

it('reflects the persisted launch-at-startup state', async () => {
  renderSettings({
    schemaVersion: 1,
    theme: 'dark',
    checkUpdatesOnLaunch: true,
    launchAtStartup: true,
  })

  const toggle = await screen.findByRole('switch', {
    name: /launch at startup/i,
  })
  await waitFor(() => expect(toggle).toBeChecked())
})

it('flipping the launch-at-startup switch calls update_settings with the patch', async () => {
  const user = userEvent.setup()
  const { calls } = renderSettings({
    schemaVersion: 1,
    theme: 'dark',
    checkUpdatesOnLaunch: true,
    launchAtStartup: false,
  })

  const toggle = await screen.findByRole('switch', {
    name: /launch at startup/i,
  })
  expect(toggle).not.toBeChecked()

  await user.click(toggle)

  const update = calls.find(
    (c) =>
      c.cmd === 'update_settings' &&
      (c.args as { patch: SettingsPatch }).patch.launchAtStartup != null,
  )
  expect(update).toBeDefined()
  expect((update?.args as { patch: SettingsPatch }).patch).toMatchObject({
    launchAtStartup: true,
  })
  await waitFor(() => expect(toggle).toBeChecked())
})

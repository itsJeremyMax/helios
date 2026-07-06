import { mockIPC } from '@tauri-apps/api/mocks'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { tauriStoreStorage } from './storage'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

it('reads and writes through the plugin-store ipc', async () => {
  const data = new Map<string, unknown>()
  mockIPC((cmd, args) => {
    const a = args as Record<string, unknown>
    switch (cmd) {
      case 'plugin:store|load':
        return 0 // resource id (rid)
      case 'plugin:store|get':
        return [data.get(a.key as string) ?? null, data.has(a.key as string)]
      case 'plugin:store|set': {
        data.set(a.key as string, a.value)
        return null
      }
      case 'plugin:store|save':
        return null
      default:
        return null
    }
  })
  const storage = tauriStoreStorage('ui-state.json')
  await storage.setItem('foo', '{"count":1}')
  await vi.advanceTimersByTimeAsync(250) // wait out debounce
  expect(await storage.getItem('foo')).toBe('{"count":1}')
})

import { mockIPC } from '@tauri-apps/api/mocks'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { tauriStoreStorage } from './storage'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

/** Mocks the plugin-store IPC surface and reports how often save was invoked. */
function mockStoreIpc() {
  const data = new Map<string, unknown>()
  const counters = { saveCalls: 0 }
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
      case 'plugin:store|delete':
        return data.delete(a.key as string)
      case 'plugin:store|save': {
        counters.saveCalls += 1
        return null
      }
      default:
        return null
    }
  })
  return counters
}

it('reads and writes through the plugin-store ipc with a debounced save', async () => {
  const counters = mockStoreIpc()
  const storage = tauriStoreStorage('ui-state.json')

  await storage.setItem('foo', '{"count":1}')
  expect(counters.saveCalls).toBe(0) // save is debounced, not immediate

  await vi.advanceTimersByTimeAsync(250) // wait out debounce
  expect(counters.saveCalls).toBe(1)

  expect(await storage.getItem('foo')).toBe('{"count":1}')
})

it('coalesces rapid writes into a single save', async () => {
  const counters = mockStoreIpc()
  const storage = tauriStoreStorage('ui-state.json')

  await storage.setItem('foo', '{"count":1}')
  await vi.advanceTimersByTimeAsync(100) // still inside the 200ms window
  await storage.setItem('foo', '{"count":2}')
  expect(counters.saveCalls).toBe(0)

  await vi.advanceTimersByTimeAsync(250)
  expect(counters.saveCalls).toBe(1)
  expect(await storage.getItem('foo')).toBe('{"count":2}')
})

it('removeItem deletes the key and triggers a debounced save', async () => {
  const counters = mockStoreIpc()
  const storage = tauriStoreStorage('ui-state.json')

  await storage.setItem('foo', '{"count":1}')
  await vi.advanceTimersByTimeAsync(250)
  expect(counters.saveCalls).toBe(1)

  await storage.removeItem('foo')
  expect(counters.saveCalls).toBe(1) // delete's save is debounced too

  await vi.advanceTimersByTimeAsync(250)
  expect(counters.saveCalls).toBe(2)
  expect(await storage.getItem('foo')).toBeNull()
})

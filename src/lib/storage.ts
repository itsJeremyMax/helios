import { LazyStore } from '@tauri-apps/plugin-store'
import type { StateStorage } from 'zustand/middleware'

/**
 * Persistent client state adapter — use with zustand
 * `persist(…, { storage: createJSONStorage(() => tauriStoreStorage('ui-state.json')) })`.
 * Never use localStorage.
 */

const SAVE_DEBOUNCE_MS = 200

export function tauriStoreStorage(fileName: string): StateStorage {
  const store = new LazyStore(fileName)
  let saveTimer: ReturnType<typeof setTimeout> | undefined

  const scheduleSave = () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => void store.save(), SAVE_DEBOUNCE_MS)
  }

  return {
    getItem: async (name) => (await store.get<string>(name)) ?? null,
    setItem: async (name, value) => {
      await store.set(name, value)
      scheduleSave()
    },
    removeItem: async (name) => {
      await store.delete(name)
      scheduleSave()
    },
  }
}

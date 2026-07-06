import { invoke } from '@tauri-apps/api/core'

/**
 * Thin wrapper around Tauri's IPC bridge. Components must call through this
 * module — never `invoke` directly — so Task 9 can swap the internals for
 * generated bindings without touching a single component.
 */
export async function greet(name: string): Promise<string> {
  return invoke('greet', { name })
}

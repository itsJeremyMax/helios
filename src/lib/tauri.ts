/**
 * True when running inside the Tauri webview; false in the Vite dev server
 * (plain browser) and in tests (jsdom). Guard any `@tauri-apps/*` call that
 * isn't safe to invoke outside a real Tauri runtime with this.
 */
export function isTauri(): boolean {
  return '__TAURI_INTERNALS__' in window
}

import { commands } from '@/bindings'

/**
 * The single IPC entry point for the app. Components and hooks must call
 * through this module — never `invoke` directly — so the generated bindings
 * can evolve without touching call sites.
 */
export { commands }

/**
 * Stable React Query key factory for IPC-backed queries. Centralised so cache
 * invalidation stays consistent across features.
 */
export const queryKeys = {
  appInfo: ['app', 'info'] as const,
  settings: ['settings'] as const,
  updateCheck: ['updater', 'check'] as const,
}

/** Normalised error shape mirroring Rust's `AppError` (`{ kind, message }`). */
export interface IpcError {
  kind: string
  message: string
}

/**
 * Coerce an unknown thrown value into an {@link IpcError}. Bindings surface
 * backend errors as `{ kind, message }`; anything else is wrapped as unknown.
 */
export function normalizeIpcError(e: unknown): IpcError {
  if (e && typeof e === 'object' && 'kind' in e && 'message' in e) {
    return e as IpcError
  }
  return { kind: 'unknown', message: String(e) }
}

/** The Result-shaped value tauri-specta returns for fallible commands. */
export type IpcResult<T, E = IpcError> =
  | { status: 'ok'; data: T }
  | { status: 'error'; error: E }

/**
 * Unwrap a tauri-specta `Result`, returning the data on success and throwing a
 * normalised {@link IpcError} on failure. Use this to wrap fallible commands
 * (e.g. `unwrapResult(await commands.appInfo())`) so query functions can rely
 * on standard promise rejection semantics.
 */
export function unwrapResult<T>(result: IpcResult<T>): T {
  if (result.status === 'error') {
    throw normalizeIpcError(result.error)
  }
  return result.data
}

---
paths: ["src/**/*.{ts,tsx}"]
---

# Frontend conventions

## Three layers of state — pick the right one

| Kind of state | Where it lives | Tool |
| --- | --- | --- |
| Backend data (settings, app info) | React Query cache | `useQuery`/`useMutation` keyed by `queryKeys` from `@/lib/ipc` |
| Ephemeral UI (open/closed, input) | Component / Zustand store | `useState` or a plain Zustand store |
| Durable client prefs | Tauri store file | Zustand `persist` + `tauriStoreStorage(file)` from `@/lib/storage` |

Never use `localStorage` for durable state — it does not survive a packaged
app the way the Tauri store does.

## IPC only through `@/lib/ipc`

Import `commands`, `queryKeys`, `unwrapResult`, `normalizeIpcError` from
`@/lib/ipc`. Never import `invoke` or `@/bindings` directly in a component.
Fallible commands return a tauri-specta `Result`; unwrap them:
`unwrapResult(await commands.getSettings())`. Infallible commands (e.g.
`commands.greet(name)`) return the value directly — no unwrap. See
`features/settings/use-settings.ts` for the canonical Query hooks.

## Feature folders

Each feature is a self-contained folder under `src/features/<name>/` exposing a
public `index.ts`. Import features only through that barrel; no reaching into
another feature's internals. The route registry (`src/app/routes.tsx`) and
`app-shell.tsx` nav are the only cross-feature wiring.

## UI and styling

- shadcn components live in `src/shared/ui/` and are the building blocks — do
  not hand-roll primitives.
- Style with theme tokens only (`bg-background`, `text-foreground`,
  `text-primary`, `font-display`, …) defined in `src/styles.css` `@theme`.
  Never hardcode hex/oklch colors in components.
- ALWAYS invoke the `frontend-design:frontend-design` skill before building or
  reshaping UI. Fonts are bundled via `@fontsource-variable` (see `main.tsx`);
  never add system stacks or CDN font links.

## Tests

Colocate tests as `*.test.tsx` next to the code. Use `mockIPC` from
`@tauri-apps/api/mocks` with the SNAKE_CASE command name (`get_settings`, not
`getSettings`). tauri-specta's runtime wraps the raw result into
`{ status, data }`, so your mock returns the PLAIN payload (see
`features/settings/settings-page.test.tsx`). For plugin flows that round-trip
native resources (e.g. the updater), mock the plugin module with `vi.mock`
instead (see `features/updater/update-card.test.tsx`).

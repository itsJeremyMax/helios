# Recipe: crash reporting with Sentry

Helios's built-in crash handling (Rust panic hook + `RootErrorBoundary`) logs
to disk but doesn't report anywhere. This wires up Sentry on both sides
without replacing that existing handling — it reports *in addition to* the
local log.

## 1. Rust side

```bash
cd src-tauri
cargo add sentry --no-default-features --features panic,backtrace,contexts
```

In `src-tauri/src/lib.rs`, initialize Sentry at the very top of `run()`,
*before* the existing `std::panic::set_hook` call, and chain into the
existing hook rather than replacing it — the log-file hook must keep running
so local logs stay complete:

```rust
let _guard = sentry::init((
    std::env::var("SENTRY_DSN").ok(),
    sentry::ClientOptions {
        release: sentry::release_name!(),
        ..Default::default()
    },
));

let previous_hook = std::panic::take_hook();
std::panic::set_hook(Box::new(move |info| {
    let backtrace = std::backtrace::Backtrace::force_capture();
    log::error!("panic: {info}\n{backtrace}");
    previous_hook(info); // sentry's panic integration hooks in via `previous_hook`
}));
```

Set `SENTRY_DSN` as a build-time env var (GitHub Actions secret in
`release.yml`, alongside the existing `TAURI_SIGNING_*` secrets) so it's
baked into release builds but absent from local dev builds.

## 2. Frontend side

```bash
pnpm add @sentry/react
```

In `src/main.tsx`, initialize Sentry immediately after the existing
`attachConsole()` call, so both crash-reporting paths (local log +
Sentry) are live before any component renders:

```ts
import * as Sentry from '@sentry/react'

if (isTauri()) {
  void attachConsole()
  Sentry.init({ dsn: import.meta.env.VITE_SENTRY_DSN })
}
```

Add `VITE_SENTRY_DSN` alongside other Vite env vars (`.env.production`,
gitignored, injected at build time in CI).

## 3. Report from the error boundary

`RootErrorBoundary.componentDidCatch` (`src/app/error-boundary.tsx`) already
normalizes every caught error via `toCrashInfo` and logs it with
`logError` when `isTauri()`. Add a Sentry capture next to that call:

```ts
componentDidCatch(caught: unknown, info: ErrorInfo) {
  Sentry.captureException(caught, { extra: { componentStack: info.componentStack } })
  if (isTauri()) {
    const { message } = toCrashInfo(caught)
    void logError(`componentDidCatch: ${message}\n${info.componentStack ?? ''}`)
  }
}
```

Do the same in `RouteError` (same file) for errors that escape at the router
level rather than the root boundary.

## 4. Respect user privacy

Sentry should be opt-out, mirroring `checkUpdatesOnLaunch`: add a
`crashReportingEnabled` field to `Settings`
(`src-tauri/src/commands/settings.rs`), bump `CURRENT_SCHEMA_VERSION`, and
gate both the Rust and frontend `sentry::init`/`Sentry.init` calls on its
value (read once at launch is fine — a restart to apply an opt-out change is
an acceptable tradeoff and avoids needing to tear down/reinitialize the SDK
mid-session).

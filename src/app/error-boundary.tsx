import { error as logError } from '@tauri-apps/plugin-log'
import { relaunch } from '@tauri-apps/plugin-process'
import { ChevronRight, Sun } from 'lucide-react'
import { Component, type ErrorInfo, type PropsWithChildren } from 'react'
import { useRouteError } from 'react-router'
import { isTauri } from '@/lib/tauri'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '@/shared/ui/card'
import { version as appVersion } from '../../package.json'

interface CrashInfo {
  message: string
  stack?: string
}

/** Normalise anything a render can throw — `Error`, a react-router route
 * error response, or a stray string/object — into a displayable shape. */
function toCrashInfo(error: unknown): CrashInfo {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack }
  }
  if (error && typeof error === 'object' && 'statusText' in error) {
    const routeError = error as { status?: number; statusText?: string }
    return {
      message:
        `${routeError.status ?? ''} ${routeError.statusText ?? ''}`.trim(),
    }
  }
  return { message: String(error) }
}

async function copyDiagnostics(info: CrashInfo) {
  const payload = JSON.stringify(
    { message: info.message, stack: info.stack, version: appVersion },
    null,
    2,
  )
  await navigator.clipboard.writeText(payload)
}

async function restartApp() {
  if (isTauri()) {
    await relaunch()
    return
  }
  // No Tauri process to relaunch outside the real app shell (browser dev
  // server, tests) — a reload is the closest equivalent.
  window.location.reload()
}

/**
 * Shared crash UI for both the app-level `RootErrorBoundary` and route-level
 * `RouteError`. This fully replaces the viewport when it fires, so it's
 * written to read as "Helios hit a snag, here's how to recover" — calm and
 * on-brand — rather than a raw stack dump.
 */
export function CrashFallback({ error }: { error: unknown }) {
  const info = toCrashInfo(error)

  return (
    <div
      role="alert"
      className="flex h-screen w-screen items-center justify-center bg-background px-6 text-foreground"
    >
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-col items-center gap-3 text-center">
          {/* The mark: Helios's sun, briefly eclipsed. It comes back. */}
          <div className="relative flex size-14 items-center justify-center">
            <div
              className="absolute inset-0 rounded-full bg-primary/15 blur-xl"
              aria-hidden="true"
            />
            <Sun
              className="relative size-9 text-primary/70"
              aria-hidden="true"
            />
            <div
              className="absolute inset-0 rounded-full bg-card"
              style={{ clipPath: 'inset(0 0 0 45%)' }}
              aria-hidden="true"
            />
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Helios
            </p>
            <h1 className="mt-1 font-display text-xl font-semibold tracking-tight">
              Something went wrong
            </h1>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <p className="text-center text-sm text-muted-foreground">
            Helios hit a problem it couldn't recover from on its own. Your work
            isn't lost — restarting usually clears it.
          </p>

          <p className="rounded-lg border border-border bg-muted px-3 py-2 text-sm break-words">
            {info.message}
          </p>

          {info.stack && (
            <details className="group rounded-lg border border-border">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground select-none">
                <ChevronRight
                  className="size-3.5 transition-transform group-open:rotate-90"
                  aria-hidden="true"
                />
                Show details
              </summary>
              <pre className="max-h-48 overflow-auto border-t border-border bg-muted px-3 py-2 font-mono text-xs whitespace-pre-wrap text-muted-foreground">
                {info.stack}
              </pre>
            </details>
          )}
        </CardContent>

        <CardFooter className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.location.reload()}
          >
            Reload UI
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void copyDiagnostics(info)}
            >
              Copy diagnostics
            </Button>
            <Button size="sm" onClick={() => void restartApp()}>
              Restart app
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}

/** Route-level `errorElement` — handles errors thrown while rendering a
 * specific route (including react-router's own not-found/loader errors). */
export function RouteError() {
  const error = useRouteError()
  return <CrashFallback error={error} />
}

interface RootErrorBoundaryState {
  hasError: boolean
  error: unknown
}

/**
 * App-level safety net wrapping `<Providers>` in `main.tsx`. Catches render
 * errors that escape the router entirely (e.g. thrown from a context
 * provider) — route-level errors are handled by `RouteError` instead.
 */
export class RootErrorBoundary extends Component<
  PropsWithChildren,
  RootErrorBoundaryState
> {
  state: RootErrorBoundaryState = { hasError: false, error: null }

  static getDerivedStateFromError(error: unknown): RootErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(caught: Error, info: ErrorInfo) {
    if (isTauri()) {
      void logError(
        `componentDidCatch: ${caught.message}\n${info.componentStack ?? ''}`,
      )
    }
  }

  render() {
    if (this.state.hasError) {
      return <CrashFallback error={this.state.error} />
    }
    return this.props.children
  }
}

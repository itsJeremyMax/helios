import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { check } from '@tauri-apps/plugin-updater'
import { type PropsWithChildren, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { Theme } from '@/bindings'
import { useSettings } from '@/features/settings/use-settings'
import { isTauri } from '@/lib/tauri'
import { Toaster } from '@/shared/ui/sonner'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

const DARK_QUERY = '(prefers-color-scheme: dark)'

/**
 * Reflect the chosen theme onto the document root. `system` defers to the OS
 * preference; `light`/`dark` are explicit. The `dark` class drives the design
 * tokens, so toggling it re-themes the whole app in place.
 */
export function applyTheme(theme: Theme) {
  const prefersDark = window.matchMedia(DARK_QUERY).matches
  const dark = theme === 'dark' || (theme === 'system' && prefersDark)
  document.documentElement.classList.toggle('dark', dark)
}

/** Collapse the tri-state theme setting to the concrete appearance in effect. */
function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'dark') return 'dark'
  if (theme === 'light') return 'light'
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
}

/**
 * Keeps the document theme in sync with the persisted setting and, when the
 * setting is `system`, with live OS appearance changes. Renders nothing.
 */
function ThemeSync() {
  const { data } = useSettings()
  const theme = data?.theme ?? 'system'

  useEffect(() => {
    applyTheme(theme)
    const media = window.matchMedia(DARK_QUERY)
    const onChange = () => applyTheme(theme)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [theme])

  return null
}

/**
 * Toast host. We don't use `next-themes`, so we resolve the app's own theme
 * setting and hand sonner the concrete appearance directly.
 */
function AppToaster() {
  const { data } = useSettings()
  const theme = data?.theme ?? 'system'
  const [resolved, setResolved] = useState<'light' | 'dark'>(() =>
    resolveTheme(theme),
  )

  useEffect(() => {
    setResolved(resolveTheme(theme))
    const media = window.matchMedia(DARK_QUERY)
    const onChange = () => setResolved(resolveTheme(theme))
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [theme])

  return <Toaster theme={resolved} position="bottom-right" richColors />
}

/**
 * Fires a single silent update check on launch when the user has opted in,
 * surfacing a toast (not a modal) if a newer version exists. Failures — most
 * commonly being offline — are swallowed: a background check must never
 * interrupt startup. The manual card on the Settings page is where errors and
 * the install flow live.
 */
function LaunchUpdateCheck() {
  const { data } = useSettings()
  const fired = useRef(false)

  useEffect(() => {
    if (fired.current) return
    if (!data?.checkUpdatesOnLaunch || !isTauri()) return
    fired.current = true

    void (async () => {
      try {
        const update = await check()
        if (!update) return
        toast('An update is available', {
          description: `Version ${update.version} is ready to install.`,
          action: {
            label: 'View',
            onClick: () => {
              window.location.hash = '#/settings'
            },
          },
        })
      } catch {
        // Offline or endpoint unreachable — stay quiet on launch.
      }
    })()
  }, [data])

  return null
}

export function Providers({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeSync />
      <LaunchUpdateCheck />
      {children}
      <AppToaster />
    </QueryClientProvider>
  )
}

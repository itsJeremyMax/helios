import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type PropsWithChildren, useEffect } from 'react'
import type { Theme } from '@/bindings'
import { useSettings } from '@/features/settings/use-settings'

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

export function Providers({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeSync />
      {children}
    </QueryClientProvider>
  )
}

import { Home, Settings, Sun } from 'lucide-react'
import type { ComponentType } from 'react'
import { NavLink, Outlet } from 'react-router'
import { cn } from '@/lib/utils'

const NAV_ITEMS: Array<{
  to: string
  label: string
  icon: ComponentType<{ className?: string }>
  end?: boolean
}> = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function AppShell() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-muted/40">
        <div className="flex items-center gap-2 px-4 py-4">
          <Sun className="size-5 text-primary" aria-hidden="true" />
          <span className="font-display text-lg font-semibold tracking-tight">
            Helios
          </span>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 px-2" aria-label="Primary">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-lg border-l-2 border-transparent px-2.5 py-1.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'border-primary bg-background text-foreground'
                    : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
                )
              }
            >
              <Icon className="size-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-3 text-xs text-muted-foreground">v0.1.0</div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-8 py-10">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

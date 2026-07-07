---
name: adding-a-page
description: Adds a new page or screen as a self-contained feature folder wired into the router and nav. Use when adding a route, screen, view, or top-level navigation entry to the desktop app.
---

# Adding a page

Pages are features. Build the folder, then wire it in at the two integration
points (route registry + nav) — nothing else should import your feature's
internals.

## Checklist

1. **Create the feature folder** `src/features/<name>/` with:
   - `<name>-page.tsx` exporting a `XxxPage` component.
   - `index.ts` re-exporting it: `export { XxxPage } from './<name>-page'`.
   - Colocated hooks (`use-<name>.ts`) for any Query/IPC logic.

2. **Register the route** in `src/app/routes.tsx` — the ONLY integration point
   for pages. Add a child of the `AppShell` route:

   ```tsx
   { path: 'reports', element: <ReportsPage /> },
   ```

   Import via the feature barrel: `import { ReportsPage } from '@/features/reports'`.

3. **Add nav** (only if top-level): append to `NAV_ITEMS` in
   `src/app/layouts/app-shell.tsx` with a `lucide-react` icon:

   ```tsx
   { to: '/reports', label: 'Reports', icon: FileText },
   ```

4. **Route test**: colocate `<name>-page.test.tsx` rendering through
   `createMemoryRouter(routes, { initialEntries: ['/reports'] })` wrapped in a
   `QueryClientProvider`, and assert the page renders (see
   `features/home/home-page.test.tsx`). Mock any IPC with `mockIPC` (snake_case
   command names, plain payloads).

5. **UI**: invoke the `frontend-design:frontend-design` skill. Compose from
   `src/shared/ui/` primitives and style with `@theme` tokens
   (`bg-background`, `text-muted-foreground`, `font-display`, …) — never
   hardcoded colors. Data flows through `@/lib/ipc` Query hooks, not direct
   `invoke`.

6. **Gate**: `pnpm check:all`.

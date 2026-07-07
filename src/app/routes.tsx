import type { RouteObject } from 'react-router'
import { HomePage } from '@/features/home'
import { SettingsPage } from '@/features/settings'
import { RouteError } from './error-boundary'
import { AppShell } from './layouts/app-shell'

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
]

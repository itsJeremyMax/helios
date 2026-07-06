import { mockIPC } from '@tauri-apps/api/mocks'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { routes } from '@/app/routes'

it('renders home page at /', async () => {
  mockIPC((cmd, args) => {
    if (cmd === 'greet') return `Hello, ${(args as { name: string }).name}!`
  })
  const router = createMemoryRouter(routes, { initialEntries: ['/'] })
  render(<RouterProvider router={router} />)
  expect(
    await screen.findByRole('heading', { name: /helios/i }),
  ).toBeInTheDocument()
})

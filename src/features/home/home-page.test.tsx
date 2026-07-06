import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { mockIPC } from '@tauri-apps/api/mocks'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { routes } from '@/app/routes'

function renderApp() {
  mockIPC((cmd, args) => {
    if (cmd === 'greet') return `Hello, ${(args as { name: string }).name}!`
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const router = createMemoryRouter(routes, { initialEntries: ['/'] })
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

it('renders home page at /', async () => {
  renderApp()
  expect(
    await screen.findByRole('heading', { name: /helios/i }),
  ).toBeInTheDocument()
})

it('greets through the ipc bindings', async () => {
  const user = userEvent.setup()
  renderApp()

  await user.type(await screen.findByLabelText(/your name/i), 'Ada')
  await user.click(screen.getByRole('button', { name: /send greeting/i }))

  expect(await screen.findByText(/hello, ada!/i)).toBeInTheDocument()
})

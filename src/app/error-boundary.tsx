import { useRouteError } from 'react-router'

// Stub error boundary — replaced with real error UI in Task 13.
export function RouteError() {
  const error = useRouteError()
  return <div role="alert">Something went wrong: {String(error)}</div>
}

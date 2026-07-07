import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { commands } from '@/lib/ipc'
import { Button } from '@/shared/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/ui/card'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'

export function HomePage() {
  const [name, setName] = useState('')
  const greeting = useMutation({
    mutationFn: (value: string) => commands.greet(value),
  })

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    greeting.mutate(name)
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Helios
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A quiet control room for the work you do every day.
        </p>
      </div>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Connection check</CardTitle>
          <CardDescription>
            Confirm the Rust core is listening before you build on it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="greet-input">Your name</Label>
              <Input
                id="greet-input"
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                placeholder="Ada Lovelace"
              />
            </div>
            <Button type="submit" className="self-start">
              Send greeting
            </Button>
          </form>
          {greeting.data && (
            <p className="mt-4 font-mono text-sm text-muted-foreground">
              {greeting.data}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

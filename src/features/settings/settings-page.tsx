import { Check, ChevronsUpDown, Monitor, Moon, Sun } from 'lucide-react'
import type { ComponentType } from 'react'
import { useState } from 'react'
import { toast } from 'sonner'
import type { Theme } from '@/bindings'
import { UpdateCard } from '@/features/updater'
import { Button } from '@/shared/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/ui/card'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { Label } from '@/shared/ui/label'
import { Switch } from '@/shared/ui/switch'
import { useResetAppData, useSettings, useUpdateSettings } from './use-settings'

const THEME_OPTIONS: Array<{
  value: Theme
  label: string
  icon: ComponentType<{ className?: string }>
}> = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
]

export function SettingsPage() {
  const { data: settings, isPending } = useSettings()
  const updateSettings = useUpdateSettings()
  const resetAppData = useResetAppData()
  const [confirmOpen, setConfirmOpen] = useState(false)

  const theme = settings?.theme ?? 'system'
  const checkUpdates = settings?.checkUpdatesOnLaunch ?? true
  const launchAtStartup = settings?.launchAtStartup ?? false
  const activeTheme =
    THEME_OPTIONS.find((option) => option.value === theme) ?? THEME_OPTIONS[0]

  function handleReset() {
    resetAppData.mutate(undefined, { onSuccess: () => setConfirmOpen(false) })
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tune how Helios looks and keeps itself up to date.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Choose a theme, or follow your operating system.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <Label id="theme-label">Theme</Label>
              <span className="text-sm text-muted-foreground">
                Applied instantly across the app.
              </span>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  aria-labelledby="theme-label"
                  disabled={isPending}
                  className="w-32 justify-between"
                >
                  <span className="flex items-center gap-1.5">
                    <activeTheme.icon className="size-3.5" />
                    {activeTheme.label}
                  </span>
                  <ChevronsUpDown className="size-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-32">
                <DropdownMenuRadioGroup
                  value={theme}
                  onValueChange={(value) =>
                    updateSettings.mutate({
                      theme: value as Theme,
                      checkUpdatesOnLaunch: null,
                      launchAtStartup: null,
                    })
                  }
                >
                  {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
                    <DropdownMenuRadioItem key={value} value={value}>
                      <Icon className="size-3.5" />
                      {label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Updates</CardTitle>
          <CardDescription>
            Control how Helios checks for new releases.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <Label
              htmlFor="check-updates"
              className="flex flex-col items-start gap-0.5"
            >
              <span>Check for updates on launch</span>
              <span className="font-normal text-muted-foreground">
                Look for a newer version each time the app starts.
              </span>
            </Label>
            <Switch
              id="check-updates"
              checked={checkUpdates}
              disabled={isPending}
              onCheckedChange={(next) =>
                updateSettings.mutate({
                  theme: null,
                  checkUpdatesOnLaunch: next,
                  launchAtStartup: null,
                })
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Startup</CardTitle>
          <CardDescription>
            Control what Helios does when you sign in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <Label
              htmlFor="launch-at-startup"
              className="flex flex-col items-start gap-0.5"
            >
              <span>Launch at startup</span>
              <span className="font-normal text-muted-foreground">
                Open Helios automatically when you log in to your computer.
              </span>
            </Label>
            <Switch
              id="launch-at-startup"
              checked={launchAtStartup}
              disabled={isPending}
              onCheckedChange={(next) =>
                updateSettings.mutate(
                  {
                    theme: null,
                    checkUpdatesOnLaunch: null,
                    launchAtStartup: next,
                  },
                  {
                    onError: () =>
                      toast.error("Couldn't change launch-at-startup", {
                        description:
                          'The system login item could not be updated.',
                      }),
                  },
                )
              }
            />
          </div>
        </CardContent>
      </Card>

      <UpdateCard />

      <Card className="ring-destructive/20">
        <CardHeader>
          <CardTitle className="text-destructive">Danger zone</CardTitle>
          <CardDescription>
            Reset every preference back to its default.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">Reset app data</span>
              <span className="text-sm text-muted-foreground">
                This can't be undone.
              </span>
            </div>
            <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
              Reset app data
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset app data?</DialogTitle>
            <DialogDescription>
              Your theme and update preferences will return to their defaults.
              This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={handleReset}
              disabled={resetAppData.isPending}
            >
              <Check className="size-3.5" />
              Reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

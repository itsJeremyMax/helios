import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Settings, SettingsPatch } from '@/bindings'
import { commands, queryKeys, unwrapResult } from '@/lib/ipc'

/** Read the persisted settings, migrating any older on-disk shape on first read. */
export function useSettings() {
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: async () => unwrapResult(await commands.getSettings()),
  })
}

/**
 * Apply a partial settings update. The command returns the full, persisted
 * settings, which we write straight into the cache so the UI reflects the
 * saved state without a refetch.
 */
export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patch: SettingsPatch) =>
      unwrapResult(await commands.updateSettings(patch)),
    onSuccess: (settings: Settings) =>
      qc.setQueryData(queryKeys.settings, settings),
  })
}

/** Restore all settings to their defaults, discarding stored preferences. */
export function useResetAppData() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => unwrapResult(await commands.resetAppData()),
    onSuccess: (settings: Settings) =>
      qc.setQueryData(queryKeys.settings, settings),
  })
}

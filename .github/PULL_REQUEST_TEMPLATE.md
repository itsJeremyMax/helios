## Summary

<!-- What does this change do, and why? -->

---

**Reminder:** this repo squash-merges PRs, and the PR title becomes the
squashed commit message. Your title must be a valid
[Conventional Commit](./CONTRIBUTING.md#commit-messages) (e.g. `feat: add
dark mode toggle`, `fix: prevent duplicate update toasts`) — it directly
drives what release-please ships next.

## Checklist

- [ ] `pnpm check:all` passes locally
- [ ] If this changes IPC surface area (new/changed commands or plugins), the
      relevant `src-tauri/capabilities/*.json` file was audited and updated
- [ ] If this changes any `#[tauri::command]` signature, `src/bindings.ts` was
      regenerated (`pnpm test:rust`) and committed

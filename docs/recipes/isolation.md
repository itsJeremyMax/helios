# Recipe: enabling the isolation security pattern

Tauri's [isolation pattern](https://v2.tauri.app/concept/inter-process-communication/isolation/)
runs an intermediary, sandboxed `<iframe>` between the webview and the IPC
layer, so a compromised frontend (e.g. via a supply-chain-poisoned npm
dependency) can't forge arbitrary IPC calls without going through code you
control. Helios currently uses the default (`brownfield`) pattern —
`src-tauri/tauri.conf.json`'s `app.security` block has a strict CSP but no
`pattern` key. This is worth adding once the app embeds any remote or
third-party content, or as defense-in-depth for a security-sensitive
distribution.

## 1. Create the isolation application

It's a second, minimal frontend — no framework needed, just a script that
validates/passes through IPC payloads:

```
src-tauri/isolation-src/
  index.html
  index.ts
```

`index.ts` implements the isolation hook Tauri expects:

```ts
import { defineIsolation } from '@tauri-apps/api/isolation'

defineIsolation((payload) => {
  // Inspect/validate `payload.cmd` and `payload.payload` here before
  // returning it — this is the enforcement point.
  return payload
})
```

## 2. Build it to its own dist directory

Add a second Vite config (`vite.isolation.config.ts`) targeting
`dist-isolation/`, mirroring the existing `vite.config.ts` but with
`isolation-src/index.html` as the entry and no Tailwind/React plugins (the
isolation app should be as small and dependency-free as possible — every line
in it is inside the trust boundary).

## 3. Point `tauri.conf.json` at it

```jsonc
{
  "app": {
    "security": {
      "pattern": {
        "use": "isolation",
        "options": { "dir": "../dist-isolation" }
      }
      // existing csp block stays as-is
    }
  }
}
```

## 4. Wire the build

Add an `isolation:build` script (`vite build --config vite.isolation.config.ts`)
and run it as part of `beforeBuildCommand` alongside the existing `pnpm build`
(a small `&&`-chained script, since `tauri.conf.json`'s `beforeBuildCommand`
only takes one command).

## 5. Verify

`pnpm tauri dev` — the isolation pattern applies in both dev and production
once configured. Open devtools; IPC calls should now show as routed through
the isolation iframe's origin rather than directly from the main window.

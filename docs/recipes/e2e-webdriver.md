# Recipe: end-to-end tests with WebdriverIO

Vitest covers unit/component tests today (`pnpm test`). For true end-to-end
tests driving the actual compiled app window, use WebdriverIO with
[`@wdio/tauri-service`](https://github.com/tauri-apps/tauri-service), which
wraps `tauri-driver` for you.

> **macOS note:** `tauri-driver` itself only speaks WebKitGTK's WebDriver
> protocol natively on Linux/Windows. `@wdio/tauri-service` adds macOS support
> by driving the app through `safaridriver` instead — install Safari's
> WebDriver support (`safaridriver --enable`, one-time, needs sudo) and keep
> Safari's "Allow Remote Automation" developer setting on.

## 1. Install

```bash
pnpm add -D webdriverio @wdio/cli @wdio/tauri-service @wdio/mocha-framework @wdio/local-runner
```

On Linux CI runners you also need `tauri-driver`:

```bash
cargo install tauri-driver --locked
```

## 2. Build the release binary the tests will drive

WebdriverIO drives a real compiled binary, not the dev server:

```bash
pnpm tauri build --debug
```

## 3. Configure WebdriverIO

Create `wdio.conf.mts` at the repo root:

```ts
export const config: WebdriverIO.Config = {
  specs: ['./e2e/**/*.spec.ts'],
  services: [
    [
      'tauri',
      {
        tauriDriverPath: undefined, // resolved from PATH; explicit on CI
        application: './src-tauri/target/debug/helios',
      },
    ],
  ],
  framework: 'mocha',
}
```

Point `application` at whatever `productName` (`src-tauri/tauri.conf.json`)
resolves to on the current platform — `helios` on Linux/macOS, `helios.exe`
on Windows.

## 4. Write a spec

```ts
// e2e/settings.spec.ts
import { expect, browser } from '@wdio/globals'

it('navigates to settings', async () => {
  await browser.$('a[href="#/settings"]').click()
  await expect(browser.$('h1')).toHaveText('Settings')
})
```

Because the app uses a hash router (`createHashRouter` in
`src/app/router.tsx`), navigation asserts against `#/...` fragments, not
server-rendered paths.

## 5. Run

```bash
pnpm wdio run wdio.conf.mts
```

## CI

Add a dedicated job (don't fold into `ci.yml`'s fast unit-test job) that
builds a debug binary per OS and runs the WDIO suite — this is
build-artifact-heavy and slower than the unit test suite, so it belongs on a
separate, possibly `workflow_dispatch`-gated, workflow.

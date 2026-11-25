# AGENTS.md

This file is the working guide for Codex agents entering this repository.

It is intentionally practical. Read this first when you need to understand:

- what this app does
- where each feature lives
- how Electron, React, and browser extensions are wired together
- how to make safe changes without breaking release/build flows

---

## 1. Project Identity

Repository name in practice: `One Punch DevKit`

This is an internal Electron desktop tool built with:

- Electron
- React
- TypeScript
- Vite
- Tailwind CSS

Primary use cases:

- Matrix simulation / cheat-matrix authoring and execution
- Animation config generation
- Sound config generation
- Config usage checking
- Asset cleanup scanning
- Code health / lint / TS diagnostics
- Spine preview and inspection
- Google Drive asset sync
- Internal browser extension export / debug tooling

The app is not a generic starter project. It is a workflow-heavy internal tool with productized UI and several domain-specific flows.

---

## 2. High-Level Architecture

There are 4 main layers:

1. Renderer app
   - React UI in `src/`
   - Main shell and sidebar in [src/App.tsx](/Users/fe-tienhuynh/Documents/super-app/src/App.tsx)

2. Electron main process
   - Window lifecycle, IPC handlers, external link logic
   - Entry point: [electron/main.ts](/Users/fe-tienhuynh/Documents/super-app/electron/main.ts)

3. Electron preload bridge
   - Safe APIs exposed to renderer through `window.electronAPI`
   - File: [electron/preload.ts](/Users/fe-tienhuynh/Documents/super-app/electron/preload.ts)
   - Types mirrored in [src/types/electron.d.ts](/Users/fe-tienhuynh/Documents/super-app/src/types/electron.d.ts)

4. Browser extensions
   - `one-punch-devkit-extension/`: main assistant extension
   - `bunny-extension/`: lighter debug-oriented sibling extension
   - These are not part of the web build, but are shipped/exported alongside the desktop app

Important mindset:

- The renderer should not do privileged filesystem/process work directly.
- File scanning, local socket, and sync logic usually belong to Electron handlers.
- UI state and UX behavior mostly live in React components.

---

## 3. Main App Navigation

Tabs are configured in [src/App.tsx](/Users/fe-tienhuynh/Documents/super-app/src/App.tsx).

Current menu grouping:

- Data
  - `Matrix Hub`
- Generators
  - `Anim Generator`
  - `Sound Generator`
- Analysis
  - `Usage Check`
  - `Asset Cleanup`
  - `Code Health`
- Tools
  - `Spine Viewer`
  - `Drive Synchronizer`

Settings is also part of the app shell, but is not shown like a normal tab in grouped content.

When changing app navigation:

- update tab labels in `src/App.tsx`
- keep header copy consistent with the page component title
- check settings interactions if menu grouping/order/visibility changes

---

## 4. Core Renderer Components

Main feature components live in [src/components](/Users/fe-tienhuynh/Documents/super-app/src/components).

Most important files:

- [src/components/CheatConsole.tsx](/Users/fe-tienhuynh/Documents/super-app/src/components/CheatConsole.tsx)
  - Largest and most complex UI
  - Matrix Hub / cheat matrix authoring
  - Includes local socket status, matrix detail flow, matrix sync API UI, import/publish behavior

- [src/components/CreateAnimConfigs.tsx](/Users/fe-tienhuynh/Documents/super-app/src/components/CreateAnimConfigs.tsx)
  - Scans Spine folders and creates animation config files
  - Integrates alias selection
  - Has logic for exclude list and code health follow-up prompt

- [src/components/CreateSoundConfigs.tsx](/Users/fe-tienhuynh/Documents/super-app/src/components/CreateSoundConfigs.tsx)
  - Scans sound directories and creates sound config files
  - Uses shared settings-driven exclude list

- [src/components/CheckConfigs.tsx](/Users/fe-tienhuynh/Documents/super-app/src/components/CheckConfigs.tsx)
  - Usage Check UI
  - Supports `AnimConfig`-specific summary logic for anim teams

- [src/components/CheckAssets.tsx](/Users/fe-tienhuynh/Documents/super-app/src/components/CheckAssets.tsx)
  - Scans asset references
  - Displays categorized unused assets

- [src/components/CodeHealth.tsx](/Users/fe-tienhuynh/Documents/super-app/src/components/CodeHealth.tsx)
  - Combines ESLint and TypeScript diagnostics into UI sections and score summary

- [src/components/SpinePreview.tsx](/Users/fe-tienhuynh/Documents/super-app/src/components/SpinePreview.tsx)
  - Preview for Spine assets
  - Uses custom local asset scheme registered in Electron

- [src/components/DriveSyncMenu.tsx](/Users/fe-tienhuynh/Documents/super-app/src/components/DriveSyncMenu.tsx)
  - Drive sync UI
  - Uses backend sync plan + per-file download flow

- [src/components/SettingsPanel.tsx](/Users/fe-tienhuynh/Documents/super-app/src/components/SettingsPanel.tsx)
  - Shared path aliases
  - Extension download section
  - Menu group order / visibility
  - Generator exclude-list settings

Supporting UI pieces:

- [src/components/ActionPromptModal.tsx](/Users/fe-tienhuynh/Documents/super-app/src/components/ActionPromptModal.tsx)
- [src/components/SpinePreviewModal.tsx](/Users/fe-tienhuynh/Documents/super-app/src/components/SpinePreviewModal.tsx)
- [src/components/loading/ChargeUpLoadingScreen.tsx](/Users/fe-tienhuynh/Documents/super-app/src/components/loading/ChargeUpLoadingScreen.tsx)

---

## 5. Electron Main Process

Main process entry:

- [electron/main.ts](/Users/fe-tienhuynh/Documents/super-app/electron/main.ts)

Responsibilities:

- create and restore app window
- window sizing behavior
- open external links in default browser
- expose file/folder pickers through IPC
- register all handler modules
- register custom `spine-asset://` protocol for local asset loading

Important details:

- macOS activate behavior is implemented so clicking the app icon reopens the window if hidden/minimized
- external links must open outside the app, not in a popup BrowserWindow
- local Spine assets use a privileged custom protocol because `fetch()` does not work reliably with `file://`

If you change file loading in Spine Viewer, check both:

- `electron/main.ts`
- renderer-side preview code in `SpinePreview`

---

## 6. Electron Handlers

Handlers live in [electron/handlers](/Users/fe-tienhuynh/Documents/super-app/electron/handlers).

Important handler map:

- [electron/handlers/createAnim.ts](/Users/fe-tienhuynh/Documents/super-app/electron/handlers/createAnim.ts)
  - Generates `*_ANIM` and `*_TIME` exports from Spine JSON
  - Preserves local-only keys when overwrite mode is enabled

- [electron/handlers/createSound.ts](/Users/fe-tienhuynh/Documents/super-app/electron/handlers/createSound.ts)
  - Generates sound config output from audio folders

- [electron/handlers/checkConfig.ts](/Users/fe-tienhuynh/Documents/super-app/electron/handlers/checkConfig.ts)
  - Usage-check engine
  - Knows about direct key usage and some dynamic key patterns
  - Has special `AnimConfig` summary logic mapping spine JSON names back to config objects

- [electron/handlers/checkAssets.ts](/Users/fe-tienhuynh/Documents/super-app/electron/handlers/checkAssets.ts)
  - Asset reference scanning logic

- [electron/handlers/codeHealth.ts](/Users/fe-tienhuynh/Documents/super-app/electron/handlers/codeHealth.ts)
  - Aggregates ESLint + TypeScript scans
  - High-impact file for diagnostics features

- [electron/handlers/spinePreview.ts](/Users/fe-tienhuynh/Documents/super-app/electron/handlers/spinePreview.ts)
  - Parses local spine-related metadata for renderer preview UI

- [electron/handlers/cheatLocalSocket.ts](/Users/fe-tienhuynh/Documents/super-app/electron/handlers/cheatLocalSocket.ts)
  - Local WebSocket server for Matrix Hub integration with the extension
  - Used for sequential autoplay/event bridging flows

- [electron/handlers/exportCheatExtension.ts](/Users/fe-tienhuynh/Documents/super-app/electron/handlers/exportCheatExtension.ts)
  - Packages/export extension assets for user download

- [electron/handlers/bindSoundRefs.ts](/Users/fe-tienhuynh/Documents/super-app/electron/handlers/bindSoundRefs.ts)
  - Sound reference binding utility

When changing any handler return shape:

- update `electron/preload.ts`
- update `src/types/electron.d.ts`
- update the calling React component

This repo depends heavily on IPC contract consistency.

---

## 7. Shared Feature Modules

Two feature folders are especially important:

### Drive Sync

Files:

- [src/features/drive-sync/api-client.ts](/Users/fe-tienhuynh/Documents/super-app/src/features/drive-sync/api-client.ts)
- [src/features/drive-sync/electron-handlers.ts](/Users/fe-tienhuynh/Documents/super-app/src/features/drive-sync/electron-handlers.ts)
- [src/features/drive-sync/file-sync.ts](/Users/fe-tienhuynh/Documents/super-app/src/features/drive-sync/file-sync.ts)
- [src/features/drive-sync/poller.ts](/Users/fe-tienhuynh/Documents/super-app/src/features/drive-sync/poller.ts)
- [src/features/drive-sync/types.ts](/Users/fe-tienhuynh/Documents/super-app/src/features/drive-sync/types.ts)

Behavior:

- calls internal backend `drive-bot`
- gets sync plans
- downloads each file to local path
- supports progress and pause

Important nuance:

- Google Workspace files like Sheets/Docs are not downloadable as raw asset binaries
- app-side sync logic already protects against those files showing up in plan items
- backend API notes live in [drive-sync-api.md](/Users/fe-tienhuynh/Documents/super-app/drive-sync-api.md)

### Matrix Sync

Files:

- [src/features/matrix-sync/api-client.ts](/Users/fe-tienhuynh/Documents/super-app/src/features/matrix-sync/api-client.ts)
- [src/features/matrix-sync/electron-handlers.ts](/Users/fe-tienhuynh/Documents/super-app/src/features/matrix-sync/electron-handlers.ts)
- [src/features/matrix-sync/types.ts](/Users/fe-tienhuynh/Documents/super-app/src/features/matrix-sync/types.ts)

Behavior:

- fetch remote matrix templates by game ID
- get matrix detail
- publish local matrix to remote API
- support shared matrix library workflow across machines

Reference docs:

- [matrix-simulator-sync-plan.md](/Users/fe-tienhuynh/Documents/super-app/matrix-simulator-sync-plan.md)
- [matrix-simulator-sync-api.md](/Users/fe-tienhuynh/Documents/super-app/matrix-simulator-sync-api.md)

---

## 8. Browser Extensions

There are 2 extension folders:

- [one-punch-devkit-extension](/Users/fe-tienhuynh/Documents/super-app/one-punch-devkit-extension)
- [bunny-extension](/Users/fe-tienhuynh/Documents/super-app/bunny-extension)

### one-punch-devkit-extension

Main internal extension.

Purpose:

- inject debug controls into supported Cocos web pages
- support pause/resume, speed boost, reset speed, next frame
- filter/highlight console logs
- show mini log panel
- optionally bridge local events to Electron / local socket related flows

Important files:

- `manifest.json`
- `background.js`
- `content.js`
- `page-hook.js`
- `popup.html`
- `popup.js`

Architecture:

- `background.js` stores extension settings and syncs them to tabs
- `content.js` decides when to inject and forwards state from extension storage
- `page-hook.js` runs in page context and patches console / websocket / Cocos runtime

Critical nuance:

- `page-hook.js` is the most sensitive file in the extension
- changes there can affect:
  - console log visibility
  - websocket/event capture
  - speed control
  - injected overlay buttons
  - mini log behavior

### bunny-extension

Lighter extension variant for browser-side debug tooling.

It overlaps with the main extension but is intended to stay lighter and more standalone.

Do not assume every feature in `one-punch-devkit-extension` exists in `bunny-extension`.

### Extension packaging

Zips already exist in repo root:

- [one-punch-devkit-extension.zip](/Users/fe-tienhuynh/Documents/super-app/one-punch-devkit-extension.zip)
- [bunny-extension.zip](/Users/fe-tienhuynh/Documents/super-app/bunny-extension.zip)

Electron also ships the main extension folder as an extra resource during app packaging.

---

## 9. Storage and Persistence

Renderer uses local persisted state heavily.

Common patterns:

- `useStoredState(...)` for user preferences and form memory
- settings page controls shared alias and UI config state
- extension state is stored with `chrome.storage.local`

Examples of persisted UI state:

- dark/light theme
- menu group order and hidden groups
- path aliases
- selected folders
- matrix form state
- generator exclude lists

When changing any persisted key:

- check if existing user data should remain compatible
- avoid unnecessary key renames
- if you must rename, migrate carefully or accept one-time state reset

---

## 10. Styling and UI Conventions

The app has a custom dark-first visual identity.

Recent design direction:

- dark sidebar and dark cards in dark theme
- lighter backgrounds in light theme while keeping contrast usable
- strong accent color usage
- compact but polished control layout
- icon-heavy actions in Matrix Hub detail and other tool pages

Practical conventions:

- main page card wrapper often looks like:
  - rounded 2xl
  - subtle border
  - light/dark dual styles
- avoid introducing wildly different button language unless user requests it
- inputs and selects should visually match existing generator pages
- many collapsible headers use a shared visual language

Before changing UI globally:

- inspect both light and dark themes
- check whether the same utility pattern is duplicated across multiple pages
- do not assume a “standard dashboard” look is desired here

---

## 11. Loading Screen

The app has a custom loading experience:

- component: [src/components/loading/ChargeUpLoadingScreen.tsx](/Users/fe-tienhuynh/Documents/super-app/src/components/loading/ChargeUpLoadingScreen.tsx)
- assets include logo and punch imagery

Important:

- loading timing is intentionally short now
- visual choreography matters more than generic spinners
- do not casually replace with boilerplate loading UI

---

## 12. Assets and Icons

Important asset folders:

- [assets](/Users/fe-tienhuynh/Documents/super-app/assets)
- [src/assets](/Users/fe-tienhuynh/Documents/super-app/src/assets)

Key release icon files:

- `assets/icon.png`
- `assets/icon.icns`
- `assets/logo.png`
- splash/loading visuals such as `punch.png`

If release icon changes:

- check `package.json` build config
- ensure `assets/icon.icns` exists for mac build
- ensure `assets/icon.png` remains valid for runtime/resource usage

---

## 13. Build and Release

Scripts are defined in [package.json](/Users/fe-tienhuynh/Documents/super-app/package.json).

Common commands:

```bash
npm run dev
npm run build
npm run build:electron:mac
npm run release:mac
```

Meaning:

- `npm run build`
  - TypeScript build + Vite build
  - safest default verification after code changes

- `npm run build:electron:mac`
  - full Electron builder path for mac

- `npm run release:mac`
  - runs `scripts/release-mac.mjs`
  - builds the macOS ZIP and Ed25519-signed `update-mac-<arch>.json`
  - requires the existing local signing key; does not publish

Release automation:

- `.github/workflows/release-mac.yml`: manual `workflow_dispatch` only, macOS arm64.
- Publish through Actions -> Release macOS -> Run workflow, not automatically on push/tag.
- Actions uses its built-in `GITHUB_TOKEN` with `contents: write`; no personal access token is needed.
- Repository secret `UPDATE_SIGNING_PRIVATE_KEY` must contain the existing Ed25519 private key. Do not generate/rotate the key for a routine release.
- Set the temporary key path in a shell step using `$RUNNER_TEMP` and `$GITHUB_ENV`; `runner.temp` is not accepted in job-level `env`.
- macOS uses the internal verified installer helper, not Squirrel.Mac. No Apple Developer certificate is required for this update mechanism; normal filesystem permissions and macOS policies still apply.
- See `internal-macos-auto-update-guide.md` and README for the implementation, key handling, and test checklist.
- User confirmed build success at source version `0.5.13`. The local test client is `0.5.12` with a Settings marker; `0.5.13` removes it. End-to-end update installation is not yet confirmed.
- Only bump versions when the user asks. Current changes do not require an automatic release.
- Version policy: patch digits run from 0 to 9. After `0.5.9`, increment minor and reset patch to `0.6.0`, not `0.5.10`. Honor an explicitly requested version.
- User subsequently requested `0.6.0`, which supersedes the temporary `0.5.2` reset and is higher than the published `0.5.14`. Do not bypass downgrade checks or change versions without an explicit user request.

Current app version is stored in:

- [package.json](/Users/fe-tienhuynh/Documents/super-app/package.json)

Release output location:

- `release/`

---

## 14. Internal APIs and Hardcoded Service Endpoints

Some internal endpoints are currently hardcoded in source.

Example:

- `drive-bot` base URL in [electron/main.ts](/Users/fe-tienhuynh/Documents/super-app/electron/main.ts)

This means:

- treat backend-related changes carefully
- verify whether a URL is intentionally internal before “cleaning it up”
- if changing endpoint contracts, inspect both docs and runtime callers

---

## 15. Common Task Map

Use this section to quickly find where to work.

### A. Matrix Hub bug / matrix form / autoplay / local socket

Start with:

- [src/components/CheatConsole.tsx](/Users/fe-tienhuynh/Documents/super-app/src/components/CheatConsole.tsx)
- [electron/handlers/cheatLocalSocket.ts](/Users/fe-tienhuynh/Documents/super-app/electron/handlers/cheatLocalSocket.ts)
- [src/features/matrix-sync/electron-handlers.ts](/Users/fe-tienhuynh/Documents/super-app/src/features/matrix-sync/electron-handlers.ts)

### B. Anim generator mismatch / merged local keys / exclude list

Start with:

- [src/components/CreateAnimConfigs.tsx](/Users/fe-tienhuynh/Documents/super-app/src/components/CreateAnimConfigs.tsx)
- [electron/handlers/createAnim.ts](/Users/fe-tienhuynh/Documents/super-app/electron/handlers/createAnim.ts)
- [src/components/SettingsPanel.tsx](/Users/fe-tienhuynh/Documents/super-app/src/components/SettingsPanel.tsx)

### C. Sound generator issue

Start with:

- [src/components/CreateSoundConfigs.tsx](/Users/fe-tienhuynh/Documents/super-app/src/components/CreateSoundConfigs.tsx)
- [electron/handlers/createSound.ts](/Users/fe-tienhuynh/Documents/super-app/electron/handlers/createSound.ts)

### D. Usage Check false positive / missing summary

Start with:

- [src/components/CheckConfigs.tsx](/Users/fe-tienhuynh/Documents/super-app/src/components/CheckConfigs.tsx)
- [electron/handlers/checkConfig.ts](/Users/fe-tienhuynh/Documents/super-app/electron/handlers/checkConfig.ts)

### E. Drive sync issue

Start with:

- [src/components/DriveSyncMenu.tsx](/Users/fe-tienhuynh/Documents/super-app/src/components/DriveSyncMenu.tsx)
- [src/features/drive-sync/electron-handlers.ts](/Users/fe-tienhuynh/Documents/super-app/src/features/drive-sync/electron-handlers.ts)
- [src/features/drive-sync/api-client.ts](/Users/fe-tienhuynh/Documents/super-app/src/features/drive-sync/api-client.ts)
- [drive-sync-api.md](/Users/fe-tienhuynh/Documents/super-app/drive-sync-api.md)

### F. Extension debug controls or missing logs

Start with:

- [one-punch-devkit-extension/page-hook.js](/Users/fe-tienhuynh/Documents/super-app/one-punch-devkit-extension/page-hook.js)
- [one-punch-devkit-extension/content.js](/Users/fe-tienhuynh/Documents/super-app/one-punch-devkit-extension/content.js)
- [one-punch-devkit-extension/background.js](/Users/fe-tienhuynh/Documents/super-app/one-punch-devkit-extension/background.js)

### G. Sidebar, theme, or settings reordering issue

Start with:

- [src/App.tsx](/Users/fe-tienhuynh/Documents/super-app/src/App.tsx)
- [src/components/SettingsPanel.tsx](/Users/fe-tienhuynh/Documents/super-app/src/components/SettingsPanel.tsx)

---

## 16. Safety Notes for Future Agents

1. This repo contains several large, heavily iterated files.
   - Especially `CheatConsole.tsx`, `CodeHealth.tsx`, extension `page-hook.js`
   - Read carefully before making “small” edits

2. Do not casually refactor shared naming or state keys.
   - Many UI flows persist to local storage
   - Small naming changes can break UX continuity

3. Verify both themes for visible UI changes.
   - Light theme regressions are easy to miss

4. If you change IPC output shapes, update all three layers:
   - handler
   - preload
   - renderer types/component

5. Build after meaningful changes.
   - Preferred verification: `npm run build`

6. Extension changes often require manual reload in Chrome.
   - Repacking zip is separate from changing source files

7. Some behavior is intentionally domain-specific, not generic.
   - For example: matrix field flows, local socket sequence logic, anim config naming conventions

---

## 17. Suggested Agent Workflow

When a new Codex session starts on this repo:

1. Read this file
2. Read [package.json](/Users/fe-tienhuynh/Documents/super-app/package.json)
3. Read [src/App.tsx](/Users/fe-tienhuynh/Documents/super-app/src/App.tsx)
4. Read the feature entry files relevant to the user request
5. If extension-related, inspect the extension folder directly
6. After edits, run `npm run build` unless the user explicitly asks not to

---

## 18. Key Docs in Repo

Useful internal docs:

- [README.md](/Users/fe-tienhuynh/Documents/super-app/README.md)
- [cheat-matrix-extension-plan.md](/Users/fe-tienhuynh/Documents/super-app/cheat-matrix-extension-plan.md)
- [drive-sync-api.md](/Users/fe-tienhuynh/Documents/super-app/drive-sync-api.md)
- [matrix-simulator-sync-api.md](/Users/fe-tienhuynh/Documents/super-app/matrix-simulator-sync-api.md)
- [matrix-simulator-sync-plan.md](/Users/fe-tienhuynh/Documents/super-app/matrix-simulator-sync-plan.md)

Debug sample data:

- [debug-data](/Users/fe-tienhuynh/Documents/super-app/debug-data)

---

## 19. One-Line Summary

This repo is an internal Electron toolkit for game production/debug workflows, with a React renderer, Electron handler layer, domain-heavy matrix tooling, asset/code analysis tools, drive sync integrations, and companion browser extensions that patch live Cocos web pages for debugging and automation.

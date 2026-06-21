# Cheat Matrix Extension Plan

## Objective

Upgrade `Cheat Matrix` so autoplay runs only by waiting for real game socket responses instead of fixed delays.

Target architecture:

- Electron app hosts a local WebSocket server
- Chrome Extension MV3 listens to game socket responses in the browser
- Extension forwards matched events to the Electron local WebSocket server
- `Cheat Matrix` sequence engine executes the next cheat step only after receiving the expected socket event
- App includes a built-in feature to export/download the extension after implementation

## Product Goals

1. Remove the need to guess `delay` timing between cheat steps.
2. Make autoplay deterministic by tying each next step to a real socket response from the game.
3. Disable autoplay completely when Electron Local WebSocket Server is off.
4. Keep manual single-step execute flow intact as a fallback.
5. Let internal users install the extension easily from inside the Electron app.

## High-Level Architecture

### Electron App

- Renderer:
  - `Cheat Matrix` UI
  - toggle to enable local WebSocket server
  - status indicators for server and extension connection
  - autoplay locked behind local WebSocket availability
- Main process:
  - local WebSocket server
  - extension export/download handler
  - local extension folder/open path helper

### Chrome Extension MV3

- `manifest.json`
- content script
- injected page hook script
- optional service worker/background file

### Browser Flow

1. User triggers cheat sequence from Electron app.
2. Electron executes cheat step 1 through current HTTP flow.
3. Game button/event causes socket request/response in browser.
4. Extension listens to the page WebSocket response.
5. Extension filters the correct response event.
6. Extension sends a normalized event to Electron local WebSocket server.
7. Electron marks step 1 complete and executes cheat step 2.
8. Repeat until sequence ends or timeout occurs.

## Why Chrome Extension MV3

- Better for internal distribution and versioning than a userscript
- Easier to package and ship with the Electron app
- Better permission control by domain
- Easier to maintain as a real product feature

## Scope

### In Scope

- Local WebSocket server in Electron
- `Cheat Matrix` socket-driven autoplay mode
- Chrome Extension MV3 source in repo
- Extension export/download feature in app
- Connection status and debug logging
- Timeouts and fallback stop behavior

### Out Of Scope For V1

- Chrome Web Store publishing
- Multi-browser support beyond Chromium-based browsers
- Binary socket payload decoding if not required by the target game
- Remote extension auto-update

## UI Changes

### Cheat Matrix

Add a new section in the selected game detail screen:

- `Enable Local WebSocket Server` checkbox
- `Server Status` badge
  - `Off`
  - `Listening`
  - `Client Connected`
- `Autoplay Status`
  - `Disabled`
  - `Ready`
  - `Running`
- `Extension Status`
  - `Not Installed`
  - `Installed / Waiting`
  - `Connected`
- `Last Socket Event`
- `Test Local WS`
- `Simulate Socket Event`

### Extension Tools

Add a new action group, either:

- inside `Cheat Matrix`, or
- new lightweight section in the same screen

Actions:

- `Export Extension ZIP`
- `Open Extension Folder`
- `Open Installation Guide`

## Data Model Changes

### Renderer State

Add new stored values:

- `cheat-matrix-local-ws-enabled`
- `cheat-matrix-local-ws-port`
- `cheat-matrix-extension-export-path`

### Runtime State

Track:

- server running state
- connected extension clients
- current autoplay run id
- current waiting panel id
- timeout per waiting step
- last socket event metadata

## WebSocket Protocol

### Electron Local WebSocket Server

Default host:

- `127.0.0.1`

Default port:

- `17381`

### Inbound Event Shape

```json
{
  "type": "game-socket-response",
  "gameId": "9704",
  "eventName": "spinResult",
  "timestamp": 1780000000000,
  "sourceUrl": "https://game.example.com",
  "payload": {
    "roundId": "abc123",
    "state": "completed",
    "raw": {}
  }
}
```

### Optional Control Events

```json
{
  "type": "extension-handshake",
  "extensionVersion": "0.1.0",
  "origin": "chrome-extension://..."
}
```

```json
{
  "type": "extension-heartbeat",
  "timestamp": 1780000000000
}
```

## Matching Logic

Electron should not execute the next cheat step on every inbound message.

Need a matcher layer:

- per game
- per sequence step
- per event type

V1 matching strategy:

1. accept only `type === "game-socket-response"`
2. optionally match `gameId`
3. optionally match `eventName`
4. dedupe by `roundId + timestamp` or event hash
5. if current state is `waiting_socket_response`, resolve current step and continue

## Sequence Engine Upgrade

### New Behavior

- if local WS disabled:
  - autoplay button is disabled
  - only manual execute per cheat is available
- if local WS enabled:
  - execute first step immediately
  - wait for a valid inbound event
  - execute next step only after event arrives
  - do not rely on configured delay
  - per-step delay config is removed from autoplay behavior

### Required State Machine

- `idle`
- `executing_step`
- `waiting_socket_response`
- `step_completed`
- `timeout`
- `aborted`
- `completed`

### Timeout Rules

Each step in socket-driven mode should have a timeout:

- default: `15000ms`

On timeout:

- log failure
- stop sequence
- allow user to retry or continue manually

## Chrome Extension MV3 Design

### Folder Structure

```text
one-punch-devkit-extension/
  manifest.json
  content.js
  page-hook.js
  background.js
  icons/
```

### Responsibilities

#### `page-hook.js`

- runs in page context
- wraps `window.WebSocket`
- listens for socket instances and incoming messages
- normalizes raw messages
- posts them to the content script bridge

#### `content.js`

- receives `window.postMessage` events from page hook
- filters trusted event shape
- opens a WebSocket client to Electron local server
- forwards normalized payload
- reports connection state

#### `background.js`

- optional for V1
- can be used later for debug logs, connection retries, or popup support

### Manifest Notes

- MV3 manifest
- host permissions only for intended game domains
- `web_accessible_resources` for injected page hook

## Extension Export / Download Feature

### Goal

Allow the user to export the browser extension from inside the Electron app.

### Output Formats

V1 should support:

- extension folder on disk
- extension zip

### Recommended User Flow

1. user clicks `Export Extension ZIP`
2. Electron copies or prepares extension assets
3. Electron creates zip package
4. Electron opens save location or export folder
5. user installs via `chrome://extensions` -> `Load unpacked`

### Important Note

For non-store distribution, Chrome still expects unpacked extension loading.  
So the zip is for transport/sharing, not direct one-click installation.

## File-Level Implementation Breakdown

### Renderer

#### `src/components/CheatConsole.tsx`

- add local WS enable checkbox
- remove autoplay dependence on delay configuration
- disable autoplay when local WS is off
- add server/extension status badges
- add debug log section
- integrate socket-driven autoplay flow
- add extension export buttons

#### `src/types/electron.d.ts`

- define APIs:
  - `startLocalSocketServer`
  - `stopLocalSocketServer`
  - `getLocalSocketStatus`
  - `onLocalSocketEvent`
  - `exportCheatExtension`
  - `openCheatExtensionFolder`

### Electron Main / Preload

#### `electron/main.ts`

- register new handlers

#### `electron/preload.ts`

- expose new APIs to renderer

### New Electron Handlers

#### `electron/handlers/cheatLocalSocket.ts`

- start/stop local WebSocket server
- manage connections
- validate inbound messages
- emit events to renderer

#### `electron/handlers/exportCheatExtension.ts`

- package extension folder
- export zip
- open local folder if requested

### Scripts

#### `scripts/package-cheat-extension.mjs`

- optional helper script to package extension zip from source folder

### Browser Extension

#### `one-punch-devkit-extension/manifest.json`

- MV3 definition

#### `one-punch-devkit-extension/content.js`

- bridge and localhost client

#### `one-punch-devkit-extension/page-hook.js`

- WebSocket interception in page context

#### `one-punch-devkit-extension/background.js`

- optional debug/reconnect support

## Storage / Persistence

Store:

- local WS enabled flag
- preferred port
- last export directory

Do not store:

- transient socket events
- active connection ids
- volatile autoplay state after app restart

## Logging Strategy

### Renderer Log Examples

- `Local WS server started on ws://127.0.0.1:17381`
- `Extension client connected`
- `Executing step #1: FreeSpinStart`
- `Waiting socket event...`
- `Received socket event: spinResult`
- `Executing step #2: JackpotBoost`
- `Timeout while waiting for socket response`
- `Autoplay unavailable because Local WS server is off`

### Main Process Logging

- server lifecycle
- client connect/disconnect
- malformed event payload

## Error Handling

### Cases To Handle

- server port already in use
- extension not connected
- wrong game domain
- unmatched event type
- duplicate events
- socket response timeout
- malformed payload from extension

### UX Behavior

- clear status banner
- debug console logs
- no silent failure

## Testing Plan

### Unit / Logic Tests

- field/state transition logic for socket-driven sequence
- dedupe logic for inbound events
- autoplay disabled behavior when server is off

### Manual Test Cases

1. Start server from app and verify status becomes `Listening`
2. Load extension in Chrome and verify status becomes `Connected`
3. Execute first cheat step and verify app enters `waiting_socket_response`
4. Send a valid socket event and verify next step runs automatically
5. Send duplicate event and verify no duplicate step execution
6. Send invalid payload and verify it is ignored with log
7. Disconnect extension client and verify UI shows disconnected state
8. Export extension zip and verify file is created
9. Open extension folder and verify manifest/resources exist
10. Disable local WS and verify autoplay is unavailable while manual execute still works

## Rollout Strategy

### Phase A

- local WS server
- socket-driven sequence engine
- simulated event testing from renderer

### Phase B

- extension source
- real browser socket hook
- manual local installation

### Phase C

- extension export/download feature in app
- better diagnostics and reconnection UX

## Success Criteria

- user can enable local WS mode from `Cheat Matrix`
- autoplay is only available when local WS is enabled
- first cheat step runs immediately
- next steps run only after real browser socket response arrives
- no delay value is used by autoplay
- extension can be exported from the app as a shareable package
- app still supports manual single-step execute as fallback

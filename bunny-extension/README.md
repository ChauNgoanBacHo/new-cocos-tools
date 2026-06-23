# Bunny Assistant Extension

## Purpose

This extension listens to browser-side game WebSocket messages and forwards them to the Electron local WebSocket server used by `Cheat Matrix`.

Default local server:

- `ws://127.0.0.1:17381`

Default page origins:

- `http://localhost:7456`
- `https://iframe-tektale.staging.enostd.gay`
- `https://webapp5tek.enostd.gay`

## Install

1. Open `chrome://extensions`
2. Turn on `Developer mode`
3. Click `Load unpacked`
4. Select the `one-punch-devkit-extension/` folder

## Current Behavior

- Injects a page hook at document start
- Wraps `window.WebSocket`
- Forwards incoming socket messages to the Electron app
- Treats `ev: "n"` and `ev: "f"` as valid success-like game responses for Cheat Matrix autoplay
- Includes a popup toggle to turn the local socket bridge on or off
- Includes a popup field to add custom site origins without changing code
- Supports custom links managed directly from the extension popup
- Can send a `Start Autoplay In Electron` command through the local socket bridge

## Notes

- This is the initial bridge implementation
- Autoplay depends on the Electron local WebSocket server being enabled in the app
- After saving custom links, reload the target tab so the content script picks up the new origin list

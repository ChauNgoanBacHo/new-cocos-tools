# Bunny Assistant Extension

## Purpose

Browser-side debug tools for supported game pages: overlay game controls (pause, speed boost, frame stepping) and console log filtering. Everything runs directly on the page — no Electron or external server needed.

Default page origins:

- `http://localhost:7456`
- `https://iframe-tektale.staging.enostd.gay`
- `https://webapp5tek.enostd.gay`

## Install

1. Open `chrome://extensions`
2. Turn on `Developer mode`
3. Click `Load unpacked`
4. Select the `bunny-extension/` folder

## Current Behavior

- Injects a page hook at document start
- Shows a draggable overlay toolbar with pause, speed boost, next-frame, and reset controls
- Lets you set a custom cheat speed from the popup
- Filters console logs: an exclude list hides matching lines, a highlight list colors matching lines
- Supports custom site origins managed directly from the extension popup

## Notes

- After saving custom links, reload the target tab so the content script picks up the new origin list
- The overlay position is remembered per page via `localStorage`

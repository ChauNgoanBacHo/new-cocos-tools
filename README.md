# Super App

## Install

```bash
npm install
```

## Dev

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Build Electron

```bash
npm run build:electron:mac
npm run build:electron:linux
```

## Build macOS update artifacts

```bash
npm run release:mac
```

This creates the macOS ZIP, blockmap, and `latest-mac.yml` in `release/`.

## Publish a macOS auto-update

1. Bump `version` in `package.json`.
2. Make sure the GitHub repository is public.
3. Export a GitHub token that can create releases:

```bash
export GH_TOKEN=your_github_token
npm run release:mac:publish
```

The packaged app checks GitHub Releases automatically and downloads newer versions in the background. Version `0.5.7` is the first updater-enabled build, so existing users must install this version manually once.

macOS requires every auto-updating build to be signed by the same Developer ID. Configure `CSC_LINK` and `CSC_KEY_PASSWORD` in the release environment before distributing updater-enabled builds.

## Preview

```bash
npm run preview
```

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

## Release macOS patch update

```bash
npm run release:mac
```

This builds `CocosTools.app`, then creates a macOS `.zip` release in `release/`.
The release script also cleans the `release/` folder so only the current patch `.zip` remains.

## Manual patch update flow

1. Bump `version` in `package.json`.
2. Run `npm run release:mac`.
3. Send the generated `.zip` file in `release/` to users.
4. Users close the current app, unzip the new package, and replace the old `CocosTools.app`.
5. Reopen the app and confirm the version label in the sidebar has changed.

## Preview

```bash
npm run preview
```

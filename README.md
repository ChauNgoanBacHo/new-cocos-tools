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

This creates the macOS ZIP and signed `update-mac-<arch>.json` in `release/`, along with any builder metadata.

## Publish a macOS auto-update

1. Bump `version` in `package.json`.
2. Make sure the GitHub repository is public.
3. Export a GitHub token that can create releases:

```bash
export GH_TOKEN=your_github_token
npm run release:mac:publish
```

The packaged app checks GitHub Releases automatically and downloads newer versions in the background. Install the transition version `0.5.11` manually once to enable the internal updater below.

### Internal macOS updater (0.5.11+)

macOS builds now use an internal installer helper instead of Squirrel.Mac. An Apple Developer certificate is not required for this update mechanism. It does not disable Gatekeeper, remove quarantine attributes, or request administrator rights. Install the app in a writable location such as `~/Applications` if `/Applications` is not writable by your user.

- Install `0.5.11` manually once. Older clients still use Squirrel and cannot install this transition automatically.
- Release machine: run `npm run update:keygen` only once if no key exists. The public key is committed in `assets/update-public.pem`; the private key is stored outside the repository at `~/.config/one-punch-devkit/update-private.pem` with mode 600.
- Back up the private key securely. Other release machines may set `UPDATE_SIGNING_KEY_PATH` to the same key. Never commit it or include it in an app/release. Replacing the key breaks trust for existing clients.
- `npm run release:mac` builds the ZIP and signs an architecture-specific `update-mac-arm64.json` (or x64). `npm run release:mac:publish` uploads all artifacts into a draft and publishes only after uploads finish. `GH_TOKEN` is needed only on the release machine.
- Clients verify the Ed25519 signature, architecture, version, file size, and SHA-256 before extraction. Installation rechecks the signature/checksum and the extracted bundle ID/version.
- Clicking `Restart & Install` prepares a sibling staging folder and starts a detached helper. The helper waits for app exit, moves the old bundle to a backup, installs the new bundle, then asks macOS to open it. Failed replacement or immediate launch-request failure restores the backup. It does not detect crashes that occur after macOS accepts the launch request.
- Backups stay in `.one-punch-update-*` next to the installed app. Keep them until the new app is confirmed working; they may then be deleted manually. The installer status is recorded in `~/Library/Application Support/one-punch-devkit/update-result.txt`.
- Updates are full ZIP downloads. The workflow avoids manual replacement; it does not promise delta-only downloads.

Test with `npm run test:updater`. For an end-to-end test, install `0.5.11`, publish `0.5.12` signed with the same private key, then check/install from Settings. Do not overwrite a published version.

## Preview

```bash
npm run preview
```

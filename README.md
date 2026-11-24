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

Use **Actions -> Release macOS**. The workflow builds macOS Apple Silicon (`arm64`) only, signs the update with the existing Ed25519 key, and publishes with GitHub's temporary `GITHUB_TOKEN`. No personal access token is required.

One-time setup: add a repository Actions secret named `UPDATE_SIGNING_PRIVATE_KEY`, containing the full existing PEM private key from `~/.config/one-punch-devkit/update-private.pem`. Do not generate a new key: installed clients already trust `assets/update-public.pem`.

With an authenticated GitHub CLI, upload it without printing the key:

```bash
gh secret set UPDATE_SIGNING_PRIVATE_KEY \
  --repo ChauNgoanBacHo/new-cocos-tools \
  < "$HOME/.config/one-punch-devkit/update-private.pem"
```

Alternatively, use the repository **Settings -> Secrets and variables -> Actions -> New repository secret**. Do not paste the private key into issues, source files, or chat.

For each release:

1. Update `package.json` and `package-lock.json` only when ready to release, then commit/push to `main`.
2. Open **Actions -> Release macOS -> Run workflow**, selecting `main`.
3. Wait for the workflow to publish the ZIP and signed manifest in GitHub Releases. Pushing commits or tags does not start a release automatically.

The workflow rejects mismatched tags, commits outside `main`, wrong signing keys, and already-published versions. If publishing failed after creating a draft, rerun the same workflow to finish that draft. It never builds Windows/Linux or Spine Notes. The private key is written only to the runner's temporary folder and removed in an always-run cleanup step.

Local `npm run release:mac` still works with the local signing key. Local publishing remains optional and needs `GH_TOKEN` or `GITHUB_TOKEN`; it is not required when using Actions.

The packaged app checks GitHub Releases automatically and downloads newer versions in the background. Install the transition version `0.5.11` manually once to enable the internal updater below.

### Internal macOS updater (0.5.11+)

macOS builds now use an internal installer helper instead of Squirrel.Mac. An Apple Developer certificate is not required for this update mechanism. It does not disable Gatekeeper, remove quarantine attributes, or request administrator rights. Install the app in a writable location such as `~/Applications` if `/Applications` is not writable by your user.

- Install `0.5.11` manually once. Older clients still use Squirrel and cannot install this transition automatically.
- Release machine: run `npm run update:keygen` only once if no key exists. The public key is committed in `assets/update-public.pem`; the private key is stored outside the repository at `~/.config/one-punch-devkit/update-private.pem` with mode 600.
- Back up the private key securely. Other release machines may set `UPDATE_SIGNING_KEY_PATH` to the same key. Never commit it or include it in an app/release. Replacing the key breaks trust for existing clients.
- `npm run release:mac` builds the ZIP and signs an architecture-specific `update-mac-arm64.json` (or x64). Publishing uploads all artifacts into a draft and publishes only after uploads finish. Actions supplies `GITHUB_TOKEN` automatically; end users need no token.
- Clients verify the Ed25519 signature, architecture, version, file size, and SHA-256 before extraction. Installation rechecks the signature/checksum and the extracted bundle ID/version.
- Clicking `Restart & Install` prepares a sibling staging folder and starts a detached helper. The helper waits for app exit, moves the old bundle to a backup, installs the new bundle, then asks macOS to open it. Failed replacement or immediate launch-request failure restores the backup. It does not detect crashes that occur after macOS accepts the launch request.
- Backups stay in `.one-punch-update-*` next to the installed app. Keep them until the new app is confirmed working; they may then be deleted manually. The installer status is recorded in `~/Library/Application Support/one-punch-devkit/update-result.txt`.
- Updates are full ZIP downloads. The workflow avoids manual replacement; it does not promise delta-only downloads.

Test with `npm run test:updater`. The current test pair is the local `0.5.12` build with the Settings marker and release `0.5.13` without that marker. From the local app, check/install the newer release; confirm the app reopens as `0.5.13`, the marker is gone, and existing settings remain. Do not overwrite a published version.

### Verified status

- User confirmed the build succeeds after the workflow setup/fix. Current source version: `0.5.13`.
- Workflow runs manually only; GitHub supplies the publish token. Keep using the same Ed25519 key in `UPDATE_SIGNING_PRIVATE_KEY`.
- The key path is exported from shell `$RUNNER_TEMP` through `$GITHUB_ENV`. Do not put `${{ runner.temp }}` in job-level `env`; GitHub rejected that context there.
- End-to-end installation from `0.5.12` to `0.5.13` has not yet been confirmed by the user. Build success alone is not confirmation that auto-update installation succeeded.

## Preview

```bash
npm run preview
```

# Spine Animation Notes

Small standalone web app for scanning local Spine assets and documenting where and when each animation is used.

## Local development

```bash
npm run dev:spine-notes
```

Build output is written to `dist-spine-metadata/`:

```bash
npm run build:spine-notes
```

## Desktop releases

### Windows for the animation team

Build the unpacked Windows application:

```bash
npm run build:spine-notes:win
```

Create a portable `.exe` that does not require installation:

```bash
npm run release:spine-notes:win
```

Windows output is written to `release-spine-notes/`. The animation team can run the portable executable directly.

### macOS for the FE team

Build a clickable macOS application:

```bash
npm run build:spine-notes:mac
```

The app is written to `release-spine-notes/mac-arm64/Spine Notes.app` on Apple Silicon.

Create a ZIP that can be sent to the FE team:

```bash
npm run release:spine-notes:mac
```

The ZIP is written to `release-spine-notes/` and includes the application icon. The Apps Script URL entered in the app is retained on that Mac.

## Google Sheet setup

1. Create or open the shared Google Sheet.
2. Create one tab per game ID, for example `9728`.
3. Open **Extensions > Apps Script** and paste `apps-script/Code.gs`.
4. Deploy it as a Web App with access for the intended team.
5. Put the deployment URL in `.env` as `VITE_SPINE_SHEET_API_URL`, or connect it once from the app's API dialog.

The API never creates game tabs. Opening a game ID without a matching tab returns `TAB_NOT_FOUND` and the UI asks the user to create it in Google Sheets.

The first request to an empty game tab writes the required headers. Existing animation notes are preserved when the same folder is scanned again.

## Data model

Each animation is one Sheet row. The UI groups rows by Spine name. This flat schema is intentional so future closure CSV and QA GIF exporters can consume the same records without reading UI state.

import { app, BrowserWindow, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { isNewerVersion, verifyManifest, sha256File } from '../../scripts/update-security.mjs';

const exec = promisify(execFile);
const repo = 'ChauNgoanBacHo/new-cocos-tools';
let state: { status: string; currentVersion: string; version?: string; percent?: number; transferred?: number; total?: number; message?: string } = { status: 'idle', currentVersion: app.getVersion() };
let ready: { zip: string; envelope: unknown } | null = null;
let installing = false;
let initialized = false;

function setState(next: Partial<typeof state>) {
    state = { ...state, ...next, currentVersion: app.getVersion() };
    for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) window.webContents.send('app-update:state', state);
    }
}

function publicKey() {
    return fs.readFileSync(path.join(process.resourcesPath, 'assets/update-public.pem'), 'utf8');
}

async function getJson(url: string) {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Update server returned HTTP ${response.status}.`);
    const text = await response.text();
    if (text.length > 1024 * 1024) throw new Error('Update metadata is too large.');
    return JSON.parse(text);
}

async function checkForUpdates() {
    if (!app.isPackaged || process.platform !== 'darwin') {
        setState({ status: 'disabled', message: 'Internal auto update requires a packaged macOS build.' });
        return state;
    }
    if (installing || ['checking', 'available', 'downloading', 'downloaded'].includes(state.status)) return state;
    setState({ status: 'checking', message: undefined, percent: undefined });
    let workDir: string | undefined;
    try {
        const release = await getJson(`https://api.github.com/repos/${repo}/releases/latest`);
        const version = String(release.tag_name || '').replace(/^v/, '');
        if (!isNewerVersion(version, app.getVersion())) {
            setState({ status: 'not-available', message: 'You are using the latest version.', version: undefined });
            return state;
        }
        const base = `https://github.com/${repo}/releases/download/v${version}/`;
        const envelope = await getJson(`${base}update-mac-${process.arch}.json`);
        const manifest = verifyManifest(envelope, publicKey(), process.arch);
        if (manifest.version !== version) throw new Error('Release and signed manifest versions do not match.');
        setState({ status: 'available', version, message: undefined });
        const cache = path.join(app.getPath('userData'), 'updates');
        await fs.promises.mkdir(cache, { recursive: true, mode: 0o700 });
        workDir = await fs.promises.mkdtemp(path.join(cache, 'download-'));
        const zip = path.join(workDir, manifest.file);
        const response = await fetch(`${base}${manifest.file}`, { signal: AbortSignal.timeout(15 * 60_000) });
        if (!response.ok || !response.body) throw new Error(`Update download failed: HTTP ${response.status}.`);
        const file = await fs.promises.open(zip, 'wx', 0o600);
        let transferred = 0;
        let lastProgress = 0;
        try {
            for await (const chunk of response.body) {
                transferred += chunk.length;
                if (transferred > manifest.size) throw new Error('Update exceeds its signed file size.');
                await file.writeFile(chunk);
                if (Date.now() - lastProgress > 200) {
                    lastProgress = Date.now();
                    setState({ status: 'downloading', transferred, total: manifest.size, percent: transferred / manifest.size * 100 });
                }
            }
        } finally { await file.close(); }
        if (transferred !== manifest.size || await sha256File(zip) !== manifest.sha256) throw new Error('Update checksum mismatch. Nothing was installed.');
        ready = { zip, envelope };
        setState({ status: 'downloaded', percent: 100, message: 'Signature verified. Restart to install the update.' });
    } catch (error) {
        ready = null;
        if (workDir) await fs.promises.rm(workDir, { recursive: true, force: true });
        setState({ status: 'error', message: error instanceof Error ? error.message : 'Update failed.' });
    }
    return state;
}

async function installUpdate() {
    if (!ready || state.status !== 'downloaded' || installing) return { ok: false, error: 'No verified update is ready.' };
    installing = true;
    let stagingDir: string | undefined;
    try {
        const manifest = verifyManifest(ready.envelope, publicKey(), process.arch);
        if (!isNewerVersion(manifest.version, app.getVersion()) || await sha256File(ready.zip) !== manifest.sha256) throw new Error('Update verification failed before installation.');
        const target = path.resolve(app.getPath('exe'), '../../..');
        const parent = path.dirname(target);
        if (!target.endsWith('.app') || target.startsWith('/Volumes/') || target.includes('/AppTranslocation/')) throw new Error('Move the app to Applications or ~/Applications before updating.');
        await fs.promises.access(parent, fs.constants.W_OK);
        const { stdout: entries } = await exec('/usr/bin/unzip', ['-Z1', ready.zip], { maxBuffer: 16 * 1024 * 1024 });
        if (entries.split('\n').filter(Boolean).some(entry => entry.startsWith('/') || entry.split('/').includes('..'))) throw new Error('Unsafe paths in update archive.');
        stagingDir = await fs.promises.mkdtemp(path.join(parent, '.one-punch-update-'));
        await fs.promises.chmod(stagingDir, 0o700);
        await exec('/usr/bin/ditto', ['-x', '-k', ready.zip, stagingDir]);
        const staged = path.join(stagingDir, 'One Punch DevKit.app');
        const plist = path.join(staged, 'Contents/Info.plist');
        const value = async (key: string) => (await exec('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, plist])).stdout.trim();
        if (await value('CFBundleIdentifier') !== 'com.superapp.app' || await value('CFBundleShortVersionString') !== manifest.version) throw new Error('Extracted application does not match the signed release.');
        if ((await fs.promises.lstat(staged)).isSymbolicLink()) throw new Error('Invalid application bundle.');
        const executable = await value('CFBundleExecutable');
        if (executable !== 'One Punch DevKit') throw new Error('Unexpected update executable.');
        await fs.promises.access(path.join(staged, 'Contents/MacOS', executable), fs.constants.X_OK);
        const backup = path.join(stagingDir, `Previous-${app.getVersion()}.app`);
        const result = path.join(app.getPath('userData'), 'update-result.txt');
        const helper = path.join(stagingDir, 'install-update.sh');
        await fs.promises.copyFile(path.join(process.resourcesPath, 'assets/install-update.sh'), helper);
        const child = spawn('/bin/bash', [helper, String(process.pid), target, staged, backup, result], { detached: true, stdio: 'ignore' });
        await new Promise<void>((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
        child.unref();
        setState({ message: `Installing v${manifest.version}. Backup: ${backup}` });
        setTimeout(() => app.quit(), 300);
        return { ok: true };
    } catch (error) {
        if (stagingDir) await fs.promises.rm(stagingDir, { recursive: true, force: true });
        installing = false;
        const message = error instanceof Error ? error.message : 'Could not prepare the update.';
        setState({ status: 'error', message });
        return { ok: false, error: message };
    }
}

export function registerAppUpdaterHandlers() {
    ipcMain.handle('app-update:get-state', () => state);
    ipcMain.handle('app-update:check', () => checkForUpdates());
    ipcMain.handle('app-update:install', () => installUpdate());
}

export function initializeAppUpdater() {
    if (initialized) return;
    initialized = true;
    if (!app.isPackaged || process.platform !== 'darwin') {
        setState({ status: 'disabled', message: 'Internal auto update requires a packaged macOS build.' });
        return;
    }
    const result = path.join(app.getPath('userData'), 'update-result.txt');
    if (fs.existsSync(result)) setState({ message: fs.readFileSync(result, 'utf8').trim() });
    setTimeout(() => void checkForUpdates(), 4000);
}

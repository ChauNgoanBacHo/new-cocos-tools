import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { isNewerVersion, verifyManifest, sha256File } from './update-security.mjs';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const pem = publicKey.export({ type: 'spki', format: 'pem' });
const manifest = { schema: 1, appId: 'com.superapp.app', version: '0.5.12', arch: 'arm64', file: 'One-Punch-DevKit-0.5.12-arm64-mac.zip', sha256: 'a'.repeat(64), size: 123 };
function envelope(value = manifest, key = privateKey) {
    const payload = Buffer.from(JSON.stringify(value));
    return { payload: payload.toString('base64'), signature: sign(null, payload, key).toString('base64') };
}
test('stable versions compare numerically and reject malformed versions', () => {
    assert.ok(isNewerVersion('0.5.11', '0.5.9'));
    assert.equal(isNewerVersion('0.5.11', '0.5.11'), false);
    assert.equal(isNewerVersion('0.5.9', '0.5.11'), false);
    assert.throws(() => isNewerVersion('../evil', '0.5.11'));
});
test('accepts a valid Ed25519 envelope', () => assert.deepEqual(verifyManifest(envelope(), pem, 'arm64'), manifest));
test('rejects tampering, missing signatures and a different signing key', () => {
    const changed = envelope();
    changed.payload = Buffer.from(JSON.stringify({ ...manifest, version: '99.0.0' })).toString('base64');
    assert.throws(() => verifyManifest(changed, pem, 'arm64'));
    assert.throws(() => verifyManifest({}, pem, 'arm64'));
    assert.throws(() => verifyManifest(envelope(manifest, generateKeyPairSync('ed25519').privateKey), pem, 'arm64'));
});
test('rejects wrong architecture, application, traversal, and invalid sizes', () => {
    assert.throws(() => verifyManifest(envelope(), pem, 'x64'));
    for (const patch of [{ appId: 'another.app' }, { file: '../evil.zip' }, { sha256: 'invalid' }, { size: 0 }, { size: 3 * 1024 ** 3 }]) {
        assert.throws(() => verifyManifest(envelope({ ...manifest, ...patch }), pem, 'arm64'));
    }
});
test('hashes streamed files', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'updater-hash-'));
    try {
        await fs.writeFile(path.join(dir, 'file'), 'abc');
        assert.equal(await sha256File(path.join(dir, 'file')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
test('helper refuses missing staged bundle without touching installed app', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'updater-helper-'));
    const target = path.join(dir, 'Installed App.app');
    try {
        await fs.mkdir(target);
        await fs.writeFile(path.join(target, 'sentinel'), 'keep');
        assert.throws(() => execFileSync('/bin/bash', ['assets/install-update.sh', '99999999', target, path.join(dir, 'missing.app'), path.join(dir, 'backup.app'), path.join(dir, 'result')]));
        assert.equal(await fs.readFile(path.join(target, 'sentinel'), 'utf8'), 'keep');
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('mac helper replaces a temporary app, preserves backup and requests launch', { skip: process.platform !== 'darwin' }, async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'updater-swap-'));
    const target = path.join(dir, 'Installed App.app');
    const staged = path.join(dir, 'Staged App.app');
    const backup = path.join(dir, 'Previous App.app');
    const launched = path.join(dir, 'launched');
    try {
        await fs.mkdir(target);
        await fs.writeFile(path.join(target, 'old-sentinel'), 'old');
        await fs.mkdir(path.join(staged, 'Contents/MacOS'), { recursive: true });
        await fs.writeFile(path.join(staged, 'Contents/Info.plist'), `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>test-update</string><key>CFBundleIdentifier</key><string>com.superapp.updater-test</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>`);
        await fs.writeFile(path.join(staged, 'Contents/MacOS/test-update'), `#!/bin/bash\nprintf launched > '${launched}'\n`, { mode: 0o755 });
        execFileSync('/bin/bash', ['assets/install-update.sh', '99999999', target, staged, backup, path.join(dir, 'result')]);
        assert.equal(await fs.readFile(path.join(backup, 'old-sentinel'), 'utf8'), 'old');
        for (let i = 0; i < 50; i++) {
            try { await fs.access(launched); break; } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
        }
        assert.equal(await fs.readFile(launched, 'utf8'), 'launched');
        assert.match(await fs.readFile(path.join(dir, 'result'), 'utf8'), /Updated successfully/);
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('CI restores only the matching key, with private permissions and no secret in output', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'updater-ci-key-'));
    const target = path.join(dir, 'private.pem');
    const script = path.resolve('scripts/prepare-ci-update-key.mjs');
    const secret = privateKey.export({ type: 'pkcs8', format: 'pem' });
    const run = value => execFileSync(process.execPath, [script], {
        cwd: dir, encoding: 'utf8', stdio: 'pipe',
        env: { ...process.env, UPDATE_SIGNING_PRIVATE_KEY: value, UPDATE_SIGNING_KEY_PATH: target },
    });
    try {
        await fs.mkdir(path.join(dir, 'assets'));
        await fs.writeFile(path.join(dir, 'assets/update-public.pem'), pem);
        assert.throws(() => run('invalid'));
        assert.throws(() => run(generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' })));
        await assert.rejects(fs.access(target));
        const output = run(secret);
        assert.ok(!output.includes('BEGIN PRIVATE KEY'));
        assert.equal((await fs.stat(target)).mode & 0o777, 0o600);
        assert.equal(await fs.readFile(target, 'utf8'), secret);
        assert.throws(() => run(secret), 'Existing key must not be overwritten');
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { sha256File, verifyManifest } from './update-security.mjs';

const publish = process.argv.includes('--publish');
const githubToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (publish && !githubToken) throw new Error('Run the macOS release workflow, or provide GH_TOKEN/GITHUB_TOKEN to publish locally.');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const keyPath = process.env.UPDATE_SIGNING_KEY_PATH || path.join(os.homedir(), '.config/one-punch-devkit/update-private.pem');
if (!fs.existsSync(keyPath)) throw new Error('Missing update signing key. Run npm run update:keygen once on the release machine.');
const key = createPrivateKey(fs.readFileSync(keyPath));
const publicKey = fs.readFileSync('assets/update-public.pem', 'utf8');
if (createPublicKey(key).export({ type: 'spki', format: 'pem' }) !== publicKey) throw new Error('Private signing key does not match the public key trusted by the app.');
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' });
const repo = 'ChauNgoanBacHo/new-cocos-tools';
const tag = `v${pkg.version}`;
async function api(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: { Authorization: `Bearer ${githubToken}`, Accept: 'application/vnd.github+json', ...options.headers },
        signal: AbortSignal.timeout(15 * 60_000),
    });
    if (!response.ok) throw new Error(`GitHub HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
    return response.json();
}
let existing;
if (publish) {
    const releases = await api(`https://api.github.com/repos/${repo}/releases?per_page=100`);
    existing = releases.find(release => release.tag_name === tag);
    if (existing && !existing.draft) throw new Error(`${tag} is already published. Increase the version; do not overwrite a shipped release.`);
}
fs.rmSync('release', { recursive: true, force: true });
run('npm', ['run', 'build']);
run('npx', ['electron-builder', '--mac', 'zip', '--publish', 'never']);
const arch = process.arch;
const file = `One-Punch-DevKit-${pkg.version}-${arch}-mac.zip`;
const zipPath = path.join('release', file);
const manifest = {
    schema: 1, appId: 'com.superapp.app', version: pkg.version, arch, file,
    size: fs.statSync(zipPath).size, sha256: await sha256File(zipPath),
};
const payload = Buffer.from(JSON.stringify(manifest));
const envelope = { payload: payload.toString('base64'), signature: sign(null, payload, key).toString('base64') };
verifyManifest(envelope, publicKey, arch);
const manifestName = `update-mac-${arch}.json`;
fs.writeFileSync(path.join('release', manifestName), JSON.stringify(envelope, null, 2) + '\n');
console.log(`Signed update: release/${manifestName}`);
if (publish) {
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const release = existing || await api(`https://api.github.com/repos/${repo}/releases`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag_name: tag, target_commitish: commit, name: pkg.version, draft: true, prerelease: false }),
    });
    const names = [file, manifestName, ...[`${file}.blockmap`, 'latest-mac.yml'].filter(name => fs.existsSync(path.join('release', name)))];
    for (const name of names) {
        const oldAsset = release.assets?.find(asset => asset.name === name);
        if (oldAsset) {
            const response = await fetch(oldAsset.url, { method: 'DELETE', headers: { Authorization: `Bearer ${githubToken}` } });
            if (!response.ok) throw new Error(`Could not replace draft asset ${name}.`);
        }
        const assetPath = path.join('release', name);
        await api(`${release.upload_url.split('{')[0]}?name=${encodeURIComponent(name)}`, {
            method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(fs.statSync(assetPath).size) },
            body: fs.createReadStream(assetPath), duplex: 'half',
        });
    }
    await api(release.url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draft: false, make_latest: 'true' }) });
    console.log(`Published ${tag}.`);
}

import { createHash, createPublicKey, verify } from 'node:crypto';
import { createReadStream } from 'node:fs';

export function isNewerVersion(next, current) {
    const parse = value => {
        if (!/^\d+\.\d+\.\d+$/.test(value)) throw new Error('Only stable x.y.z versions are supported.');
        return value.split('.').map(Number);
    };
    const a = parse(next), b = parse(current);
    for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
    return false;
}

export function verifyManifest(envelope, publicKey, arch) {
    if (typeof envelope?.payload !== 'string' || typeof envelope?.signature !== 'string') throw new Error('Invalid signed update manifest.');
    const payload = Buffer.from(envelope.payload, 'base64');
    const key = createPublicKey(publicKey);
    if (key.asymmetricKeyType !== 'ed25519' || !verify(null, payload, key, Buffer.from(envelope.signature, 'base64'))) throw new Error('Update signature is invalid. Nothing was installed.');
    const m = JSON.parse(payload.toString('utf8'));
    if (m.schema !== 1 || m.appId !== 'com.superapp.app' || m.arch !== arch ||
        !/^\d+\.\d+\.\d+$/.test(m.version) ||
        m.file !== `One-Punch-DevKit-${m.version}-${arch}-mac.zip` ||
        !/^[a-f0-9]{64}$/.test(m.sha256) || !Number.isSafeInteger(m.size) || m.size <= 0 || m.size > 2 * 1024 ** 3) throw new Error('Update manifest does not match this application/platform.');
    return m;
}

export async function sha256File(filePath) {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(filePath)) hash.update(chunk);
    return hash.digest('hex');
}

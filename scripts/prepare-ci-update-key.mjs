import fs from 'node:fs';
import { createPrivateKey, createPublicKey } from 'node:crypto';

const secret = process.env.UPDATE_SIGNING_PRIVATE_KEY;
const target = process.env.UPDATE_SIGNING_KEY_PATH;
if (!secret || !target) throw new Error('Configure the UPDATE_SIGNING_PRIVATE_KEY Actions secret and UPDATE_SIGNING_KEY_PATH.');
// Validate before writing anything; never print the secret or a crypto error containing it.
let pem;
try {
    const key = createPrivateKey(secret);
    if (key.asymmetricKeyType !== 'ed25519') throw new Error();
    const expected = createPublicKey(fs.readFileSync('assets/update-public.pem'));
    if (!createPublicKey(key).export({ type: 'spki', format: 'der' }).equals(expected.export({ type: 'spki', format: 'der' }))) throw new Error();
    pem = key.export({ type: 'pkcs8', format: 'pem' });
} catch {
    throw new Error('Signing secret is invalid or does not match assets/update-public.pem. Use the existing private key, not a new one.');
}
fs.writeFileSync(target, pem, { flag: 'wx', mode: 0o600 });
console.log('Existing Ed25519 signing key restored for this release job.');

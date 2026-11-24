import { generateKeyPairSync } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = path.join(os.homedir(), '.config/one-punch-devkit');
const privatePath = path.join(dir, 'update-private.pem');
const publicPath = new URL('../assets/update-public.pem', import.meta.url);
if (fs.existsSync(privatePath) || fs.existsSync(publicPath)) throw new Error('Update key already exists. Do not rotate it: installed clients trust the existing public key.');
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
fs.writeFileSync(privatePath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600, flag: 'wx' });
fs.writeFileSync(publicPath, publicKey.export({ type: 'spki', format: 'pem' }), { flag: 'wx' });
console.log(`Private key stored outside source: ${privatePath}\nBack it up securely. Never commit it. Public key: assets/update-public.pem`);

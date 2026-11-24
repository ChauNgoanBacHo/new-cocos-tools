export interface SignedUpdateManifest {
    schema: 1;
    appId: 'com.superapp.app';
    version: string;
    arch: string;
    file: string;
    sha256: string;
    size: number;
}
export function isNewerVersion(next: string, current: string): boolean;
export function verifyManifest(envelope: unknown, publicKey: string, arch: string): SignedUpdateManifest;
export function sha256File(filePath: string): Promise<string>;

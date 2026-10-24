import type { LocalAnimation, LocalSpineAsset } from "./types";
import { readSpineAnimations } from "./spineRenderer";

function normalizePath(value: string): string {
    return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

function directoryOf(value: string): string {
    const normalized = normalizePath(value);
    const index = normalized.lastIndexOf("/");
    return index < 0 ? "" : normalized.slice(0, index + 1);
}

function fileStem(value: string): string {
    const name = normalizePath(value).split("/").pop() || value;
    return name.replace(/\.(json|skel)$/i, "");
}

function readVarInt(bytes: Uint8Array, offset: number): { value: number; offset: number } {
    let value = 0;
    let shift = 0;
    while (offset < bytes.length && shift < 35) {
        const byte = bytes[offset];
        offset += 1;
        value |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) return { value, offset };
        shift += 7;
    }
    throw new Error("Invalid Spine binary header.");
}

function readBinaryString(bytes: Uint8Array, offset: number): { value: string; offset: number } {
    const lengthResult = readVarInt(bytes, offset);
    const byteLength = Math.max(lengthResult.value - 1, 0);
    const end = lengthResult.offset + byteLength;
    if (end > bytes.length) throw new Error("Invalid Spine binary string.");
    return {
        value: byteLength ? new TextDecoder().decode(bytes.slice(lengthResult.offset, end)) : "",
        offset: end,
    };
}

function binaryVersion(bytes: Uint8Array): string {
    const hash = readBinaryString(bytes, 0);
    return readBinaryString(bytes, hash.offset).value || "unknown";
}

function maxTimelineTime(value: unknown): number {
    if (Array.isArray(value)) {
        return value.reduce((max, item) => Math.max(max, maxTimelineTime(item)), 0);
    }
    if (!value || typeof value !== "object") return 0;

    let max = 0;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        if ((key === "time" || key === "duration") && typeof child === "number") {
            max = Math.max(max, child);
        } else {
            max = Math.max(max, maxTimelineTime(child));
        }
    }
    return max;
}

function readAtlasPages(atlasText: string): string[] {
    const lines = atlasText.split(/\r?\n/);
    const pages: string[] = [];
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index].trim();
        const next = lines[index + 1]?.trim() || "";
        if (line && /\.(png|webp|jpe?g)$/i.test(line) && next.startsWith("size:")) {
            pages.push(normalizePath(line));
        }
    }
    return pages;
}

function animationList(json: Record<string, unknown>): LocalAnimation[] {
    const animations = json.animations;
    if (!animations || typeof animations !== "object" || Array.isArray(animations)) return [];
    return Object.entries(animations as Record<string, unknown>).map(([name, timeline]) => ({
        name,
        duration: Math.max(maxTimelineTime(timeline), 0.01),
    }));
}

export async function scanSpineFiles(fileList: FileList | File[]): Promise<LocalSpineAsset[]> {
    const files = Array.from(fileList);
    const byPath = new Map<string, File>();
    for (const file of files) {
        const relativePath = normalizePath(file.webkitRelativePath || file.name);
        byPath.set(relativePath, file);
    }

    const results: LocalSpineAsset[] = [];
    for (const [sourcePath, sourceFile] of byPath) {
        const isJson = sourcePath.toLowerCase().endsWith(".json");
        const isBinary = sourcePath.toLowerCase().endsWith(".skel");
        if (!isJson && !isBinary) continue;

        let skeletonData: Record<string, unknown> | Uint8Array;
        let version = "unknown";
        let animations: LocalAnimation[] = [];
        if (isJson) {
            try {
                skeletonData = JSON.parse(await sourceFile.text()) as Record<string, unknown>;
            } catch {
                continue;
            }
            if (!skeletonData.skeleton || !skeletonData.bones || !skeletonData.slots || !skeletonData.animations) continue;
            const skeleton = skeletonData.skeleton as Record<string, unknown>;
            version = typeof skeleton.spine === "string" ? skeleton.spine : "unknown";
            animations = animationList(skeletonData);
        } else {
            skeletonData = new Uint8Array(await sourceFile.arrayBuffer());
            try {
                version = binaryVersion(skeletonData);
            } catch {
                continue;
            }
        }

        const directory = directoryOf(sourcePath);
        const stem = fileStem(sourcePath);
        const atlasPath = `${directory}${stem}.atlas`;
        const atlasFile = byPath.get(atlasPath);
        if (!atlasFile) continue;

        const atlasText = await atlasFile.text();
        const pageFiles = new Map<string, File>();
        for (const pageName of readAtlasPages(atlasText)) {
            const exact = byPath.get(`${directory}${pageName}`);
            const fallback = files.find((file) => file.name === pageName.split("/").pop());
            const pageFile = exact || fallback;
            if (pageFile) pageFiles.set(pageName, pageFile);
        }

        const asset: LocalSpineAsset = {
            id: sourcePath,
            spineName: stem,
            relativeJsonPath: sourcePath,
            version,
            format: isBinary ? "binary" : "json",
            skeletonData,
            atlasText,
            pageFiles,
            animations,
        };
        if (isBinary) {
            try {
                asset.animations = await readSpineAnimations(asset);
            } catch {
                continue;
            }
        }
        if (asset.animations.length) results.push(asset);
    }

    return results.sort((a, b) => a.spineName.localeCompare(b.spineName));
}

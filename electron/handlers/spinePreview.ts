import { ipcMain } from "electron";
import fs from "fs";
import path from "path";

interface SpineResult {
    fileName: string;
    slots: number;
    atlasPages: number;
    estDrawcall: number;
    // Asset paths (absolute) for the renderer to preview via file:// URLs
    jsonPath: string;
    atlasPath: string;
    pngPaths: string[];
    // Spine metadata
    version: string;
    animations: string[];
    skins: string[];
}

export function registerSpinePreviewHandler() {
    ipcMain.handle("spine-preview", async (_event, sourceDir: string) => {
        try {
            function walkJsonFiles(dir: string): string[] {
                const results: string[] = [];
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        results.push(...walkJsonFiles(fullPath));
                    } else if (entry.name.endsWith(".json")) {
                        results.push(fullPath);
                    }
                }
                return results;
            }

            function readAtlasPngs(atlasPath: string): string[] {
                if (!fs.existsSync(atlasPath)) return [];
                const content = fs.readFileSync(atlasPath, "utf-8");
                const lines = content.split("\n");
                const pngs: string[] = [];
                for (const line of lines) {
                    if (line.trim().endsWith(".png")) {
                        pngs.push(line.trim());
                    }
                }
                return pngs;
            }

            const jsonFiles = walkJsonFiles(sourceDir);
            const results: SpineResult[] = [];

            for (const filePath of jsonFiles) {
                const content = fs.readFileSync(filePath, "utf-8");
                let data: Record<string, unknown>;

                try {
                    data = JSON.parse(content);
                } catch {
                    continue;
                }

                if (!data.skeleton || !data.bones || !data.slots) continue;

                const slots = data.slots as Array<Record<string, unknown>>;
                const slotsWithAttachment = slots.filter(s => s.attachment).length;

                const baseName = path.basename(filePath, ".json");
                const dir = path.dirname(filePath);
                const atlasPath = path.join(dir, baseName + ".atlas");
                const pngNames = readAtlasPngs(atlasPath);
                const atlasPages = Math.max(pngNames.length, 1);
                const pngPaths = pngNames.map(name => path.join(dir, name));

                const estDrawcall = Math.max(atlasPages, Math.ceil(slotsWithAttachment / 8));

                // Spine metadata for preview
                const skeleton = data.skeleton as Record<string, unknown> | undefined;
                const version = (skeleton && typeof skeleton.spine === "string") ? skeleton.spine : "unknown";
                const animationsObj = data.animations as Record<string, unknown> | undefined;
                const animations = animationsObj ? Object.keys(animationsObj) : [];
                // Spine 3.x: skins is an object keyed by skin name; 4.x: array of { name }
                const skinsRaw = data.skins;
                let skins: string[] = [];
                if (Array.isArray(skinsRaw)) {
                    skins = skinsRaw.map(s => (s as Record<string, unknown>).name as string).filter(Boolean);
                } else if (skinsRaw && typeof skinsRaw === "object") {
                    skins = Object.keys(skinsRaw);
                }

                results.push({
                    fileName: filePath.replace(sourceDir + "/", ""),
                    slots: slotsWithAttachment,
                    atlasPages,
                    estDrawcall,
                    jsonPath: filePath,
                    atlasPath,
                    pngPaths,
                    version,
                    animations,
                    skins,
                });
            }

            return {
                results,
                exitCode: 0,
            };
        } catch (error: unknown) {
            return {
                results: [],
                exitCode: 2,
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    });
}

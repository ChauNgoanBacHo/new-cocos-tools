import { ipcMain } from "electron";
import fs from "fs";
import path from "path";

interface UnusedEntry {
    label: string;
    detail?: string;
    files: string[];
}

interface AssetSection {
    key: string;
    title: string;
    found: number;
    used: number;
    skipped: string[];
    unused: UnusedEntry[];
}

export function registerCheckAssetsHandler() {
    ipcMain.handle("check-assets", async (_event, sourceDir: string) => {
        try {
            const ignoredDirs = new Set([
                ".git",
                "build",
                "dist",
                "library",
                "local",
                "node_modules",
                "release",
                "temp",
            ]);

            function walkFiles(dir: string, ext: string): string[] {
                const results: string[] = [];
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        if (ignoredDirs.has(entry.name)) continue;
                        results.push(...walkFiles(fullPath, ext));
                    } else if (entry.name.endsWith(ext)) {
                        results.push(fullPath);
                    }
                }
                return results;
            }

            function walkMultiExt(dir: string, exts: string[]): string[] {
                const results: string[] = [];
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        if (ignoredDirs.has(entry.name)) continue;
                        results.push(...walkMultiExt(fullPath, exts));
                    } else if (exts.some(ext => entry.name.endsWith(ext))) {
                        results.push(fullPath);
                    }
                }
                return results;
            }

            function relativeToSource(filePath: string): string {
                return path.relative(sourceDir, filePath);
            }

            const base64KeyChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

            function compressUuid(uuid: string, reservedLength: 2 | 5): string | null {
                const cleanUuid = uuid.replace(/-/g, "").toLowerCase();
                if (!/^[0-9a-f]{32}$/.test(cleanUuid)) return null;

                let compressed = cleanUuid.slice(0, reservedLength);
                for (let i = reservedLength; i < 32; i += 3) {
                    const chunk = cleanUuid.slice(i, i + 3);
                    if (chunk.length !== 3) return null;

                    const value = parseInt(chunk, 16);
                    compressed += base64KeyChars[value >> 6];
                    compressed += base64KeyChars[value & 0x3f];
                }

                return compressed;
            }

            function getUuidRefKeys(uuid: string): string[] {
                const normalizedUuid = uuid.toLowerCase();
                const dashlessUuid = normalizedUuid.replace(/-/g, "");
                const keys = new Set<string>([uuid, normalizedUuid, dashlessUuid]);
                const compressedUuid = compressUuid(normalizedUuid, 5);
                const minCompressedUuid = compressUuid(normalizedUuid, 2);

                if (compressedUuid) keys.add(compressedUuid);
                if (minCompressedUuid) keys.add(minCompressedUuid);

                return Array.from(keys);
            }

            function hasUuidRef(content: string, uuid: string): boolean {
                return getUuidRefKeys(uuid).some((key) => content.includes(key));
            }

            function collectMetaUuids(metaData: unknown): string[] {
                const uuids = new Set<string>();
                if (!metaData || typeof metaData !== "object") return [];

                const rootMeta = metaData as { uuid?: unknown; subMetas?: unknown };
                if (typeof rootMeta.uuid === "string") uuids.add(rootMeta.uuid);

                if (rootMeta.subMetas && typeof rootMeta.subMetas === "object") {
                    for (const subMeta of Object.values(rootMeta.subMetas as Record<string, unknown>)) {
                        if (!subMeta || typeof subMeta !== "object") continue;
                        const subUuid = (subMeta as { uuid?: unknown }).uuid;
                        if (typeof subUuid === "string") uuids.add(subUuid);
                    }
                }

                return Array.from(uuids);
            }

            function hasAnyUuidRef(content: string, uuids: string[]): boolean {
                return uuids.some((uuid) => hasUuidRef(content, uuid));
            }

            function isDeclarationFile(filePath: string): boolean {
                return filePath.endsWith(".d.ts");
            }

            function normalizeFilePath(filePath: string): string {
                return path.normalize(filePath);
            }

            const mp3Files = walkFiles(sourceDir, ".mp3");
            const pngFiles = walkFiles(sourceDir, ".png");
            const animFiles = walkFiles(sourceDir, ".anim");
            const mtlFiles = walkFiles(sourceDir, ".mtl");
            const atlasFiles = walkFiles(sourceDir, ".atlas");
            const tsFiles = walkFiles(sourceDir, ".ts").filter((file) => !isDeclarationFile(file));
            const tsMetaFiles = walkFiles(sourceDir, ".ts.meta");
            const tsCandidatePaths = Array.from(new Set([
                ...tsFiles,
                ...tsMetaFiles.map((file) => file.slice(0, -".meta".length)),
            ])).filter((file) => !isDeclarationFile(file));
            const tsCandidateSet = new Set(tsCandidatePaths.map(normalizeFilePath));
            const sceneAndPrefabFiles = walkMultiExt(sourceDir, [".scene", ".prefab"]);
            const prefabFiles = walkFiles(sourceDir, ".prefab");

            function resolveTsImport(fromFile: string, importPath: string): string | null {
                if (!importPath.startsWith(".")) return null;

                const basePath = path.resolve(path.dirname(fromFile), importPath);
                const candidates = [
                    basePath,
                    `${basePath}.ts`,
                    path.join(basePath, "index.ts"),
                ].map(normalizeFilePath);

                return candidates.find((candidate) => tsCandidateSet.has(candidate) && fs.existsSync(candidate)) ?? null;
            }

            function getTsImports(filePath: string): string[] {
                if (!fs.existsSync(filePath)) return [];

                const content = fs.readFileSync(filePath, "utf-8");
                const importPaths = new Set<string>();
                const importPatterns = [
                    /\bimport\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?["']([^"']+)["']/g,
                    /\bexport\s+(?:type\s+)?[^'"]*?\s+from\s+["']([^"']+)["']/g,
                    /\brequire\(\s*["']([^"']+)["']\s*\)/g,
                ];

                for (const pattern of importPatterns) {
                    let match: RegExpExecArray | null;
                    while ((match = pattern.exec(content)) !== null) {
                        importPaths.add(match[1]);
                    }
                }

                return Array.from(importPaths)
                    .map((importPath) => resolveTsImport(filePath, importPath))
                    .filter((resolvedPath): resolvedPath is string => Boolean(resolvedPath));
            }

            const prefabUuidMap: Record<string, string> = {};
            const prefabContentMap: Record<string, string> = {};

            for (const prefabPath of prefabFiles) {
                const metaPath = prefabPath + ".meta";
                if (!fs.existsSync(metaPath)) continue;
                const metaData = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
                if (metaData.uuid) {
                    prefabUuidMap[metaData.uuid] = prefabPath;
                    prefabContentMap[metaData.uuid] = fs.readFileSync(prefabPath, "utf-8");
                }
            }

            let sceneContent = "";
            for (const file of sceneAndPrefabFiles) {
                if (file.endsWith(".scene")) {
                    sceneContent += fs.readFileSync(file, "utf-8") + "\n";
                }
            }

            function isPrefabUsed(uuid: string, visited: Set<string>): boolean {
                if (visited.has(uuid)) return false;
                visited.add(uuid);

                if (hasUuidRef(sceneContent, uuid)) return true;

                for (const [otherUuid, content] of Object.entries(prefabContentMap)) {
                    if (otherUuid === uuid) continue;
                    if (hasUuidRef(content, uuid)) {
                        if (isPrefabUsed(otherUuid, visited)) return true;
                    }
                }

                return false;
            }

            function isReferencedByUsedPrefab(uuids: string[]): boolean {
                return Object.entries(prefabContentMap).some(([prefabUuid, content]) =>
                    hasAnyUuidRef(content, uuids) && isPrefabUsed(prefabUuid, new Set())
                );
            }

            const usedMtlContent: string[] = [];
            const mtlUuidMap: Record<string, string[]> = {};

            for (const mtlPath of mtlFiles) {
                const metaPath = mtlPath + ".meta";
                if (!fs.existsSync(metaPath)) continue;

                const metaData = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
                const uuids = collectMetaUuids(metaData);
                if (uuids.length === 0) continue;

                mtlUuidMap[mtlPath] = uuids;
                if (hasAnyUuidRef(sceneContent, uuids) || isReferencedByUsedPrefab(uuids)) {
                    usedMtlContent.push(fs.readFileSync(mtlPath, "utf-8"));
                    usedMtlContent.push(fs.readFileSync(metaPath, "utf-8"));
                }
            }

            function isReferencedByUsedMaterial(uuids: string[]): boolean {
                return usedMtlContent.some((content) => hasAnyUuidRef(content, uuids));
            }

            // UUIDs referenced from .anim files (extracted the same way for both
            // the broad and the "live" reference sets below).
            let animRefContent = "";
            for (const file of animFiles) {
                try {
                    const buf = fs.readFileSync(file);
                    const text = buf.toString("utf-8");
                    if (text.startsWith("{") || text.startsWith("[")) {
                        animRefContent += text + "\n";
                    } else {
                        const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
                        const matches = text.match(uuidPattern);
                        if (matches) {
                            animRefContent += matches.join("\n") + "\n";
                        }
                    }
                } catch { /* skip unreadable files */ }
            }

            // "Live" reference content: a reference only keeps an asset alive if it
            // comes from something that is itself used. Scenes are always live;
            // prefabs and materials count only when used. So a png referenced solely
            // by an unused prefab is still flagged unused. Anim content is treated as
            // a live root here (anim usage is checked separately).
            let liveRefContent = sceneContent;
            for (const [prefabUuid, content] of Object.entries(prefabContentMap)) {
                if (isPrefabUsed(prefabUuid, new Set())) {
                    liveRefContent += content + "\n";
                }
            }
            for (const content of usedMtlContent) {
                liveRefContent += content + "\n";
            }
            liveRefContent += animRefContent;

            const atlasFilesByDir = new Map<string, string[]>();
            for (const atlasPath of atlasFiles) {
                const atlasDir = normalizeFilePath(path.dirname(atlasPath));
                atlasFilesByDir.set(atlasDir, [...(atlasFilesByDir.get(atlasDir) ?? []), atlasPath]);
            }

            function atlasReferencesTexture(atlasPath: string, textureFileName: string): boolean {
                try {
                    return fs.readFileSync(atlasPath, "utf-8")
                        .split(/\r?\n/)
                        .some((line) => line.trim() === textureFileName);
                } catch {
                    return false;
                }
            }

            function hasUsedMetaRef(metaPath: string): boolean {
                if (!fs.existsSync(metaPath)) return false;

                const metaData = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
                const uuids = collectMetaUuids(metaData);
                return uuids.length > 0 && (hasAnyUuidRef(liveRefContent, uuids) || isReferencedByUsedMaterial(uuids));
            }

            function isTextureReferencedBySiblingAtlas(pngPath: string): boolean {
                const pngDir = normalizeFilePath(path.dirname(pngPath));
                const textureFileName = path.basename(pngPath);
                const siblingAtlasFiles = atlasFilesByDir.get(pngDir) ?? [];

                return siblingAtlasFiles.some((atlasPath) => atlasReferencesTexture(atlasPath, textureFileName));
            }

            function isTextureReferencedByUsedAtlas(pngPath: string): boolean {
                const pngDir = normalizeFilePath(path.dirname(pngPath));
                const textureFileName = path.basename(pngPath);
                const siblingAtlasFiles = atlasFilesByDir.get(pngDir) ?? [];

                return siblingAtlasFiles.some((atlasPath) => {
                    if (!atlasReferencesTexture(atlasPath, textureFileName)) return false;

                    const atlasBasePath = atlasPath.slice(0, -".atlas".length);
                    return hasUsedMetaRef(`${atlasBasePath}.json.meta`) || hasUsedMetaRef(`${atlasPath}.meta`);
                });
            }

            const sections: AssetSection[] = [];

            // --- MP3 Check ---
            const mp3Section: AssetSection = { key: "mp3", title: "MP3 Assets", found: mp3Files.length, used: 0, skipped: [], unused: [] };
            for (const mp3Path of mp3Files) {
                const metaPath = mp3Path + ".meta";
                const relativePath = relativeToSource(mp3Path);

                if (!fs.existsSync(metaPath)) {
                    mp3Section.skipped.push(`${relativePath} (no .meta)`);
                    continue;
                }

                const metaData = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
                const uuid = metaData.uuid;

                if (!uuid) {
                    mp3Section.skipped.push(`${relativePath} (no uuid)`);
                    continue;
                }

                if (hasUuidRef(liveRefContent, uuid)) {
                    mp3Section.used++;
                } else {
                    mp3Section.unused.push({ label: relativePath, files: [mp3Path, metaPath] });
                }
            }
            sections.push(mp3Section);

            // --- PNG Check ---
            const pngSection: AssetSection = { key: "png", title: "PNG Assets", found: pngFiles.length, used: 0, skipped: [], unused: [] };
            for (const pngPath of pngFiles) {
                const metaPath = pngPath + ".meta";
                const relativePath = relativeToSource(pngPath);
                const pngDir = path.dirname(pngPath);
                const pngName = path.basename(pngPath, ".png");

                if (!fs.existsSync(metaPath)) {
                    pngSection.skipped.push(`${relativePath} (no .meta)`);
                    continue;
                }

                const metaData = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
                const uuids = collectMetaUuids(metaData);
                const uuid = metaData.uuid;

                if (uuids.length === 0) {
                    pngSection.skipped.push(`${relativePath} (no uuid)`);
                    continue;
                }

                const isSpriteFrame = metaData.userData?.type === "sprite-frame";

                const fntPath = path.join(pngDir, pngName + ".fnt");
                const fntMetaPath = fntPath + ".meta";

                if (fs.existsSync(fntPath) && fs.existsSync(fntMetaPath)) {
                    const fntMetaData = JSON.parse(fs.readFileSync(fntMetaPath, "utf-8"));
                    const fntUuids = collectMetaUuids(fntMetaData);

                    if (fntUuids.length > 0 && (hasAnyUuidRef(liveRefContent, fntUuids) || isReferencedByUsedMaterial(fntUuids))) {
                        pngSection.used++;
                    } else {
                        pngSection.unused.push({
                            label: `[Font] ${relativePath}`,
                            detail: `${pngName}.fnt`,
                        files: [pngPath, metaPath, fntPath, fntMetaPath],
                        });
                    }
                } else if (isSpriteFrame) {
                    if (hasAnyUuidRef(liveRefContent, uuids) || isReferencedByUsedMaterial(uuids) || isTextureReferencedBySiblingAtlas(pngPath)) {
                        pngSection.used++;
                    } else {
                        pngSection.unused.push({ label: relativePath, files: [pngPath, metaPath] });
                    }
                } else {
                    const jsonPath = path.join(pngDir, pngName + ".json");
                    const jsonMetaPath = jsonPath + ".meta";

                    if (fs.existsSync(jsonPath) && fs.existsSync(jsonMetaPath)) {
                        const jsonMetaData = JSON.parse(fs.readFileSync(jsonMetaPath, "utf-8"));
                        const jsonUuids = collectMetaUuids(jsonMetaData);

                        if (
                            (jsonUuids.length > 0 && (hasAnyUuidRef(liveRefContent, jsonUuids) || isReferencedByUsedMaterial(jsonUuids)))
                            || isTextureReferencedByUsedAtlas(pngPath)
                        ) {
                            pngSection.used++;
                        } else {
                            const relDir = relativeToSource(pngDir);
                            const filesToRemove = [pngPath, metaPath, jsonPath, jsonMetaPath];
                            const atlasPath = path.join(pngDir, pngName + ".atlas");
                            const atlasMetaPath = atlasPath + ".meta";
                            if (fs.existsSync(atlasPath)) filesToRemove.push(atlasPath);
                            if (fs.existsSync(atlasMetaPath)) filesToRemove.push(atlasMetaPath);
                            pngSection.unused.push({
                                label: `[Spine] ${relDir}/`,
                                detail: `${pngName}.png, ${pngName}.json, ${pngName}.atlas`,
                                files: filesToRemove,
                            });
                        }
                    } else {
                        if (hasAnyUuidRef(liveRefContent, uuids) || isReferencedByUsedMaterial(uuids) || isTextureReferencedBySiblingAtlas(pngPath)) {
                            pngSection.used++;
                        } else {
                            pngSection.unused.push({ label: relativePath, files: [pngPath, metaPath] });
                        }
                    }
                }
            }
            sections.push(pngSection);

            // --- Anim Check ---
            const animSection: AssetSection = { key: "anim", title: "Anim Assets", found: animFiles.length, used: 0, skipped: [], unused: [] };
            for (const animPath of animFiles) {
                const metaPath = animPath + ".meta";
                const relativePath = relativeToSource(animPath);

                if (!fs.existsSync(metaPath)) {
                    animSection.skipped.push(`${relativePath} (no .meta)`);
                    continue;
                }

                const metaData = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
                const uuid = metaData.uuid;

                if (!uuid) {
                    animSection.skipped.push(`${relativePath} (no uuid)`);
                    continue;
                }

                if (hasUuidRef(liveRefContent, uuid)) {
                    animSection.used++;
                } else {
                    animSection.unused.push({ label: relativePath, files: [animPath, metaPath] });
                }
            }
            sections.push(animSection);

            // --- Material Check ---
            const mtlSection: AssetSection = { key: "mtl", title: "Material Assets", found: mtlFiles.length, used: 0, skipped: [], unused: [] };
            for (const mtlPath of mtlFiles) {
                const metaPath = mtlPath + ".meta";
                const relativePath = relativeToSource(mtlPath);

                if (!fs.existsSync(metaPath)) {
                    mtlSection.skipped.push(`${relativePath} (no .meta)`);
                    continue;
                }

                const metaData = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
                const uuids = mtlUuidMap[mtlPath] ?? collectMetaUuids(metaData);

                if (uuids.length === 0) {
                    mtlSection.skipped.push(`${relativePath} (no uuid)`);
                    continue;
                }

                if (hasAnyUuidRef(sceneContent, uuids) || isReferencedByUsedPrefab(uuids)) {
                    mtlSection.used++;
                } else {
                    mtlSection.unused.push({ label: relativePath, files: [mtlPath, metaPath] });
                }
            }
            sections.push(mtlSection);

            // --- Prefab Check (recursive) ---
            const prefabSection: AssetSection = { key: "prefab", title: "Prefab Assets", found: prefabFiles.length, used: 0, skipped: [], unused: [] };
            for (const [uuid, prefabPath] of Object.entries(prefabUuidMap)) {
                const relativePath = relativeToSource(prefabPath);
                const metaPath = prefabPath + ".meta";

                if (isPrefabUsed(uuid, new Set())) {
                    prefabSection.used++;
                } else {
                    prefabSection.unused.push({ label: relativePath, files: [prefabPath, metaPath] });
                }
            }
            sections.push(prefabSection);

            // --- TypeScript Script Check ---
            const tsSection: AssetSection = { key: "ts", title: "TypeScript Assets", found: tsCandidatePaths.length, used: 0, skipped: [], unused: [] };

            const usedTsPaths = new Set<string>();

            for (const tsPath of tsCandidatePaths) {
                const metaPath = tsPath + ".meta";
                if (!fs.existsSync(metaPath) || !fs.existsSync(tsPath)) continue;

                const metaData = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
                const uuid = metaData.uuid;
                if (!uuid) continue;

                const usedInScene = hasUuidRef(sceneContent, uuid);
                const usedInScenePrefab = Object.entries(prefabContentMap).some(([prefabUuid, content]) =>
                    hasUuidRef(content, uuid) && isPrefabUsed(prefabUuid, new Set())
                );

                if (usedInScene || usedInScenePrefab) {
                    usedTsPaths.add(normalizeFilePath(tsPath));
                }
            }

            const pendingTsPaths = [...usedTsPaths];
            while (pendingTsPaths.length > 0) {
                const currentPath = pendingTsPaths.pop();
                if (!currentPath) continue;

                for (const importedPath of getTsImports(currentPath)) {
                    if (usedTsPaths.has(importedPath)) continue;
                    usedTsPaths.add(importedPath);
                    pendingTsPaths.push(importedPath);
                }
            }

            for (const tsPath of tsCandidatePaths) {
                const metaPath = tsPath + ".meta";
                const relativePath = relativeToSource(tsPath);

                if (!fs.existsSync(metaPath)) {
                    tsSection.unused.push({ label: `${relativePath} (no .meta)`, files: [tsPath] });
                    continue;
                }

                if (!fs.existsSync(tsPath)) {
                    tsSection.unused.push({ label: `${relativePath} (missing .ts)`, files: [metaPath] });
                    continue;
                }

                const metaData = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
                const uuid = metaData.uuid;

                if (!uuid) {
                    tsSection.skipped.push(`${relativePath} (no uuid)`);
                    continue;
                }

                if (usedTsPaths.has(normalizeFilePath(tsPath))) {
                    tsSection.used++;
                } else {
                    tsSection.unused.push({ label: relativePath, files: [tsPath, metaPath] });
                }
            }
            sections.push(tsSection);

            const totalUnused = sections.reduce((sum, s) => sum + s.unused.length, 0);
            const totalUsed = sections.reduce((sum, s) => sum + s.used, 0);

            return {
                sections,
                totalUnused,
                totalUsed,
                exitCode: 0,
            };
        } catch (error: unknown) {
            return {
                sections: [],
                totalUnused: 0,
                totalUsed: 0,
                exitCode: 2,
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    });

    // Delete a specific set of files. Every path must resolve inside sourceDir,
    // otherwise it is rejected — this guards against deleting outside the scanned root.
    ipcMain.handle("delete-assets", async (_event, sourceDir: string, files: string[]) => {
        const deleted: string[] = [];
        const failed: { file: string; error: string }[] = [];

        const resolvedRoot = path.resolve(sourceDir);
        for (const filePath of files) {
            try {
                const resolved = path.resolve(filePath);
                const rel = path.relative(resolvedRoot, resolved);
                if (rel.startsWith("..") || path.isAbsolute(rel)) {
                    failed.push({ file: filePath, error: "outside source folder" });
                    continue;
                }
                if (fs.existsSync(resolved)) {
                    fs.unlinkSync(resolved);
                    deleted.push(filePath);
                }
            } catch (error: unknown) {
                failed.push({ file: filePath, error: error instanceof Error ? error.message : "Unknown error" });
            }
        }

        return {
            deleted,
            failed,
            exitCode: failed.length > 0 ? 2 : 0,
        };
    });
}

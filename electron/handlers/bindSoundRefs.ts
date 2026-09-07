import { ipcMain, dialog } from "electron";
import fs from "fs";
import path from "path";

export function registerBindSoundRefsHandler() {
    ipcMain.handle("select-scene-file", async () => {
        const result = await dialog.showOpenDialog({
            properties: ["openFile"],
            filters: [{ name: "Cocos Scene", extensions: ["scene", "fire"] }],
        });
        if (result.canceled || result.filePaths.length === 0) return null;
        return result.filePaths[0];
    });

    ipcMain.handle("bind-sound-refs", async (_event, soundDir: string, sceneFilePath: string, componentHash: string) => {
        try {
            function walkMp3Files(dir: string): string[] {
                const results: string[] = [];
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        results.push(...walkMp3Files(fullPath));
                    } else if (entry.name.endsWith(".mp3")) {
                        results.push(fullPath);
                    }
                }
                return results;
            }

            const mp3Files = walkMp3Files(soundDir);
            const lines: string[] = [];

            interface SfxEntry {
                soundId: string;
                uuid: string;
            }

            const sfxEntries: SfxEntry[] = [];

            lines.push(`--- Sound Refs ---`);

            for (const mp3Path of mp3Files) {
                const fileName = path.basename(mp3Path, ".mp3");
                let key = fileName;
                const prefixMatch = key.match(/^\d+_/);
                if (prefixMatch) {
                    key = key.slice(prefixMatch[0].length);
                }
                key = key.toUpperCase();

                if (key.startsWith("BGM")) {
                    lines.push(`  SKIP BGM: ${fileName}`);
                    continue;
                }

                const metaPath = mp3Path + ".meta";
                if (!fs.existsSync(metaPath)) {
                    lines.push(`  SKIP: ${fileName} (no .meta file)`);
                    continue;
                }
                const metaData = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
                const uuid = metaData.uuid;
                if (uuid) {
                    sfxEntries.push({ soundId: key, uuid });
                    lines.push(`  ${fileName} → ${key} (${uuid})`);
                }
            }

            if (sfxEntries.length === 0) {
                return {
                    stdout: "No SFX UUIDs found from .meta files",
                    stderr: "",
                    exitCode: 1,
                };
            }

            const sceneContent = fs.readFileSync(sceneFilePath, "utf-8");
            const sceneData = JSON.parse(sceneContent) as Record<string, unknown>[];

            let nextId = sceneData.length;
            let componentIndex = -1;

            for (let i = 0; i < sceneData.length; i++) {
                const obj = sceneData[i];
                if (obj.__type__ === componentHash && (obj as Record<string, unknown>).sfxList !== undefined) {
                    componentIndex = i;
                    break;
                }
            }

            if (componentIndex === -1) {
                lines.push(`\nERROR: Sound component with sfxList not found in scene`);
                return {
                    stdout: lines.join("\n"),
                    stderr: "",
                    exitCode: 1,
                };
            }

            const component = sceneData[componentIndex] as Record<string, unknown>;
            const newSfxRefs: { __id__: number }[] = [];

            for (const entry of sfxEntries) {
                const newObj = {
                    __type__: "CustomAudioClipModule",
                    isMusic: false,
                    isEffect: true,
                    destroyedOnSwitchMode: false,
                    soundId: entry.soundId,
                    maxCount: 1,
                    ignoreCheckMaxChannel: false,
                    audioFile: {
                        __uuid__: entry.uuid,
                        __expectedType__: "cc.AudioClip",
                    },
                    audioSource: null,
                };
                sceneData.push(newObj as unknown as Record<string, unknown>);
                newSfxRefs.push({ __id__: nextId });
                nextId++;
            }

            component.sfxList = newSfxRefs;

            fs.writeFileSync(sceneFilePath, JSON.stringify(sceneData, null, 2), "utf-8");
            lines.push(`\nBound ${sfxEntries.length} SFX refs to scene (sfxList)`);

            return {
                stdout: lines.join("\n"),
                stderr: "",
                exitCode: 0,
            };
        } catch (error: unknown) {
            return {
                stdout: "",
                stderr: error instanceof Error ? error.message : "Unknown error",
                exitCode: 2,
            };
        }
    });
}

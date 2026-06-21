import { ipcMain } from "electron";
import fs from "fs";
import path from "path";

export function registerCreateSoundHandler() {
    ipcMain.handle("create-sound-config", async (_event, soundDir: string, outputDir: string, soundFileName: string, overwrite: boolean, excludeList?: string[]) => {
        try {
            const normalizedExcludeList = new Set(
                Array.isArray(excludeList)
                    ? excludeList.map((item) => String(item || "").trim().toUpperCase()).filter(Boolean)
                    : [],
            );

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

            const allFiles = walkMp3Files(soundDir);
            const lines: string[] = [];

            lines.push(`--- SOUND_CONFIG ---`);

            const configLines: string[] = [];
            configLines.push("export const SOUND_CONFIG = {");

            for (const filePath of allFiles) {
                const file = path.basename(filePath);
                let key = file.replace(".mp3", "");
                const prefixMatch = key.match(/^\d+_/);
                if (prefixMatch) {
                    key = key.slice(prefixMatch[0].length);
                }
                key = key.toUpperCase();
                if (normalizedExcludeList.has(key)) {
                    lines.push(`  SKIP: ${file} ${key}`);
                    continue;
                }
                configLines.push(`    ${key}: '${key}',`);
                lines.push(`  ${file} ${key}`);
            }

            configLines.push("};");

            let writeStatus = "";
            if (overwrite) {
                fs.mkdirSync(outputDir, { recursive: true });
                const outputPath = path.join(outputDir, soundFileName);
                fs.writeFileSync(outputPath, configLines.join("\n"), "utf-8");
                writeStatus = `Generated: ${soundFileName}`;
            }

            const output = `Found ${allFiles.length} mp3 files\n\n` + lines.join("\n") + "\n\n" + writeStatus;

            return {
                stdout: output,
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

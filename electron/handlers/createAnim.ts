import { ipcMain } from "electron";
import fs from "fs";
import path from "path";

export function registerCreateAnimHandler() {
    ipcMain.handle("create-anim-config", async (_event, spineDir: string, outputDir: string, animFileName: string, timeFileName: string, overwrite: boolean) => {
        try {
            function getAnimationDuration(obj: unknown): number {
                let maxTime = 0;
                function scan(data: unknown): void {
                    if (data && typeof data === "object" && !Array.isArray(data)) {
                        for (const v of Object.values(data as Record<string, unknown>)) {
                            scan(v);
                        }
                    } else if (Array.isArray(data)) {
                        for (const item of data) {
                            if (item && typeof item === "object" && "time" in item) {
                                const t = (item as Record<string, number>).time || 0;
                                if (t > maxTime) maxTime = t;
                            }
                            scan(item);
                        }
                    }
                }
                scan(obj);
                return Math.round(maxTime * 1000) / 1000;
            }

            function toConstName(filename: string, suffix: string): string {
                let name = filename.replace(/\.json$/i, "").toUpperCase();
                const prefix = name.match(/^\d+_/);
                if (prefix) {
                    name = name.slice(prefix[0].length);
                }
                name = name + suffix;
                if (/^\d/.test(name)) {
                    name = "_" + name;
                }
                return name;
            }

            function walkJsonFiles(dir: string): string[] {
                const files: string[] = [];
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        files.push(...walkJsonFiles(fullPath));
                    } else if (entry.name.endsWith(".json")) {
                        files.push(fullPath);
                    }
                }
                return files;
            }

            const jsonFiles = walkJsonFiles(spineDir);
            const lines: string[] = [];
            const timeLines: string[] = [];
            const animLines: string[] = [];
            let foundTime = false;
            let foundAnim = false;

            for (const filePath of jsonFiles) {
                const fileName = path.basename(filePath);
                const content = fs.readFileSync(filePath, "utf-8");
                let data: Record<string, unknown>;

                try {
                    data = JSON.parse(content);
                } catch {
                    lines.push(`--- ${fileName} ---`);
                    lines.push(`  ERROR: Invalid JSON`);
                    continue;
                }

                const animations = data.animations as Record<string, unknown> | undefined;
                if (!animations || Object.keys(animations).length === 0) {
                    lines.push(`--- ${fileName} ---`);
                    lines.push(`  No animations found`);
                    continue;
                }

                lines.push(`--- ${fileName} ---`);

                const timeConst = toConstName(fileName, "_TIME");
                const animConst = toConstName(fileName, "_ANIM");
                const animResults: Record<string, number> = {};

                for (const [animName, animData] of Object.entries(animations)) {
                    const duration = getAnimationDuration(animData);
                    const key = animName.toUpperCase();
                    animResults[key] = duration;
                    lines.push(`  ${key}: ${duration}s`);
                }

                const timeKeys = Object.entries(animResults);
                if (timeKeys.length === 1) {
                    timeLines.push(`export const ${timeConst} = ${timeKeys[0][1]};\n\n`);
                } else {
                    timeLines.push(`export const ${timeConst} = {\n`);
                    for (const [k, v] of timeKeys) {
                        timeLines.push(`    ${k}: ${v},\n`);
                    }
                    timeLines.push(`};\n\n`);
                }
                foundTime = true;

                animLines.push(`export const ${animConst} = {\n`);
                for (const animName of Object.keys(animations)) {
                    const key = animName.toUpperCase();
                    const value = animName.toLowerCase();
                    animLines.push(`    ${key}: '${value}',\n`);
                }
                animLines.push(`};\n\n`);
                foundAnim = true;
            }

            let writeStatus = "";
            if (overwrite) {
                fs.mkdirSync(outputDir, { recursive: true });
                if (foundTime) {
                    const timePath = path.join(outputDir, timeFileName);
                    fs.writeFileSync(timePath, timeLines.join(""), "utf-8");
                    writeStatus += `Generated: ${timeFileName}\n`;
                }
                if (foundAnim) {
                    const animPath = path.join(outputDir, animFileName);
                    fs.writeFileSync(animPath, animLines.join(""), "utf-8");
                    writeStatus += `Generated: ${animFileName}\n`;
                }
            }

            const output = lines.join("\n") + "\n\n" + writeStatus;

            return {
                stdout: output || "No JSON files found",
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

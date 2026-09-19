import { ipcMain } from "electron";
import fs from "fs";
import path from "path";

export function registerCreateAnimHandler() {
    ipcMain.handle("create-anim-config", async (_event, spineDir: string, outputDir: string, animFileName: string, timeFileName: string, overwrite: boolean, clearFull: boolean = true, excludeList?: string[]) => {
        try {
            const normalizedExcludeList = new Set(
                Array.isArray(excludeList)
                    ? excludeList.map((item) => String(item || "").trim().toUpperCase()).filter(Boolean)
                    : [],
            );

            function normalizeLineEndings(value: string): string {
                return value.replace(/\r\n/g, "\n");
            }

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

            function toAnimKey(animName: string): string {
                const key = animName.toUpperCase();
                return /^\d/.test(key) ? `_${key}` : key;
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

            function parseObjectExports(fileContent: string): Map<string, Map<string, string>> {
                const objectExports = new Map<string, Map<string, string>>();
                const normalizedContent = normalizeLineEndings(fileContent);
                const exportRegex = /export const\s+([A-Z0-9_]+)\s*=\s*\{([\s\S]*?)\n\};/g;

                for (const match of normalizedContent.matchAll(exportRegex)) {
                    const constName = match[1];
                    const objectBody = match[2] ?? "";
                    const entries = new Map<string, string>();
                    const lines = objectBody.split("\n");

                    for (const line of lines) {
                        const trimmedLine = line.trim();
                        if (!trimmedLine) {
                            continue;
                        }

                        const entryMatch = trimmedLine.match(/^([A-Z0-9_]+)\s*:\s*(.+?)(?:,)?$/);
                        if (!entryMatch) {
                            continue;
                        }

                        entries.set(entryMatch[1], entryMatch[2].trim());
                    }

                    objectExports.set(constName, entries);
                }

                return objectExports;
            }

            function readLocalObjectExports(filePath: string): Map<string, Map<string, string>> {
                if (!fs.existsSync(filePath)) {
                    return new Map();
                }

                const content = fs.readFileSync(filePath, "utf-8");
                return parseObjectExports(content);
            }

            function mergeGeneratedEntries(
                generatedEntries: Array<[string, string]>,
                localEntries?: Map<string, string>,
            ) {
                const mergedEntries = [...generatedEntries];
                const mergedKeys: string[] = [];

                if (!localEntries || localEntries.size === 0) {
                    return { mergedEntries, mergedKeys };
                }

                const generatedKeySet = new Set(generatedEntries.map(([key]) => key));
                for (const [key, value] of localEntries.entries()) {
                    if (!generatedKeySet.has(key)) {
                        mergedEntries.push([key, value]);
                        mergedKeys.push(key);
                    }
                }

                return { mergedEntries, mergedKeys };
            }

            function renderObjectExport(constName: string, entries: Array<[string, string]>): string {
                const lines = [`export const ${constName} = {\n`];
                for (const [key, value] of entries) {
                    lines.push(`    ${key}: ${value},\n`);
                }
                lines.push("};\n\n");
                return lines.join("");
            }

            const jsonFiles = walkJsonFiles(spineDir);
            const lines: string[] = [];
            const timeLines: string[] = [];
            const animLines: string[] = [];
            const validationIssues: Array<{ fileName: string; message: string }> = [];
            let foundTime = false;
            let foundAnim = false;
            const shouldPreserveLocalKeys = overwrite && !clearFull;
            const localTimeExports = shouldPreserveLocalKeys
                ? readLocalObjectExports(path.join(outputDir, timeFileName))
                : new Map<string, Map<string, string>>();
            const localAnimExports = shouldPreserveLocalKeys
                ? readLocalObjectExports(path.join(outputDir, animFileName))
                : new Map<string, Map<string, string>>();

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
                const animResults = new Map<string, number>();

                for (const [animName, animData] of Object.entries(animations)) {
                    const duration = getAnimationDuration(animData);
                    const key = toAnimKey(animName);
                    animResults.set(key, duration);
                    lines.push(`  ${key}: ${duration}s`);
                    if (/\s/.test(animName)) {
                        validationIssues.push({
                            fileName,
                            message: `Animation name contains whitespace: "${animName}"`,
                        });
                    }
                    if (/^\d/.test(animName)) {
                        validationIssues.push({
                            fileName,
                            message: `Animation name starts with a number: "${animName}" (generated key: ${key})`,
                        });
                    }
                }

                const generatedTimeEntries = Array.from(animResults.entries()).map(([key, value]) => [key, String(value)] as const);
                if (normalizedExcludeList.has(timeConst)) {
                    lines.push(`  SKIP: ${timeConst} (excluded in Settings)`);
                    continue;
                }
                const localTimeEntries = localTimeExports.get(timeConst);
                const mergedTime = mergeGeneratedEntries(generatedTimeEntries, localTimeEntries);

                timeLines.push(renderObjectExport(timeConst, mergedTime.mergedEntries));
                if (mergedTime.mergedKeys.length > 0) {
                    lines.push(`  Merged local time keys: ${mergedTime.mergedKeys.join(", ")}`);
                }
                foundTime = true;

                const generatedAnimEntries = Object.keys(animations).map((animName) => {
                    const key = toAnimKey(animName);
                    return [key, `'${animName}'`] as const;
                });
                if (normalizedExcludeList.has(animConst)) {
                    lines.push(`  SKIP: ${animConst} (excluded in Settings)`);
                    continue;
                }
                const localAnimEntries = localAnimExports.get(animConst);
                const mergedAnim = mergeGeneratedEntries(generatedAnimEntries, localAnimEntries);

                animLines.push(renderObjectExport(animConst, mergedAnim.mergedEntries));
                if (mergedAnim.mergedKeys.length > 0) {
                    lines.push(`  Merged local anim keys: ${mergedAnim.mergedKeys.join(", ")}`);
                }
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

            const validationSummaryLines = validationIssues.length > 0
                ? [
                    "--- Validation Summary ---",
                    `  Found ${validationIssues.length} animation naming issue${validationIssues.length === 1 ? "" : "s"}`,
                    ...validationIssues.map((issue) => `  ${issue.fileName}: ${issue.message}`),
                    "",
                ]
                : [];
            const output = [...validationSummaryLines, ...lines].join("\n") + "\n\n" + writeStatus;

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

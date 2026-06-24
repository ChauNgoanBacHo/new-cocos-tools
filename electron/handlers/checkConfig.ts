import { ipcMain } from "electron";
import fs from "fs";
import path from "path";

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractTemplatePrefixes(template: string): string[] {
    const prefixes = new Set<string>();
    const normalized = template.replace(/\s+/g, "");

    for (const match of normalized.matchAll(/(?:^|[_-])([A-Z0-9]+)_\$\{/g)) {
        prefixes.add(`${match[1]}_`);
    }

    const leadingPrefixMatch = normalized.match(/^([A-Z0-9_]+_)\$\{/);
    if (leadingPrefixMatch) {
        prefixes.add(leadingPrefixMatch[1]);
    }

    return [...prefixes];
}

export function registerCheckConfigHandler() {
    ipcMain.handle("check-config", async (_event, configFilePath: string, sourcePath: string) => {
        try {
            const configContent = fs.readFileSync(configFilePath, "utf-8");
            const configLines = configContent.split("\n");

            const objects: Record<string, string[]> = {};
            let currentObj: string | null = null;
            let buffer: string[] = [];
            let braceCount = 0;

            for (const line of configLines) {
                const startMatch = line.match(/\s*export\s+const\s+(\w+)\s*=\s*\{/);
                if (startMatch) {
                    currentObj = startMatch[1];
                    buffer = [];
                    braceCount = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
                    continue;
                }
                if (currentObj) {
                    buffer.push(line);
                    braceCount += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
                    if (braceCount === 0) {
                        const block = buffer.join("\n");
                        const pairs = [...block.matchAll(/(\w+)\s*:\s*([^,\n]+)/g)];
                        const keys: string[] = [];
                        for (const [, key, value] of pairs) {
                            if (/^['"].*['"]$/.test(value.trim())) {
                                keys.push(key);
                            }
                        }
                        objects[currentObj] = [...new Set(keys)];
                        currentObj = null;
                        buffer = [];
                    }
                }
            }

            function walkDir(dir: string): string[] {
                const files: string[] = [];
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        files.push(...walkDir(fullPath));
                    } else if (/\.(ts|js)$/.test(entry.name)) {
                        files.push(fullPath);
                    }
                }
                return files;
            }

            const sourceFiles = walkDir(sourcePath);
            let allCode = "";
            for (const file of sourceFiles) {
                if (file === configFilePath) continue;
                allCode += fs.readFileSync(file, "utf-8") + "\n";
            }

            const lines: string[] = [];
            let unusedCount = 0;

            for (const [obj, keys] of Object.entries(objects)) {
                lines.push(`--- ${obj} ---`);

                const usedKeys = new Set<string>();
                const dynamicKeys = new Set<string>();
                const escapedObj = escapeRegExp(obj);
                let hasUnknownComputedUsage = false;

                for (const key of keys) {
                    const pattern = new RegExp(`\\b${escapedObj}\\.${escapeRegExp(key)}\\b`);
                    if (pattern.test(allCode)) {
                        usedKeys.add(key);
                    }
                }

                const templatePattern = new RegExp(`${escapedObj}\\[\\s*\`([^\`]+)\`\\s*\\]`, "g");
                const templateUsages = [...allCode.matchAll(templatePattern)];
                for (const [, tpl] of templateUsages) {
                    const prefixes = extractTemplatePrefixes(tpl);
                    if (prefixes.length === 0) {
                        hasUnknownComputedUsage = true;
                    }
                    for (const prefix of prefixes) {
                        for (const key of keys) {
                            if (key.startsWith(prefix)) {
                                dynamicKeys.add(key);
                            }
                        }
                    }
                }

                const flowPattern = new RegExp(
                    `(?:const|let|var)\\s+(\\w+)\\s*=\\s*(?:\\([^)]*\\)\\s*=>\\s*)?\`([^\`]+)\`[\\s\\S]*?${escapedObj}\\[\\s*\\1\\s*\\]`,
                    "g",
                );
                const flows = [...allCode.matchAll(flowPattern)];
                for (const [, , template] of flows) {
                    const prefixes = extractTemplatePrefixes(template);
                    if (prefixes.length === 0) {
                        hasUnknownComputedUsage = true;
                    }
                    for (const prefix of prefixes) {
                        for (const key of keys) {
                            if (key.startsWith(prefix)) {
                                dynamicKeys.add(key);
                            }
                        }
                    }
                }

                const varPattern = new RegExp(`${escapedObj}\\[\\s*(\\w+)\\s*\\]`, "g");
                const varUsages = [...allCode.matchAll(varPattern)];
                for (const [, varName] of varUsages) {
                    if (varName.startsWith("`")) continue;
                    const isFlowVar = flows.some(([, flowVar]) => flowVar === varName);
                    if (!isFlowVar) {
                        hasUnknownComputedUsage = true;
                    }
                }

                if (hasUnknownComputedUsage) {
                    for (const key of keys) {
                        dynamicKeys.add(key);
                    }
                }

                for (const key of keys) {
                    if (usedKeys.has(key)) {
                        lines.push(`  ${obj}.${key}`);
                    } else if (dynamicKeys.has(key)) {
                        lines.push(`  DYNAMIC: ${obj}.${key}`);
                    } else {
                        lines.push(`  UNUSED: ${obj}.${key}`);
                        unusedCount++;
                    }
                }
            }

            const output = lines.join("\n");

            return {
                stdout: output || "No config objects found",
                stderr: "",
                exitCode: unusedCount > 0 ? 1 : 0,
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

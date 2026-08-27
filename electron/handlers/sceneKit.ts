import { ipcMain } from "electron";
import fs from "fs";
import path from "path";

interface BoilerplateFileResult {
    filePath: string;
    status: "created" | "exists" | "updated";
}

function extractGameIdFromScenePath(sceneFilePath: string) {
    const fileName = path.basename(sceneFilePath);
    const sceneNameMatch = fileName.match(/^g(\d{4,})(?:[A-Za-z])?\.scene$/i);
    if (sceneNameMatch) {
        return sceneNameMatch[1];
    }

    const fallbackMatch = sceneFilePath.match(/(?:^|[^\d])(\d{4,})(?:[^\d]|$)/);
    return fallbackMatch ? fallbackMatch[1] : "";
}

function createEventConfigTemplate(gameId: string) {
    return `export const GAME_EVENT_${gameId} = {
    PRE_RESUME_FREE_GAME_MATRIX: 'PRE_RESUME_FREE_GAME_MATRIX_${gameId}',
};
`;
}

function createDateTypeTemplate(gameId: string) {
    return `export enum DateType${gameId} {
}
`;
}

function createDataUtilsTemplate(gameId: string) {
    return `export class DataUtils${gameId} {
}
`;
}

function createGameConstantTemplate(gameId: string) {
    return `export const GameConstant${gameId} = {
    SYMBOL_HEIGHT: 128,
    SYMBOL_WIDTH: 140,
    TABLE_FORMAT: [3, 3, 3, 3, 3],
    SCATTER_SYMBOL: 'A',
    WILD_SYMBOL: 'K',
};
`;
}

function createGameConfigTemplate(gameId: string) {
    return `import { _decorator } from 'cc';
import { GameConfig } from '../../../../cc-common/cc30-slot-module/SlotModuleExport';
import { PAY_SYSTEM_TYPE_ENUM } from '../../../../cc-common/cc30-slot-module/SlotModuleExport';
import { GameConstant${gameId} } from '../Utils/GameConstant${gameId}';
const { ccclass } = _decorator;
@ccclass('GameConfig${gameId}')
export class GameConfig${gameId} extends GameConfig {
    public GAME_ID = "${gameId}";
    public JP_PREFIX_EVENT = "${gameId}_";
    public PAY_SYSTEM = PAY_SYSTEM_TYPE_ENUM.ALLWAYS;
    public TOTAL_BET_CREDIT:number = 25;
    public readonly TABLE_FORMAT: number[] = GameConstant${gameId}.TABLE_FORMAT;
    public readonly WIN_LEVEL_CONFIG: any = {
        THRESHOLDS: [1, 3, 10],
        COUNT_MONEY_TIME: { 1: 0.5, 2: 1, 3: 2, 4: 4 },
        WIN_LINE_TIME: { 1: 1.5, 2: 2.5, 3: 3.5, 4: 5.5 },
    };
}
`;
}

function createPaylineConfigTemplate(gameId: string) {
    return `import { _decorator, Vec2 } from 'cc';
import { PaylineConfig, PAYLINE_TYPE } from '../../../../cc-common/cc30-slot-module/SlotModuleExport';
import { GameConstant${gameId} } from '../Utils/GameConstant${gameId}';
const { ccclass } = _decorator;
@ccclass('PaylineConfig${gameId}')
export class PaylineConfig${gameId} extends PaylineConfig {
    public readonly PAYLINE_TYPE: PAYLINE_TYPE = PAYLINE_TYPE.AllWays;
    public readonly TABLE_CONFIG: any = {
        format: GameConstant${gameId}.TABLE_FORMAT,
        cellSize: new Vec2(GameConstant${gameId}.SYMBOL_WIDTH, GameConstant${gameId}.SYMBOL_HEIGHT),
        positions: [],
    };
}
`;
}

function createTableModuleConfigTemplate(gameId: string) {
    return `import { _decorator } from 'cc';
import { TableModuleConfig } from '../../../../cc-common/cc30-slot-module/SlotModuleExport';
import { GameConstant${gameId} } from '../Utils/GameConstant${gameId}';
const { ccclass } = _decorator;
@ccclass('TableModuleConfig${gameId}')
export class TableModuleConfig${gameId} extends TableModuleConfig {
    public SYMBOL_WIDTH: number = GameConstant${gameId}.SYMBOL_WIDTH;
    public SYMBOL_HEIGHT: number = GameConstant${gameId}.SYMBOL_HEIGHT;
    public TABLE_FORMAT: number[] = GameConstant${gameId}.TABLE_FORMAT;
}
`;
}

function ensureNamedImport(content: string, modulePath: string, importName: string) {
    const importRegex = new RegExp(`^import\\s+\\{([^}]+)\\}\\s+from\\s+['"]${modulePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}['"];`, "m");
    const importMatch = content.match(importRegex);

    if (!importMatch || importMatch.index === undefined) {
        return `import { ${importName} } from '${modulePath}';\n${content}`;
    }

    const existingNames = importMatch[1].split(",").map((item) => item.trim()).filter(Boolean);
    if (existingNames.includes(importName)) {
        return content;
    }

    const nextImport = `import { ${[...existingNames, importName].join(", ")} } from '${modulePath}';`;
    return `${content.slice(0, importMatch.index)}${nextImport}${content.slice(importMatch.index + importMatch[0].length)}`;
}

function ensureImportLine(content: string, importLine: string) {
    if (content.includes(importLine)) {
        return content;
    }

    const importMatches = [...content.matchAll(/^import .+;$/gm)];
    if (importMatches.length > 0) {
        const lastImport = importMatches[importMatches.length - 1];
        const insertIndex = (lastImport.index || 0) + lastImport[0].length;
        return `${content.slice(0, insertIndex)}\n${importLine}${content.slice(insertIndex)}`;
    }

    return `${importLine}\n${content}`;
}

function updateGameConfigContent(content: string, gameId: string) {
    let nextContent = content;
    const constantImport = `import { GameConstant${gameId} } from '../Utils/GameConstant${gameId}';`;

    nextContent = ensureImportLine(nextContent, constantImport);

    const additions: string[] = [];
    if (!/\bTABLE_FORMAT\b/.test(nextContent)) {
        additions.push(`    public readonly TABLE_FORMAT: number[] = GameConstant${gameId}.TABLE_FORMAT;`);
    }
    if (!/\bWIN_LEVEL_CONFIG\b/.test(nextContent)) {
        additions.push(`    public readonly WIN_LEVEL_CONFIG: any = {
        THRESHOLDS: [1, 3, 10],
        COUNT_MONEY_TIME: { 1: 0.5, 2: 1, 3: 2, 4: 4 },
        WIN_LINE_TIME: { 1: 1.5, 2: 2.5, 3: 3.5, 4: 5.5 },
    };`);
    }

    if (additions.length === 0) {
        return nextContent;
    }

    const totalBetMatch = nextContent.match(/^.*\bTOTAL_BET_CREDIT\b.*$/m);
    if (totalBetMatch && totalBetMatch.index !== undefined) {
        const insertIndex = totalBetMatch.index + totalBetMatch[0].length;
        return `${nextContent.slice(0, insertIndex)}\n${additions.join("\n")}${nextContent.slice(insertIndex)}`;
    }

    const classMatch = nextContent.match(new RegExp(`export\\s+class\\s+GameConfig${gameId}\\s+extends\\s+GameConfig\\s*\\{`));
    if (classMatch && classMatch.index !== undefined) {
        const insertIndex = classMatch.index + classMatch[0].length;
        return `${nextContent.slice(0, insertIndex)}\n${additions.join("\n")}${nextContent.slice(insertIndex)}`;
    }

    throw new Error(`Cannot find GameConfig${gameId} class body.`);
}

function updatePaylineConfigContent(content: string, gameId: string) {
    let nextContent = ensureNamedImport(content, "cc", "Vec2");
    nextContent = ensureImportLine(nextContent, `import { GameConstant${gameId} } from '../Utils/GameConstant${gameId}';`);

    if (/^\s*public\s+readonly\s+TABLE_CONFIG\b/m.test(nextContent)) {
        return nextContent;
    }

    const tableConfig = `    public readonly TABLE_CONFIG: any = {
        format: GameConstant${gameId}.TABLE_FORMAT,
        cellSize: new Vec2(GameConstant${gameId}.SYMBOL_WIDTH, GameConstant${gameId}.SYMBOL_HEIGHT),
        positions: [],
    };`;
    const paylineTypeMatch = nextContent.match(/^\s*public\s+readonly\s+PAYLINE_TYPE\b.*$/m);
    if (paylineTypeMatch && paylineTypeMatch.index !== undefined) {
        const insertIndex = paylineTypeMatch.index + paylineTypeMatch[0].length;
        return `${nextContent.slice(0, insertIndex)}\n${tableConfig}${nextContent.slice(insertIndex)}`;
    }

    const classMatch = nextContent.match(new RegExp(`export\\s+class\\s+PaylineConfig${gameId}\\s+extends\\s+PaylineConfig\\s*\\{`));
    if (classMatch && classMatch.index !== undefined) {
        const insertIndex = classMatch.index + classMatch[0].length;
        return `${nextContent.slice(0, insertIndex)}\n${tableConfig}${nextContent.slice(insertIndex)}`;
    }

    throw new Error(`Cannot find PaylineConfig${gameId} class body.`);
}

function updateTableModuleConfigContent(content: string, gameId: string) {
    let nextContent = ensureImportLine(content, `import { GameConstant${gameId} } from '../Utils/GameConstant${gameId}';`);
    const additions: string[] = [];

    if (!/^\s*public\s+SYMBOL_WIDTH\b/m.test(nextContent)) {
        additions.push(`    public SYMBOL_WIDTH: number = GameConstant${gameId}.SYMBOL_WIDTH;`);
    }
    if (!/^\s*public\s+SYMBOL_HEIGHT\b/m.test(nextContent)) {
        additions.push(`    public SYMBOL_HEIGHT: number = GameConstant${gameId}.SYMBOL_HEIGHT;`);
    }
    if (!/^\s*public\s+TABLE_FORMAT\b/m.test(nextContent)) {
        additions.push(`    public TABLE_FORMAT: number[] = GameConstant${gameId}.TABLE_FORMAT;`);
    }

    if (additions.length === 0) {
        return nextContent;
    }

    const classMatch = nextContent.match(new RegExp(`export\\s+class\\s+TableModuleConfig${gameId}\\s+extends\\s+TableModuleConfig\\s*\\{`));
    if (classMatch && classMatch.index !== undefined) {
        const insertIndex = classMatch.index + classMatch[0].length;
        return `${nextContent.slice(0, insertIndex)}\n${additions.join("\n")}${nextContent.slice(insertIndex)}`;
    }

    throw new Error(`Cannot find TableModuleConfig${gameId} class body.`);
}

function getBoilerplateFiles(sceneFilePath: string, gameId: string) {
    const projectRoot = path.dirname(sceneFilePath);
    return [
        {
            filePath: path.join(projectRoot, "scripts", "Core", `GameConfig${gameId}.ts`),
            content: createGameConfigTemplate(gameId),
            mode: "patchGameConfig" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "Payline", `PaylineConfig${gameId}.ts`),
            content: createPaylineConfigTemplate(gameId),
            mode: "patchPaylineConfig" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "Table", `TableModuleConfig${gameId}.ts`),
            content: createTableModuleConfigTemplate(gameId),
            mode: "patchTableModuleConfig" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "DataConfig", `EventConfig${gameId}.ts`),
            content: createEventConfigTemplate(gameId),
            mode: "overwrite" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "Utils", `DateType${gameId}.ts`),
            content: createDateTypeTemplate(gameId),
            mode: "overwrite" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "Utils", `DataUtils${gameId}.ts`),
            content: createDataUtilsTemplate(gameId),
            mode: "overwrite" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "Utils", `GameConstant${gameId}.ts`),
            content: createGameConstantTemplate(gameId),
            mode: "overwrite" as const,
        },
    ];
}

export function registerSceneKitHandler() {
    ipcMain.handle("scene-kit:preview-boilerplate", async (_event, sceneFilePath: string) => {
        const normalizedScenePath = String(sceneFilePath || "").trim();
        const gameId = extractGameIdFromScenePath(normalizedScenePath);

        if (!normalizedScenePath || !normalizedScenePath.endsWith(".scene")) {
            throw new Error("Please choose a .scene file.");
        }

        if (!gameId) {
            throw new Error("Cannot detect gameId from scene file name.");
        }

        return {
            gameId,
            projectRoot: path.dirname(normalizedScenePath),
            files: getBoilerplateFiles(normalizedScenePath, gameId).map((file) => ({
                filePath: file.filePath,
                status: fs.existsSync(file.filePath) ? "exists" : "new",
            })),
        };
    });

    ipcMain.handle("scene-kit:create-boilerplate", async (_event, sceneFilePath: string) => {
        const normalizedScenePath = String(sceneFilePath || "").trim();
        const gameId = extractGameIdFromScenePath(normalizedScenePath);

        if (!normalizedScenePath || !normalizedScenePath.endsWith(".scene")) {
            throw new Error("Please choose a .scene file.");
        }

        if (!fs.existsSync(normalizedScenePath)) {
            throw new Error("Scene file does not exist.");
        }

        if (!gameId) {
            throw new Error("Cannot detect gameId from scene file name.");
        }

        const results: BoilerplateFileResult[] = [];
        for (const file of getBoilerplateFiles(normalizedScenePath, gameId)) {
            if (fs.existsSync(file.filePath)) {
                const currentContent = fs.readFileSync(file.filePath, "utf8");
                let nextContent = file.content;
                if (file.mode === "patchGameConfig") {
                    nextContent = updateGameConfigContent(currentContent, gameId);
                } else if (file.mode === "patchPaylineConfig") {
                    nextContent = updatePaylineConfigContent(currentContent, gameId);
                } else if (file.mode === "patchTableModuleConfig") {
                    nextContent = updateTableModuleConfigContent(currentContent, gameId);
                }
                fs.writeFileSync(file.filePath, nextContent, "utf8");
                results.push({ filePath: file.filePath, status: nextContent === currentContent ? "exists" : "updated" });
                continue;
            }

            fs.mkdirSync(path.dirname(file.filePath), { recursive: true });
            fs.writeFileSync(file.filePath, file.content, "utf8");
            results.push({ filePath: file.filePath, status: "created" });
        }

        return {
            gameId,
            projectRoot: path.dirname(normalizedScenePath),
            files: results,
        };
    });
}

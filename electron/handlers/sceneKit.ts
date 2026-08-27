import { ipcMain } from "electron";
import fs from "fs";
import path from "path";

interface BoilerplateFileResult {
    filePath: string;
    status: "created" | "exists";
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
    return `export const EventConfig${gameId} = {
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
};
`;
}

function getBoilerplateFiles(sceneFilePath: string, gameId: string) {
    const projectRoot = path.dirname(sceneFilePath);
    return [
        {
            filePath: path.join(projectRoot, "scripts", "DataConfig", `EventConfig${gameId}.ts`),
            content: createEventConfigTemplate(gameId),
        },
        {
            filePath: path.join(projectRoot, "scripts", "Utils", `DateType${gameId}.ts`),
            content: createDateTypeTemplate(gameId),
        },
        {
            filePath: path.join(projectRoot, "scripts", "Utils", `DataUtils${gameId}.ts`),
            content: createDataUtilsTemplate(gameId),
        },
        {
            filePath: path.join(projectRoot, "scripts", "Utils", `GameConstant${gameId}.ts`),
            content: createGameConstantTemplate(gameId),
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
                results.push({ filePath: file.filePath, status: "exists" });
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

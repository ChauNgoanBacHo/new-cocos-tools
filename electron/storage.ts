import { app, ipcMain } from "electron";
import fs from "fs";
import path from "path";

type StoragePrimitive = string | number | boolean | null;
type StorageValue = StoragePrimitive | StorageValue[] | { [key: string]: StorageValue };
type StorageRecord = Record<string, StorageValue>;

function getStorageFilePath() {
    return path.join(app.getPath("userData"), "renderer-storage.json");
}

function readStorage(): StorageRecord {
    try {
        const filePath = getStorageFilePath();
        if (!fs.existsSync(filePath)) return {};
        const raw = fs.readFileSync(filePath, "utf8");
        if (!raw.trim()) return {};
        return JSON.parse(raw) as StorageRecord;
    } catch {
        return {};
    }
}

function writeStorage(data: StorageRecord) {
    const filePath = getStorageFilePath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

export function registerStorageHandlers() {
    ipcMain.handle("storage:get", (_, key: string) => {
        const storage = readStorage();
        return storage[key];
    });

    ipcMain.handle("storage:set", (_, key: string, value: StorageValue) => {
        const storage = readStorage();
        storage[key] = value;
        writeStorage(storage);
        return true;
    });

    ipcMain.handle("storage:remove", (_, key: string) => {
        const storage = readStorage();
        delete storage[key];
        writeStorage(storage);
        return true;
    });
}

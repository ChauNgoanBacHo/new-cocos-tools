import { ipcMain } from "electron";
import { runEslintScan } from "./codeHealth";

export function registerEslintHandler() {
    ipcMain.handle("run-eslint", async (_event, sourcePath: string) => {
        return runEslintScan(sourcePath);
    });
}

import { ipcMain } from "electron";
import { MatrixSyncClient } from "./api-client";
import type { MatrixTemplateMutationPayload } from "./types";

export function setupMatrixSyncHandlers(baseUrl: string, apiKey?: string) {
  const client = new MatrixSyncClient(baseUrl, apiKey);

  ipcMain.handle("matrix-sync:list-by-game", (_event, gameId: string) => {
    return client.listTemplatesByGame(gameId);
  });

  ipcMain.handle("matrix-sync:get-template", (_event, templateId: string) => {
    return client.getTemplate(templateId);
  });

  ipcMain.handle("matrix-sync:create-template", (_event, payload: MatrixTemplateMutationPayload) => {
    return client.createTemplate(payload);
  });
}

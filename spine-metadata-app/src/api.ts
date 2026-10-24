import type { AnimationMetadata, ApiEnvelope, GameSheetData } from "./types";

const API_URL_STORAGE_KEY = "spine-metadata-api-url-v2";
const DEFAULT_API_URL = "https://script.google.com/macros/s/AKfycbz6iJafhs9ZFR6OMcdLerhyCD15qNpvR5gSOGS8YtexiiNP30T3hq0BBSymjybtW8hKSw/exec";

export function validateApiUrl(url: string): string | null {
    const value = url.trim();
    if (!value) return "Apps Script Web App URL is required.";
    if (/^https:\/\/docs\.google\.com\/spreadsheets\//i.test(value)) {
        return "This is a Google Sheet URL. Paste the deployed Apps Script Web App URL ending in /exec.";
    }
    if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?/i.test(value)) return null;
    const isPublicAppsScriptUrl = /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec(?:\?.*)?$/i.test(value);
    const isWorkspaceAppsScriptUrl = /^https:\/\/script\.google\.com\/a\/macros\/[^/]+\/s\/[^/]+\/exec(?:\?.*)?$/i.test(value);
    if (!isPublicAppsScriptUrl && !isWorkspaceAppsScriptUrl) {
        return "Invalid Apps Script URL. Use the deployed Web App URL ending in /exec.";
    }
    return null;
}

export function getInitialApiUrl(): string {
    return import.meta.env.VITE_SPINE_SHEET_API_URL?.trim()
        || localStorage.getItem(API_URL_STORAGE_KEY)?.trim()
        || DEFAULT_API_URL;
}

export function rememberApiUrl(url: string): void {
    localStorage.setItem(API_URL_STORAGE_KEY, url.trim());
}

async function readJson<T>(response: Response): Promise<T> {
    const text = await response.text();
    try {
        return JSON.parse(text) as T;
    } catch {
        const cannotAccessSpreadsheet = /Bạn không có quyền truy cập vào tài liệu yêu cầu|You (?:do not|don't) have (?:permission|access) to (?:the )?(?:requested )?(?:document|file)/i.test(text);
        if (cannotAccessSpreadsheet) {
            throw new Error(
                "The Google account that deployed Apps Script cannot access this Sheet. Share the Sheet with that account as Editor, then run listGames_ once to authorize it.",
            );
        }
        const requiresGoogleSignIn = response.url.includes("accounts.google.com")
            || /Sign in - Google Accounts|ServiceLogin|AccountChooser/i.test(text);
        if (requiresGoogleSignIn) {
            throw new Error(
                "This Apps Script deployment requires Google sign-in. Deploy it as 'Execute as: Me' and 'Who has access: Anyone', or use a Google account that allows anonymous Web Apps.",
            );
        }
        throw new Error("Google Apps Script did not return JSON. Check the deployment access settings.");
    }
}

export class SpineSheetApi {
    constructor(private readonly baseUrl: string) {}

    private async get<T>(params: Record<string, string>): Promise<T> {
        const url = new URL(this.baseUrl);
        Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
        const response = await fetch(url, { redirect: "follow" });
        if (!response.ok) throw new Error(`Sheet API request failed (${response.status}).`);
        const payload = await readJson<ApiEnvelope<T>>(response);
        if (!payload.ok) {
            const error = new Error(payload.error || "Sheet API request failed.");
            error.name = payload.code || "SHEET_API_ERROR";
            throw error;
        }
        return payload.data as T;
    }

    private async post<T>(body: Record<string, unknown>): Promise<T> {
        const response = await fetch(this.baseUrl, {
            method: "POST",
            redirect: "follow",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error(`Sheet API request failed (${response.status}).`);
        const payload = await readJson<ApiEnvelope<T>>(response);
        if (!payload.ok) {
            const error = new Error(payload.error || "Sheet API request failed.");
            error.name = payload.code || "SHEET_API_ERROR";
            throw error;
        }
        return payload.data as T;
    }

    listGames(): Promise<string[]> {
        return this.get<string[]>({ action: "listGames" });
    }

    getGame(gameId: string): Promise<GameSheetData> {
        return this.get<GameSheetData>({ action: "getGame", gameId });
    }

    upsertAnimation(row: AnimationMetadata): Promise<AnimationMetadata> {
        return this.post<AnimationMetadata>({ action: "upsertAnimation", row });
    }

    upsertMany(gameId: string, rows: AnimationMetadata[]): Promise<GameSheetData> {
        return this.post<GameSheetData>({ action: "upsertMany", gameId, rows });
    }

}

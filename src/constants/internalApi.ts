const INTERNAL_API_HOST = "https://black-adam-bot.fly.dev";

export function normalizeInternalApiBaseUrl(value: string) {
    return String(value || "").trim().replace(/[),.;\s]+$/, "").replace(/\/+$/, "");
}

export const INTERNAL_API_BASE_URL = normalizeInternalApiBaseUrl(INTERNAL_API_HOST);

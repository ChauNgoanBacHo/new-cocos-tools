import type {
  MatrixTemplateDetailResponse,
  MatrixTemplateListResponse,
  MatrixTemplateMutationPayload,
  MatrixTemplateMutationResponse,
  MatrixTemplateValidationError,
} from "./types";

async function parseError(response: Response): Promise<Error> {
  try {
    const data = await response.json() as {
      ok?: boolean;
      error?: MatrixTemplateValidationError;
    };

    const error = new Error(data?.error?.message || `API error: ${response.status}`) as Error & {
      code?: string;
      fields?: Record<string, string>;
      currentVersion?: number;
      status?: number;
    };
    error.code = data?.error?.code;
    error.fields = data?.error?.fields;
    error.currentVersion = data?.error?.currentVersion;
    error.status = response.status;
    return error;
  } catch {
    const error = new Error(`API error: ${response.status}`) as Error & { status?: number };
    error.status = response.status;
    return error;
  }
}

export class MatrixSyncClient {
  private baseUrl: string;
  private apiKey?: string;

  constructor(baseUrl: string, apiKey?: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  private buildHeaders(contentType?: string): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }
    if (contentType) {
      headers["Content-Type"] = contentType;
    }
    return headers;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, init);

    if (!response.ok) {
      throw await parseError(response);
    }

    return response.json() as Promise<T>;
  }

  async listTemplatesByGame(gameId: string): Promise<MatrixTemplateListResponse> {
    const encodedGameId = encodeURIComponent(gameId.trim());
    return this.request<MatrixTemplateListResponse>(`/api/matrix-templates/by-game/${encodedGameId}`, {
      headers: this.buildHeaders(),
    });
  }

  async getTemplate(id: string): Promise<MatrixTemplateDetailResponse> {
    const encodedId = encodeURIComponent(id.trim());
    return this.request<MatrixTemplateDetailResponse>(`/api/matrix-templates/${encodedId}`, {
      headers: this.buildHeaders(),
    });
  }

  async createTemplate(payload: MatrixTemplateMutationPayload): Promise<MatrixTemplateMutationResponse> {
    return this.request<MatrixTemplateMutationResponse>("/api/matrix-templates", {
      method: "POST",
      headers: this.buildHeaders("application/json"),
      body: JSON.stringify(payload),
    });
  }

  async updateTemplate(id: string, payload: MatrixTemplateMutationPayload): Promise<MatrixTemplateMutationResponse> {
    const encodedId = encodeURIComponent(id.trim());
    return this.request<MatrixTemplateMutationResponse>(`/api/matrix-templates/${encodedId}`, {
      method: "PUT",
      headers: this.buildHeaders("application/json"),
      body: JSON.stringify(payload),
    });
  }
}

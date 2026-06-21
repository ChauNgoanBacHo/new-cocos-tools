export interface MatrixTemplateListItem {
  id: string;
  gameId: string;
  slug: string;
  title: string;
  tableFormat: string;
  tags: string[];
  version: number;
  updatedAt: string;
  createdAt: string;
  publishedBy: string | null;
}

export interface MatrixTemplateDetail extends MatrixTemplateListItem {
  matrixData: string;
  additionalData: Record<string, string>;
}

export interface MatrixTemplateValidationError {
  code: string;
  message: string;
  fields?: Record<string, string>;
  currentVersion?: number;
}

export interface MatrixTemplateListResponse {
  ok: true;
  gameId: string;
  items: MatrixTemplateDetail[];
  nextCursor: string | null;
  total: number;
}

export interface MatrixTemplateDetailResponse {
  ok: true;
  item: MatrixTemplateDetail;
}

export interface MatrixTemplateMutationPayload {
  gameId: string;
  gameName?: string;
  title?: string;
  matrixData: string;
  tableFormat: string;
  additionalData?: Record<string, string>;
  tags?: string[];
  publishedBy?: string | null;
  version?: number;
}

export interface MatrixTemplateMutationResponse {
  ok: true;
  item: MatrixTemplateDetail;
}

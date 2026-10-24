export type SaveState = "idle" | "saving" | "saved" | "error";

export interface AnimationMetadata {
    id: string;
    gameId: string;
    spineName: string;
    animationName: string;
    previewTimeSec: number;
    placement: string;
    playCondition: string;
    needsDevInput?: boolean;
    updatedAt: string;
    updatedBy?: string;
}

export interface LocalAnimation {
    name: string;
    duration: number;
}

export interface LocalSpineAsset {
    id: string;
    spineName: string;
    relativeJsonPath: string;
    version: string;
    format: "json" | "binary";
    skeletonData: Record<string, unknown> | Uint8Array;
    atlasText: string;
    pageFiles: Map<string, File>;
    animations: LocalAnimation[];
}

export interface GameSheetData {
    gameId: string;
    rows: AnimationMetadata[];
}

export interface ApiEnvelope<T = unknown> {
    ok: boolean;
    error?: string;
    code?: string;
    data?: T;
}

export interface NativeSpineFile {
    name: string;
    relativePath: string;
    data: Uint8Array | ArrayLike<number>;
}

export interface NativeSpineFolderResult {
    canceled: boolean;
    folderName?: string;
    folderPath?: string;
    files: NativeSpineFile[];
}

declare global {
    interface Window {
        spineNotes?: {
            selectFolder: () => Promise<NativeSpineFolderResult>;
            scanFolder: (folderPath: string) => Promise<NativeSpineFolderResult>;
        };
    }
}

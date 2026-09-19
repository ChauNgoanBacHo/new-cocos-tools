import { dialog, ipcMain } from "electron";
import fs from "fs";
import path from "path";

type CocosRef = { __id__?: number };
type CocosObject = Record<string, any>;

interface SpriteFrameAsset {
    uuid: string;
    width?: number;
    height?: number;
}

interface SpriteMapping {
    raw: string;
    target: string;
    assetBase?: string;
    assetStates?: string[];
}

interface ReplacementDetail {
    mapping: string;
    nodePath?: string;
    nodeName?: string;
    assetName?: string;
    status: "replaced" | "missing-node" | "missing-asset" | "missing-component" | "error";
    message: string;
}

function extractGameId(sceneFilePath: string) {
    return path.basename(sceneFilePath).match(/g?(\d{4})/i)?.[1] ?? "";
}

function isRef(value: unknown): value is CocosRef {
    return Boolean(value && typeof value === "object" && typeof (value as CocosRef).__id__ === "number");
}

function getObjectByRef(objects: CocosObject[], ref: unknown): CocosObject | null {
    if (!isRef(ref)) return null;
    return objects[ref.__id__] ?? null;
}

function parseMappings(input: string): SpriteMapping[] {
    return input
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => {
            const delimiter = line.includes("=>") ? "=>" : line.includes("=") ? "=" : line.includes(":") ? ":" : "";
            if (!delimiter) {
                return { raw: line, target: line };
            }

            const [target, ...rest] = line.split(delimiter);
            const assetValue = rest.join(delimiter).trim();
            const assetStateSeparator = assetValue.includes(",") ? "," : "-";
            const assetStates = assetValue.split(assetStateSeparator).map((item) => item.trim()).filter(Boolean);
            return {
                raw: line,
                target: target.trim(),
                assetBase: assetStates[0] || assetValue || undefined,
                assetStates,
            };
        })
        .filter((mapping) => mapping.target);
}

function normalizeAssetKey(value: string) {
    return value.trim().replace(/\.(png|jpg|jpeg|webp|bmp|gif|tiff)$/i, "").toLowerCase();
}

function walkFiles(dir: string, visitor: (filePath: string) => void) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walkFiles(fullPath, visitor);
        } else {
            visitor(fullPath);
        }
    }
}

function readSpriteAssetMetaInfo(metaPath: string): { spriteFrame: SpriteFrameAsset | null; isTextureOnly: boolean } {
    try {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
        const subMetas = meta?.subMetas && typeof meta.subMetas === "object" ? Object.values(meta.subMetas) : [];
        const spriteFrameMeta = subMetas.find((item: any) => item?.importer === "sprite-frame" && typeof item.uuid === "string") as any;
        const hasTextureMeta = subMetas.some((item: any) => item?.importer === "texture");
        const width = spriteFrameMeta?.userData && typeof spriteFrameMeta.userData.width === "number" ? spriteFrameMeta.userData.width : undefined;
        const height = spriteFrameMeta?.userData && typeof spriteFrameMeta.userData.height === "number" ? spriteFrameMeta.userData.height : undefined;
        return {
            spriteFrame: spriteFrameMeta?.uuid ? { uuid: spriteFrameMeta.uuid, width, height } : null,
            isTextureOnly: meta?.importer === "image" && !spriteFrameMeta && (meta?.userData?.type === "texture" || hasTextureMeta),
        };
    } catch {
        return { spriteFrame: null, isTextureOnly: false };
    }
}

function scanSpriteFrames(projectRoot: string) {
    const spriteFrames = new Map<string, SpriteFrameAsset>();
    const textureOnlyAssets = new Map<string, string>();

    walkFiles(projectRoot, (filePath) => {
        if (!filePath.endsWith(".meta")) return;
        const { spriteFrame, isTextureOnly } = readSpriteAssetMetaInfo(filePath);

        const assetFileName = path.basename(filePath, ".meta");
        const assetName = assetFileName.replace(/\.(png|jpg|jpeg|webp|bmp|gif|tiff)$/i, "");
        const assetKey = normalizeAssetKey(assetName);
        if (spriteFrame) {
            spriteFrames.set(assetKey, spriteFrame);
            return;
        }
        if (isTextureOnly) {
            textureOnlyAssets.set(assetKey, filePath);
        }
    });

    return { spriteFrames, textureOnlyAssets };
}

function getMissingAssetMessage(assetName: string, textureOnlyAssets: Map<string, string>) {
    const textureOnlyMetaPath = textureOnlyAssets.get(normalizeAssetKey(assetName));
    if (textureOnlyMetaPath) {
        return `Asset is texture-only. Convert it to SpriteFrame before replacing: ${assetName}`;
    }
    return `Cannot find sprite asset: ${assetName}`;
}

function createSpriteFrameRef(uuid: string) {
    return {
        __uuid__: uuid,
        __expectedType__: "cc.SpriteFrame",
    };
}

function applySimpleTrimmedSpriteSettings(sprite: CocosObject, uiTransform: CocosObject | undefined, spriteFrame: SpriteFrameAsset) {
    sprite._type = 0;
    sprite._sizeMode = 1;
    sprite._isTrimmedMode = true;

    if (uiTransform && typeof spriteFrame.width === "number" && typeof spriteFrame.height === "number") {
        uiTransform._contentSize = {
            __type__: "cc.Size",
            width: spriteFrame.width,
            height: spriteFrame.height,
        };
    }
}

function getNodeName(node: CocosObject) {
    return typeof node?._name === "string" ? node._name : "";
}

function getNodePath(objects: CocosObject[], node: CocosObject): string {
    const names: string[] = [];
    let current: CocosObject | null = node;
    const visited = new Set<CocosObject>();

    while (current && !visited.has(current)) {
        visited.add(current);
        const name = getNodeName(current);
        if (name) names.push(name);
        current = getObjectByRef(objects, current._parent);
    }

    return names.reverse().join("/");
}

function findNodes(objects: CocosObject[], target: string, defaultRootPath: string) {
    const normalizedTarget = target.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    const targetName = normalizedTarget.split("/").pop() ?? normalizedTarget;
    const nodes = objects.filter((item) => item?.__type__ === "cc.Node");

    const pathCandidates = Array.from(new Set([
        normalizedTarget,
        `${defaultRootPath}/${normalizedTarget}`.replace(/\/+/g, "/"),
    ]));
    const pathMatches = nodes.filter((node) => {
        const currentPath = getNodePath(objects, node);
        return pathCandidates.some((candidate) => currentPath === candidate || currentPath.endsWith(`/${candidate}`));
    });
    if (pathMatches.length > 0) return pathMatches;

    return nodes.filter((node) => getNodeName(node) === targetName);
}

function getNodeComponents(objects: CocosObject[], node: CocosObject) {
    const refs = Array.isArray(node._components) ? node._components : [];
    return refs
        .map((ref) => getObjectByRef(objects, ref))
        .filter((component): component is CocosObject => Boolean(component));
}

function resolveAssetName(gameId: string, assetBase: string) {
    const cleaned = assetBase
        .trim()
        .replace(/\.(png|jpg|jpeg|webp|bmp|gif|tiff)$/i, "")
        .replace(/^\d{4}_/, "");
    return cleaned.startsWith(`${gameId}_`) ? cleaned : `${gameId}_${cleaned}`;
}

function resolveAssetStateNames(gameId: string, assetBase: string, assetStates?: string[]) {
    if (assetStates && assetStates.length > 0) {
        const [normal, pressed, hover, disabled] = assetStates;
        return {
            _normalSprite: resolveAssetName(gameId, normal ?? assetBase),
            _pressedSprite: resolveAssetName(gameId, pressed ?? normal ?? assetBase),
            _hoverSprite: resolveAssetName(gameId, hover ?? normal ?? assetBase),
            _disabledSprite: resolveAssetName(gameId, disabled ?? normal ?? assetBase),
        };
    }

    const assetName = resolveAssetName(gameId, assetBase);
    return {
        _normalSprite: `${assetName}_Normal`,
        _pressedSprite: `${assetName}_Pressed`,
        _hoverSprite: `${assetName}_Hover`,
        _disabledSprite: `${assetName}_Disable`,
    };
}

function replaceSprites(sceneFilePath: string, gameIdInput: string, mappingsInput: string) {
    const normalizedScenePath = String(sceneFilePath || "").trim();
    if (!normalizedScenePath || path.extname(normalizedScenePath) !== ".scene") {
        throw new Error("Please choose a .scene file.");
    }
    if (!fs.existsSync(normalizedScenePath)) {
        throw new Error(".scene file does not exist.");
    }

    const gameId = String(gameIdInput || "").trim() || extractGameId(normalizedScenePath);
    if (!gameId) {
        throw new Error("Please input Game ID or use a scene filename that contains game id.");
    }

    const mappings = parseMappings(mappingsInput);
    if (mappings.length === 0) {
        throw new Error("Please input at least one node mapping.");
    }

    const sceneContent = fs.readFileSync(normalizedScenePath, "utf8");
    const sceneData = JSON.parse(sceneContent) as CocosObject[];
    if (!Array.isArray(sceneData)) {
        throw new Error("Unsupported Cocos scene format.");
    }

    const assetScan = scanSpriteFrames(path.dirname(normalizedScenePath));
    const assetMap = assetScan.spriteFrames;
    const textureOnlyAssets = assetScan.textureOnlyAssets;
    const details: ReplacementDetail[] = [];
    let replacedCount = 0;
    const unasyncPrefabCount = 0;

    for (const mapping of mappings) {
        const nodes = findNodes(sceneData, mapping.target, "Canvas/Director");
        if (nodes.length === 0) {
            details.push({
                mapping: mapping.raw,
                status: "missing-node",
                message: `Cannot find node: ${mapping.target}`,
            });
            continue;
        }

        for (const node of nodes) {
            const components = getNodeComponents(sceneData, node);
            const uiTransform = components.find((component) => component.__type__ === "cc.UITransform");
            const sprite = components.find((component) => component.__type__ === "cc.Sprite");
            const button = components.find((component) => component.__type__ === "cc.Button");
            const nodePath = getNodePath(sceneData, node);
            const nodeName = getNodeName(node);
            const isTurboButtonSpriteNode = nodePath.includes("/TurboButton/");
            const spriteStateComponent = isTurboButtonSpriteNode
                ? components.find((component) =>
                    component !== sprite &&
                    component !== button &&
                    "normal" in component &&
                    "pressed" in component &&
                    "hover" in component &&
                    "disabled" in component
                )
                : undefined;
            const assetBase = mapping.assetBase || nodeName;
            const assetName = resolveAssetName(gameId, assetBase);

            if (button) {
                const stateNames = resolveAssetStateNames(gameId, assetBase, mapping.assetStates);
                const missingState = Object.values(stateNames).find((name) => !assetMap.has(normalizeAssetKey(name)));

                if (!missingState) {
                    button._transition = 2;
                    for (const [field, name] of Object.entries(stateNames)) {
                        button[field] = createSpriteFrameRef(assetMap.get(normalizeAssetKey(name))!.uuid);
                    }
                    if (sprite) {
                        const normalSpriteFrame = assetMap.get(normalizeAssetKey(stateNames._normalSprite))!;
                        sprite._spriteFrame = createSpriteFrameRef(normalSpriteFrame.uuid);
                        applySimpleTrimmedSpriteSettings(sprite, uiTransform, normalSpriteFrame);
                    }
                    replacedCount += 1;
                    details.push({
                        mapping: mapping.raw,
                        nodePath,
                        nodeName,
                        assetName,
                        status: "replaced",
                        message: `Button sprite states replaced for ${nodePath}`,
                    });
                    continue;
                }

                details.push({
                    mapping: mapping.raw,
                    nodePath,
                    nodeName,
                    assetName: missingState,
                    status: "missing-asset",
                    message: getMissingAssetMessage(missingState, textureOnlyAssets),
                });
                continue;
            }

            if (spriteStateComponent && mapping.assetStates && mapping.assetStates.length > 1) {
                const stateNames = resolveAssetStateNames(gameId, assetBase, mapping.assetStates);
                const missingState = Object.values(stateNames).find((name) => !assetMap.has(normalizeAssetKey(name)));

                if (!missingState) {
                    spriteStateComponent.normal = createSpriteFrameRef(assetMap.get(normalizeAssetKey(stateNames._normalSprite))!.uuid);
                    spriteStateComponent.pressed = createSpriteFrameRef(assetMap.get(normalizeAssetKey(stateNames._pressedSprite))!.uuid);
                    spriteStateComponent.hover = createSpriteFrameRef(assetMap.get(normalizeAssetKey(stateNames._hoverSprite))!.uuid);
                    spriteStateComponent.disabled = createSpriteFrameRef(assetMap.get(normalizeAssetKey(stateNames._disabledSprite))!.uuid);
                    if (sprite) {
                        const normalSpriteFrame = assetMap.get(normalizeAssetKey(stateNames._normalSprite))!;
                        sprite._spriteFrame = createSpriteFrameRef(normalSpriteFrame.uuid);
                        applySimpleTrimmedSpriteSettings(sprite, uiTransform, normalSpriteFrame);
                    }
                    replacedCount += 1;
                    details.push({
                        mapping: mapping.raw,
                        nodePath,
                        nodeName,
                        assetName,
                        status: "replaced",
                        message: `Sprite state script refs replaced for ${nodePath}`,
                    });
                    continue;
                }

                details.push({
                    mapping: mapping.raw,
                    nodePath,
                    nodeName,
                    assetName: missingState,
                    status: "missing-asset",
                    message: getMissingAssetMessage(missingState, textureOnlyAssets),
                });
                continue;
            }

            const spriteFrame = assetMap.get(normalizeAssetKey(assetName));
            if (!spriteFrame) {
                details.push({
                    mapping: mapping.raw,
                    nodePath,
                    nodeName,
                    assetName,
                    status: "missing-asset",
                    message: getMissingAssetMessage(assetName, textureOnlyAssets),
                });
                continue;
            }

            if (!sprite) {
                details.push({
                    mapping: mapping.raw,
                    nodePath,
                    nodeName,
                    assetName,
                    status: "missing-component",
                    message: `Node found but has no cc.Sprite: ${nodePath}`,
                });
                continue;
            }

            sprite._spriteFrame = createSpriteFrameRef(spriteFrame.uuid);
            applySimpleTrimmedSpriteSettings(sprite, uiTransform, spriteFrame);
            replacedCount += 1;
            details.push({
                mapping: mapping.raw,
                nodePath,
                nodeName,
                assetName,
                status: "replaced",
                message: `Sprite frame replaced for ${nodePath}`,
            });
        }
    }

    const changed = replacedCount > 0;
    if (changed) {
        fs.writeFileSync(normalizedScenePath, `${JSON.stringify(sceneData, null, 2)}\n`, "utf8");
    }

    return {
        sceneFilePath: normalizedScenePath,
        gameId,
        scannedAssets: assetMap.size,
        mappingCount: mappings.length,
        replacedCount,
        unasyncPrefabCount,
        changed,
        details,
    };
}

export function registerReplaceSpriteHandler() {
    ipcMain.handle("replace-sprite:select-scene-file", async () => {
        const result = await dialog.showOpenDialog({
            properties: ["openFile"],
            filters: [{ name: "Cocos 3.x Scene", extensions: ["scene"] }],
        });
        if (result.canceled || result.filePaths.length === 0) return null;
        return result.filePaths[0];
    });

    ipcMain.handle("replace-sprite:run", async (_event, sceneFilePath: string, gameId: string, mappings: string) => {
        return replaceSprites(sceneFilePath, gameId, mappings);
    });
}

import * as PIXI from "pixi.js";
import { Spine, TextureAtlas, type ISkeletonData } from "pixi-spine";
import * as spine37 from "@pixi-spine/runtime-3.7";
import * as spine38 from "@pixi-spine/runtime-3.8";
import * as spine40 from "@pixi-spine/runtime-4.0";
import * as spine41 from "@pixi-spine/runtime-4.1";
import type { LocalAnimation, LocalSpineAsset } from "./types";

const PREVIEW_WIDTH = 420;
const PREVIEW_HEIGHT = 260;

type RuntimeModule = {
    AtlasAttachmentLoader: new (atlas: TextureAtlas) => unknown;
    SkeletonJson: new (loader: unknown) => { readSkeletonData(data: unknown): ISkeletonData };
    SkeletonBinary?: new (loader: unknown) => { readSkeletonData(data: Uint8Array): ISkeletonData };
};

function runtimeFor(version: string): RuntimeModule {
    if (version.startsWith("3.7")) return spine37 as unknown as RuntimeModule;
    if (version.startsWith("3.8")) return spine38 as unknown as RuntimeModule;
    if (version.startsWith("4.0")) return spine40 as unknown as RuntimeModule;
    if (version.startsWith("4.1")) return spine41 as unknown as RuntimeModule;
    throw new Error(`Unsupported Spine version: ${version}`);
}

function createAtlas(asset: LocalSpineAsset, objectUrls: string[], metadataOnly = false): Promise<TextureAtlas> {
    return new Promise((resolve, reject) => {
        try {
            new TextureAtlas(
                asset.atlasText,
                (pagePath, loaded) => {
                    if (metadataOnly) {
                        loaded(new PIXI.BaseTexture());
                        return;
                    }
                    const normalized = pagePath.replace(/\\/g, "/");
                    const pageFile = asset.pageFiles.get(normalized)
                        || asset.pageFiles.get(normalized.split("/").pop() || normalized);
                    if (!pageFile) {
                        reject(new Error(`Missing atlas image: ${pagePath}`));
                        return;
                    }
                    const objectUrl = URL.createObjectURL(pageFile);
                    objectUrls.push(objectUrl);
                    const texture = PIXI.BaseTexture.from(objectUrl);
                    if (texture.valid) {
                        loaded(texture);
                    } else {
                        texture.once("loaded", () => loaded(texture));
                        texture.once("error", () => reject(new Error(`Cannot load atlas image: ${pagePath}`)));
                    }
                },
                resolve,
            );
        } catch (error) {
            reject(error);
        }
    });
}

function parseSkeletonData(asset: LocalSpineAsset, atlas: TextureAtlas): ISkeletonData {
    const runtime = runtimeFor(asset.version);
    const attachmentLoader = new runtime.AtlasAttachmentLoader(atlas);
    if (asset.format === "binary") {
        if (!runtime.SkeletonBinary) {
            throw new Error(`Binary Spine data is unsupported for version ${asset.version}.`);
        }
        return new runtime.SkeletonBinary(attachmentLoader).readSkeletonData(asset.skeletonData as Uint8Array);
    }
    return new runtime.SkeletonJson(attachmentLoader).readSkeletonData(asset.skeletonData);
}

export async function readSpineAnimations(asset: LocalSpineAsset): Promise<LocalAnimation[]> {
    const atlas = await createAtlas(asset, [], true);
    const skeletonData = parseSkeletonData(asset, atlas) as ISkeletonData & {
        animations?: Array<{ name?: string; duration?: number }>;
    };
    return (skeletonData.animations || [])
        .filter((animation) => Boolean(animation.name))
        .map((animation) => ({
            name: animation.name as string,
            duration: Math.max(animation.duration || 0, 0.01),
        }));
}

let renderQueue = Promise.resolve();

export function renderSpinePose(
    asset: LocalSpineAsset,
    animationName: string,
    timeSec: number,
): Promise<string> {
    const task = renderQueue.then(async () => {
        const objectUrls: string[] = [];
        const app = new PIXI.Application({
            width: PREVIEW_WIDTH,
            height: PREVIEW_HEIGHT,
            antialias: true,
            backgroundColor: 0x111827,
            backgroundAlpha: 0,
            preserveDrawingBuffer: true,
        });

        try {
            const atlas = await createAtlas(asset, objectUrls);
            const spine = new Spine(parseSkeletonData(asset, atlas));
            app.stage.addChild(spine);

            spine.state.setAnimation(0, animationName, false);
            const duration = asset.animations.find((animation) => animation.name === animationName)?.duration || 0;
            spine.update(Math.min(Math.max(timeSec, 0), duration));

            const bounds = spine.getLocalBounds();
            const scale = bounds.width > 0 && bounds.height > 0
                ? Math.min((PREVIEW_WIDTH - 32) / bounds.width, (PREVIEW_HEIGHT - 32) / bounds.height, 1.4)
                : 1;
            spine.scale.set(scale);
            spine.position.set(
                PREVIEW_WIDTH / 2 - (bounds.x + bounds.width / 2) * scale,
                PREVIEW_HEIGHT / 2 - (bounds.y + bounds.height / 2) * scale,
            );
            app.renderer.render(app.stage);
            const extractCanvas = app.renderer.extract.canvas;
            if (!extractCanvas) throw new Error("Pixi canvas extraction is unavailable.");
            const canvas = extractCanvas.call(app.renderer.extract, app.stage) as HTMLCanvasElement;
            return canvas.toDataURL("image/png");
        } finally {
            app.destroy(true, { children: true, texture: true, baseTexture: true });
            objectUrls.forEach((url) => URL.revokeObjectURL(url));
        }
    });

    renderQueue = task.then(() => undefined, () => undefined);
    return task;
}

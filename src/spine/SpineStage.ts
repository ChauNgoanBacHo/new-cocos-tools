// src/spine/SpineStage.ts
// Framework-agnostic wrapper around PixiJS v7 + pixi-spine.
// Importing "pixi-spine" auto-installs the uni-loader (auto-detects spine 3.7/3.8/4.0/4.1).
import * as PIXI from "pixi.js";
import { Spine } from "pixi-spine";

// PixiJS loads textures inside a Web Worker by default. A worker spawned from the
// dev-server origin (http://localhost:5173) cannot fetch our custom spine-asset://
// scheme, so texture pages fail while the main-thread JSON/atlas fetches succeed.
// Force main-thread loading so PNG pages resolve over the custom protocol too.
let prefsApplied = false;
function applyAssetPreferences() {
    if (prefsApplied) return;
    prefsApplied = true;
    PIXI.Assets.setPreferences({ preferWorkers: false, crossOrigin: "anonymous" });
}

export interface SpineStageOptions {
    backgroundColor?: number;
    backgroundAlpha?: number;
}

export interface LoadSpineParams {
    /** Absolute path to the .json skeleton file. */
    jsonPath: string;
    /** Absolute path to the .atlas file. */
    atlasPath: string;
}

/**
 * Convert an absolute local path into a URL served by the custom Electron
 * `spine-asset://` protocol. Plain file:// URLs are NOT fetchable by the Fetch
 * API (which PixiJS uses for textures), so we route through a privileged scheme.
 *
 * The scheme is registered as `standard`, so the first path segment after `//`
 * is parsed as the HOST. We use a fixed host ("local") and put the real absolute
 * path in the pathname. Each segment is percent-encoded but slashes stay literal
 * so PixiJS's path utils (dirname/join) resolve atlas-relative image names.
 */
function toAssetURL(absPath: string): string {
    const normalized = absPath.replace(/\\/g, "/");
    const withoutLead = normalized.startsWith("/") ? normalized.slice(1) : normalized;
    const encoded = withoutLead.split("/").map(encodeURIComponent).join("/");
    return `spine-asset://local/${encoded}`;
}

/**
 * Thin handle around a single PIXI.Application. Holds the spines added to its
 * stage and exposes play/pause/sequence helpers that drive the shared ticker.
 */
export class SpineStage {
    static readonly MIN_ZOOM = 0.1;
    static readonly MAX_ZOOM = 10;

    readonly app: PIXI.Application;
    private spines: Spine[] = [];
    private destroyed = false;
    // Fit state for the single previewed spine, plus the current zoom factor
    // (1 = fit-to-view). Zoom is applied as baseScale * zoom.
    private fit: { spine: Spine; baseScale: number; centerX: number; centerY: number } | null = null;
    private zoom = 1;
    private bgSprite: PIXI.Sprite | null = null;

    constructor(container: HTMLElement, opts: SpineStageOptions = {}) {
        // Let Pixi create its own canvas (a fresh WebGL context every mount —
        // avoids reusing a destroyed context, which yields maxIfs=0 errors under
        // React StrictMode's double-mount).
        this.app = new PIXI.Application({
            resizeTo: container,
            antialias: true,
            backgroundColor: opts.backgroundColor ?? 0x1e1e22,
            backgroundAlpha: opts.backgroundAlpha ?? 1,
            autoDensity: true,
            resolution: window.devicePixelRatio || 1,
        });
        const view = this.app.view as HTMLCanvasElement;
        view.style.width = "100%";
        view.style.height = "100%";
        view.style.display = "block";
        container.appendChild(view);

        // Load default background image from src/assets/background.jpg.
        // Use new URL(...) so Vite resolves the asset in both dev and production.
        const defaultBgUrl = new URL("../assets/background.jpg", import.meta.url).href;
        this.loadBackgroundImage(defaultBgUrl).catch(err => {
            console.error("Failed to load default background:", err);
        });

        // Re-fit spine and background on canvas resize
        const resizeObserver = new ResizeObserver(() => this.onResize());
        resizeObserver.observe(container);
    }

    /** Load an image and use it as a background sprite (cover mode). */
    private async loadBackgroundImage(imageUrl: string): Promise<void> {
        if (this.destroyed) return;
        try {
            const texture = await PIXI.Assets.load<PIXI.Texture>(imageUrl);
            if (this.destroyed) return;
            // Remove existing
            if (this.bgSprite) {
                this.app.stage.removeChild(this.bgSprite);
                this.bgSprite.destroy();
                this.bgSprite = null;
            }
            this.bgSprite = new PIXI.Sprite(texture);
            const sw = this.app.renderer.width / this.app.renderer.resolution;
            const sh = this.app.renderer.height / this.app.renderer.resolution;
            const scale = Math.max(sw / texture.width, sh / texture.height);
            this.bgSprite.width = texture.width * scale;
            this.bgSprite.height = texture.height * scale;
            this.bgSprite.x = (sw - this.bgSprite.width) / 2;
            this.bgSprite.y = (sh - this.bgSprite.height) / 2;
            this.app.stage.addChildAt(this.bgSprite, 0);
        } catch (err) {
            console.error("Failed to load background image:", err);
        }
    }

    /** Load a spine from local json+atlas. Adds it to the stage and returns it. */
    async loadSpine(params: LoadSpineParams): Promise<Spine> {
        applyAssetPreferences();
        const jsonUrl = toAssetURL(params.jsonPath);
        // Tell the loader exactly which atlas to use; images are resolved relative
        // to the atlas's own directory by the loader.
        const atlasUrl = toAssetURL(params.atlasPath);

        const resource = await PIXI.Assets.load({
            src: jsonUrl,
            data: { spineAtlasFile: atlasUrl },
        });

        const spine = new Spine(resource.spineData);
        if (this.destroyed) {
            spine.destroy();
            throw new Error("SpineStage was destroyed before load completed");
        }
        this.spines.push(spine);
        this.app.stage.addChild(spine);
        return spine;
    }

    /**
     * Center + scale a single spine to fit the current view (with padding).
     * Stores the computed base scale and center so zoom can be applied on top
     * via setZoom() without recomputing the fit.
     */
    fitToView(spine: Spine, padding = 1.15): void {
        const bounds = spine.getLocalBounds();
        const view = this.app.screen;
        if (bounds.width === 0 || bounds.height === 0) {
            this.fit = { spine, baseScale: 1, centerX: 0, centerY: 0 };
            this.zoom = 1;
            spine.position.set(view.width / 2, view.height / 2);
            return;
        }
        const baseScale = Math.min(view.width / bounds.width, view.height / bounds.height) / padding;
        this.fit = {
            spine,
            baseScale,
            centerX: bounds.x + bounds.width / 2,
            centerY: bounds.y + bounds.height / 2,
        };
        this.zoom = 1;
        this.applyFit();
    }

    /** Re-apply scale (baseScale * zoom) and recenter the fitted spine. */
    private applyFit(): void {
        const fit = this.fit;
        if (!fit) return;
        const view = this.app.screen;
        const scale = fit.baseScale * this.zoom;
        fit.spine.scale.set(scale);
        fit.spine.position.set(
            view.width / 2 - fit.centerX * scale,
            view.height / 2 - fit.centerY * scale,
        );
    }

    /** Set the zoom factor (1 = fit). Clamped to a sensible range. */
    setZoom(zoom: number): number {
        this.zoom = Math.max(SpineStage.MIN_ZOOM, Math.min(SpineStage.MAX_ZOOM, zoom));
        this.applyFit();
        return this.zoom;
    }

    /** Multiply the current zoom by a factor (e.g. wheel step). */
    zoomBy(factor: number): number {
        return this.setZoom(this.zoom * factor);
    }

    get currentZoom(): number {
        return this.zoom;
    }

    /** Re-center the fitted spine and refit background on canvas resize. */
    private onResize(): void {
        // Refit background sprite to cover the new canvas size
        if (this.bgSprite) {
            const sw = this.app.renderer.width / this.app.renderer.resolution;
            const sh = this.app.renderer.height / this.app.renderer.resolution;
            const texture = this.bgSprite.texture;
            const scale = Math.max(sw / texture.width, sh / texture.height);
            this.bgSprite.width = texture.width * scale;
            this.bgSprite.height = texture.height * scale;
            this.bgSprite.x = (sw - this.bgSprite.width) / 2;
            this.bgSprite.y = (sh - this.bgSprite.height) / 2;
        }
        // Re-center the spine
        if (this.fit) {
            this.applyFit();
        }
    }

    /** Available animation names for a spine. */
    static animationNames(spine: Spine): string[] {
        return spine.spineData.animations.map(a => a.name);
    }

    /** Total duration (seconds) of a named animation, or 0 if not found. */
    static animationDuration(spine: Spine, name: string): number {
        const anim = spine.spineData.animations.find(a => a.name === name);
        return anim ? anim.duration : 0;
    }

    /**
     * Live playback state of track 0, derived from the current TrackEntry.
     * `elapsed` is the position WITHIN the current loop cycle (resets to 0 each
     * loop and when the next sequenced animation starts); `duration` is the
     * currently-playing animation's length; `name` is its name.
     */
    static currentPlayback(spine: Spine): { elapsed: number; duration: number; name: string } {
        const entry = spine.state.tracks[0] as
            | { trackTime: number; loop?: boolean; animation?: { duration: number; name: string } }
            | undefined;
        if (!entry || !entry.animation) return { elapsed: 0, duration: 0, name: "" };
        const duration = entry.animation.duration;
        // Spine's trackTime accumulates monotonically. For a looping animation,
        // show the position inside the current cycle (resets each loop). For a
        // one-shot, clamp at the duration once it finishes.
        let elapsed = entry.trackTime;
        if (duration > 0) {
            elapsed = entry.loop ? entry.trackTime % duration : Math.min(entry.trackTime, duration);
        }
        return { elapsed, duration, name: entry.animation.name };
    }

    /** Set the active skin by name and reset slots to its setup pose. */
    static setSkin(spine: Spine, name: string): void {
        const skeleton = spine.skeleton as unknown as {
            setSkinByName(n: string): void;
            setSlotsToSetupPose(): void;
        };
        skeleton.setSkinByName(name);
        skeleton.setSlotsToSetupPose();
    }

    /** Play one animation on track 0. */
    static playAnimation(spine: Spine, name: string, loop: boolean): void {
        spine.state.setAnimation(0, name, loop);
    }

    /**
     * Seek track 0 to a local time (seconds) within its current animation and
     * re-pose WITHOUT advancing playback. Pair with renderOnce() when the ticker
     * is paused so the new frame is drawn. Time is clamped to [0, duration].
     */
    static seek(spine: Spine, localTime: number): void {
        const entry = spine.state.tracks[0] as
            | { trackTime: number; animation?: { duration: number } }
            | undefined;
        if (!entry || !entry.animation) return;
        const clamped = Math.max(0, Math.min(localTime, entry.animation.duration));
        entry.trackTime = clamped;
        // delta 0: applies the pose at trackTime without moving it forward.
        spine.update(0);
    }

    /**
     * Subscribe to track-0 "complete" events (fires when an animation finishes,
     * including each loop). Returns a disposer that removes the listener.
     */
    static onComplete(spine: Spine, cb: () => void): () => void {
        const listener = { complete: () => cb() };
        spine.state.addListener(listener);
        return () => spine.state.removeListener(listener);
    }

    /**
     * Play a list of animations back-to-back on track 0 using the native queue.
     * The first replaces the current track; the rest are queued via addAnimation.
     */
    static playSequence(spine: Spine, names: string[], loopLast: boolean): void {
        if (names.length === 0) return;
        spine.state.setAnimation(0, names[0], names.length === 1 ? loopLast : false);
        for (let i = 1; i < names.length; i++) {
            const isLast = i === names.length - 1;
            spine.state.addAnimation(0, names[i], isLast ? loopLast : false, 0);
        }
    }

    /**
     * Resume a sequence starting at `startIndex`, with the first played step
     * offset by `offset` seconds into its own timeline. Used after scrubbing a
     * sequence: the active step is set (and seeked), the remaining steps queued.
     */
    static playSequenceFrom(spine: Spine, names: string[], startIndex: number, offset: number, loopLast: boolean): void {
        const steps = names.slice(Math.max(0, startIndex));
        if (steps.length === 0) return;
        const entry = spine.state.setAnimation(0, steps[0], steps.length === 1 ? loopLast : false) as
            | { trackTime: number }
            | undefined;
        if (entry && offset > 0) entry.trackTime = offset;
        for (let i = 1; i < steps.length; i++) {
            const isLast = i === steps.length - 1;
            spine.state.addAnimation(0, steps[i], isLast ? loopLast : false, 0);
        }
    }

    /** Set the mix/crossfade duration between two named animations. */
    static setMix(spine: Spine, fromName: string, toName: string, duration: number): void {
        spine.state.data.setMix(fromName, toName, duration);
    }

    /** Set the default mix duration applied to all transitions without a specific rule. */
    static setDefaultMix(spine: Spine, duration: number): void {
        spine.state.data.defaultMix = duration;
    }

    /** Get the current mix duration between two named animations. */
    static getMix(spine: Spine, fromName: string, toName: string): number {
        const fromAnim = spine.spineData.findAnimation(fromName);
        const toAnim = spine.spineData.findAnimation(toName);
        if (!fromAnim || !toAnim) return spine.state.data.defaultMix;
        return spine.state.data.getMix(fromAnim, toAnim);
    }

    /** Pause/resume every spine on this stage via the shared ticker. */
    setPaused(paused: boolean): void {
        if (paused) this.app.ticker.stop();
        else this.app.ticker.start();
    }

    /**
     * Force a single render of the current stage state. Use while paused (ticker
     * stopped) after seek() so the new pose is actually drawn to the canvas.
     */
    renderOnce(): void {
        if (this.destroyed) return;
        this.app.renderer.render(this.app.stage);
    }

    /** Time scale for all spines (1 = normal). */
    setTimeScale(scale: number): void {
        for (const spine of this.spines) spine.state.timeScale = scale;
    }

    get loadedSpines(): readonly Spine[] {
        return this.spines;
    }

    /** Set background mode: 'transparent' (checkerboard via alpha) or 'image' (jpg). */
    async setBackground(mode: 'transparent' | 'image', imageUrl?: string): Promise<void> {
        if (this.destroyed) return;

        // Remove existing bg sprite if any
        if (this.bgSprite) {
            this.app.stage.removeChild(this.bgSprite);
            this.bgSprite.destroy();
            this.bgSprite = null;
        }

        if (mode === 'transparent') {
            // Set transparent background (alpha 0)
            this.app.renderer.background.color = 0x000000;
            this.app.renderer.background.alpha = 0;
        } else if (mode === 'image' && imageUrl) {
            // Set solid color first as fallback
            this.app.renderer.background.color = 0x1e1e22;
            this.app.renderer.background.alpha = 1;

            try {
                const texture = await PIXI.Assets.load<PIXI.Texture>(imageUrl);
                if (this.destroyed) return;
                this.bgSprite = new PIXI.Sprite(texture);
                // Scale to cover the stage
                const sw = this.app.renderer.width / this.app.renderer.resolution;
                const sh = this.app.renderer.height / this.app.renderer.resolution;
                const scale = Math.max(sw / texture.width, sh / texture.height);
                this.bgSprite.width = texture.width * scale;
                this.bgSprite.height = texture.height * scale;
                this.bgSprite.x = (sw - this.bgSprite.width) / 2;
                this.bgSprite.y = (sh - this.bgSprite.height) / 2;
                // Send to back of stage
                this.app.stage.addChildAt(this.bgSprite, 0);
            } catch (err) {
                console.error('Failed to load background image:', err);
            }
        }
    }

    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        const view = this.app.view as HTMLCanvasElement;
        // Destroy the app, its view children and the WebGL context to avoid leaks
        // across repeated modal opens.
        this.app.destroy(true, { children: true, texture: false, baseTexture: false });
        // app.destroy(true) removes the canvas, but guard in case it was reparented.
        view.parentElement?.removeChild(view);
        this.spines = [];
    }
}

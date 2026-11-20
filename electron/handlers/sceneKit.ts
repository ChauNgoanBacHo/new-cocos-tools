import { dialog, ipcMain } from "electron";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

interface BoilerplateFileResult {
    filePath: string;
    status: "created" | "exists" | "updated";
}

interface SceneKitPatchTarget {
    filePath: string;
    status: "exists" | "missing";
}

interface ComponentRefReplacement {
    from: string;
    to: string;
    count: number;
}

type SceneKitSourceType = "scene" | "fire";

const UUID_BASE64_KEY_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function extractGameIdFromScenePath(sceneFilePath: string) {
    const fileName = path.basename(sceneFilePath);
    const sceneNameMatch = fileName.match(/^g(\d{4,})(?:[A-Za-z])?\.(?:scene|fire)$/i);
    if (sceneNameMatch) {
        return sceneNameMatch[1];
    }

    const fallbackMatch = sceneFilePath.match(/(?:^|[^\d])(\d{4,})(?:[^\d]|$)/);
    return fallbackMatch ? fallbackMatch[1] : "";
}

function normalizeSceneKitSourceType(sourceType?: string): SceneKitSourceType {
    return sourceType === "fire" ? "fire" : "scene";
}

function getSceneKitSourceExtension(sourceType: SceneKitSourceType) {
    return sourceType === "fire" ? ".fire" : ".scene";
}

function isCocosSceneFile(filePath: string, sourceType: SceneKitSourceType = "scene") {
    return sourceType === "fire" ? /\.fire$/i.test(filePath) : /\.scene$/i.test(filePath);
}

function isCocosSceneOrPrefabFile(filePath: string) {
    return /\.(scene|fire|prefab)$/i.test(filePath);
}

function createCocosImport(names: string[], sourceType: SceneKitSourceType) {
    const importNames = sourceType === "fire" ? names.filter((name) => name === "_decorator") : names;
    if (sourceType === "fire") {
        return importNames.length ? `const { ${importNames.join(", ")} } = cc;` : "";
    }

    return `import { ${importNames.join(", ")} } from 'cc';`;
}

const FIRE_COCOS_GLOBAL_NAMES = [
    "Button",
    "Color",
    "Component",
    "Director",
    "EventKeyboard",
    "KeyCode",
    "Label",
    "Node",
    "ParticleSystem",
    "ProgressBar",
    "Tween",
    "UIRenderer",
    "Vec2",
    "Vec3",
    "director",
    "game",
    "instantiate",
    "log",
    "sys",
    "tween",
];

function qualifyFireCocosGlobals(content: string, sourceType: SceneKitSourceType) {
    if (sourceType !== "fire") {
        return content;
    }

    const normalizedContent = content
        .replace(/^import\s+\{[^}]+\}\s+from\s+['"]cc['"];\n?/gm, "")
        .replace(/const\s*\{\s*([^}]+)\s*\}\s*=\s*cc;/g, (_match, rawNames: string) => {
            const names = rawNames.split(",").map((name) => name.trim()).filter(Boolean);
            return names.includes("_decorator") ? "const { _decorator } = cc;" : "";
        });

    const fireContent = normalizedContent.replace(/(^|[^A-Za-z0-9_.$])ParticleSystem2D(?![A-Za-z0-9_$])/g, "$1cc.ParticleSystem");

    return FIRE_COCOS_GLOBAL_NAMES.reduce((nextContent, name) => {
        const namePattern = new RegExp(`(^|[^A-Za-z0-9_.$])${name}(?![A-Za-z0-9_$])`, "g");
        return nextContent.replace(namePattern, `$1cc.${name}`);
    }, fireContent);
}

function getSlotModuleExportPath(sourceType: SceneKitSourceType) {
    return sourceType === "fire"
        ? "../../../../cc-common/cc-slot-module/SlotModuleExport"
        : "../../../../cc-common/cc30-slot-module/SlotModuleExport";
}

function createSlotModuleImport(names: string[], sourceType: SceneKitSourceType) {
    return `import { ${names.join(", ")} } from '${getSlotModuleExportPath(sourceType)}';`;
}

function createGameLogicUiEventsImport(sourceType: SceneKitSourceType) {
    return sourceType === "fire"
        ? "import { GameLogicUIEvents } from '../../../../cc-common/cc-slot-module/Core/GameLogicUIEvents';"
        : createSlotModuleImport(["GameLogicUIEvents"], sourceType);
}

function createCcClassDecorator(className: string, sourceType: SceneKitSourceType) {
    return sourceType === "fire" ? "@ccclass" : `@ccclass('${className}')`;
}

function createNullInitializer(sourceType: SceneKitSourceType) {
    return sourceType === "fire" ? "null!" : "null";
}

function createTweenType(sourceType: SceneKitSourceType) {
    return sourceType === "fire" ? "cc.Tween" : "Tween<any>";
}

function createNullableStringField(sourceType: SceneKitSourceType) {
    return sourceType === "fire" ? "string = ''" : "string | null = null";
}

function createEmptyStringValue(sourceType: SceneKitSourceType) {
    return sourceType === "fire" ? "''" : "null";
}

function parseTableFormatInput(tableFormatInput?: string): number[] {
    const rawValue = String(tableFormatInput || "").trim();
    const normalizedValue = rawValue || "3,3,3,3,3";
    const withoutBrackets = normalizedValue.replace(/^\[/, "").replace(/\]$/, "");
    const tableFormat = withoutBrackets
        .split(",")
        .map((value) => Number.parseInt(value.trim(), 10))
        .filter((value) => Number.isFinite(value));

    if (tableFormat.length === 0) {
        throw new Error("Table format is required.");
    }

    if (tableFormat.some((value) => value <= 0)) {
        throw new Error("Table format must contain positive numbers only.");
    }

    return tableFormat;
}

function formatNumberArray(values: number[]) {
    return `[${values.join(", ")}]`;
}

function compressUuid(uuid: string, reservedLength: 2 | 5): string | null {
    const cleanUuid = uuid.replace(/-/g, "").toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(cleanUuid)) return null;

    let compressed = cleanUuid.slice(0, reservedLength);
    for (let i = reservedLength; i < 32; i += 3) {
        const chunk = cleanUuid.slice(i, i + 3);
        if (chunk.length !== 3) return null;

        const value = parseInt(chunk, 16);
        compressed += UUID_BASE64_KEY_CHARS[value >> 6];
        compressed += UUID_BASE64_KEY_CHARS[value & 0x3f];
    }

    return compressed;
}

function getUuidReplacementPairs(oldUuid: string, newUuid: string) {
    const normalizedOldUuid = oldUuid.toLowerCase();
    const normalizedNewUuid = newUuid.toLowerCase();
    const oldDashlessUuid = normalizedOldUuid.replace(/-/g, "");
    const newDashlessUuid = normalizedNewUuid.replace(/-/g, "");
    const pairs = new Map<string, string>();
    pairs.set(oldUuid, newUuid);
    pairs.set(normalizedOldUuid, normalizedNewUuid);
    pairs.set(oldDashlessUuid, newDashlessUuid);

    const oldCompressedUuid = compressUuid(normalizedOldUuid, 5);
    const newCompressedUuid = compressUuid(normalizedNewUuid, 5);
    if (oldCompressedUuid && newCompressedUuid) {
        pairs.set(oldCompressedUuid, newCompressedUuid);
    }

    const oldMinCompressedUuid = compressUuid(normalizedOldUuid, 2);
    const newMinCompressedUuid = compressUuid(normalizedNewUuid, 2);
    if (oldMinCompressedUuid && newMinCompressedUuid) {
        pairs.set(oldMinCompressedUuid, newMinCompressedUuid);
    }

    return Array.from(pairs.entries()).map(([from, to]) => ({ from, to }));
}

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createEventConfigTemplate(gameId: string) {
    return `export const GAME_EVENT_${gameId} = {
    PRE_RESUME_FREE_GAME_MATRIX: 'PRE_RESUME_FREE_GAME_MATRIX_${gameId}',
};

export const BUTTON_EVENT_${gameId} = {
    PLAY_HOLD_ANIM : 'PLAY_HOLD_ANIM_${gameId}',
    CANCEL_HOLD_ANIM : 'CANCEL_HOLD_ANIM_${gameId}',
}
`;
}

function createSoundConfigTemplate() {
    return `export const SOUND_CONFIG = {
    BTN_AUTO: 'BTN_AUTO',
    BTN_SPIN: 'BTN_SPIN',
    SFX_BIGWIN: 'SFX_BIGWIN',
    SFX_BIGWIN_END: 'SFX_BIGWIN_END',
    SFX_TURBO_BIGWIN: 'SFX_TURBO_BIGWIN',
    SFX_COUNTING: 'SFX_COUNTING',
    SFX_COUNTING_END: 'SFX_COUNTING_END',
    SFX_JP: 'SFX_JP',
    SFX_JP_END: 'SFX_JP_END',
    SFX_SCATTER_TRIGGER: 'SFX_SCATTER_TRIGGER',
    SFX_JP_TRIGGER: 'SFX_JP_TRIGGER',
    SFX_WIN_1: 'SFX_WIN_1',
    SFX_WIN_2: 'SFX_WIN_2',
    SFX_WIN_3: 'SFX_WIN_3',
    SFX_WIN_4: 'SFX_WIN_4',
    SFX_TOTALWIN: 'SFX_TOTALWIN',
    SFX_TOTALWIN_END: 'SFX_TOTALWIN_END'
};
`;
}

function createAnimConfigTemplate() {
    return `export const BTN_SPIN_ANIM = {
    PRESS_STOP: 'press_stop',
};

export const UI_BIGWIN_ANIM = {
    BW_APPEAR: 'bw_appear',
    BW_DISAPPEAR: 'bw_disappear',
    BW_IDLE: 'bw_idle',
    MW_APPEAR: 'mw_appear',
    MW_DISAPPEAR: 'mw_disappear',
    MW_IDLE: 'mw_idle',
    SMW_APPEAR: 'smw_appear',
    SMW_DISAPPEAR: 'smw_disappear',
    SMW_IDLE: 'smw_idle',
};

export const UI_JACKPOT_ANIM = {
    APPEAR: 'appear',
    DISAPPEAR: 'disappear',
    IDLE: 'idle',
};

export const UI_WIN_AMOUNT_ANIM = {
    STATIC: 'static',
    WIN_0: 'win_0',
    WIN_1: 'win_1',
    WIN_2: 'win_2',
    WIN_3_END: 'win_3_end',
    WIN_3_START: 'win_3_start',
    WIN_4_END: 'win_4_end',
    WIN_4_START: 'win_4_start',
};

export const UI_SUBWINAMOUNT_ANIM = {
    APPEAR: 'appear',
    DISAPPEAR: 'disappear',
    END_4: 'end_4',
    END_123: 'end_123',
    END_123_TO_END_4: 'end_123_to_end_4',
    IDLE: 'idle',
    IMPACT: 'impact',
};

export const UI_TOTALWIN_ANIM = {
    LV1_APPEAR: 'lv1_appear',
    LV1_DISAPPEAR: 'lv1_disappear',
    LV1_IDLE: 'lv1_idle',
    LV2_APPEAR: 'lv2_appear',
    LV2_DISAPPEAR: 'lv2_disappear',
    LV2_IDLE: 'lv2_idle',
    LV3_APPEAR: 'lv3_appear',
    LV3_DISAPPEAR: 'lv3_disappear',
    LV3_IDLE: 'lv3_idle',
};
`;
}

function createTimeConfigTemplate() {
    return `export const UI_SUBWINAMOUNT_TIME = {
    APPEAR: 0.5,
    DISAPPEAR: 0.333,
    END_4: 0.667,
    END_123: 0.501,
    END_123_TO_END_4: 0.5,
    IDLE: 2,
    IMPACT: 0.5,
};
`;
}

function createDataTypeTemplate(gameId: string) {
    return `export enum DataType${gameId} {
}
`;
}

function createDataUtilsTemplate(gameId: string) {
    return `export class DataUtils${gameId} {
}
`;
}

function createGameConstantTemplate(gameId: string, tableFormat: number[]) {
    return `export const GameConstant${gameId} = {
    SYMBOL_HEIGHT: 128,
    SYMBOL_WIDTH: 140,
    TABLE_FORMAT: ${formatNumberArray(tableFormat)},
    SCATTER_SYMBOL: 'A',
    WILD_SYMBOL: 'K',
};
`;
}

function createGameConfigTemplate(gameId: string, sourceType: SceneKitSourceType = "scene") {
    return `${createCocosImport(["_decorator"], sourceType)}
${createSlotModuleImport(["GameConfig"], sourceType)}
${createSlotModuleImport(["PAY_SYSTEM_TYPE_ENUM"], sourceType)}
import { GameConstant${gameId} } from '../Utils/GameConstant${gameId}';
const { ccclass } = _decorator;
${createCcClassDecorator("GameConfig" + gameId, sourceType)}
export class GameConfig${gameId} extends GameConfig {
    public GAME_ID = "${gameId}";
    public JP_PREFIX_EVENT = "${gameId}_";
    public PAY_SYSTEM = PAY_SYSTEM_TYPE_ENUM.ALLWAYS;
    public TOTAL_BET_CREDIT:number = 25;
    public readonly TABLE_FORMAT: number[] = GameConstant${gameId}.TABLE_FORMAT;
    public readonly SYMBOL_HEIGHT: number = GameConstant${gameId}.SYMBOL_HEIGHT;
    public readonly SYMBOL_WIDTH: number = GameConstant${gameId}.SYMBOL_WIDTH;
    public readonly WIN_LEVEL_CONFIG: any = {
        THRESHOLDS: [1, 3, 10],
        COUNT_MONEY_TIME: { 1: 0.5, 2: 1, 3: 2, 4: 4 },
        WIN_LINE_TIME: { 1: 1.5, 2: 2.5, 3: 3.5, 4: 5.5 },
    };
    public readonly DEFAULT_TRIAL_BET_ID: string = '50';

    // NOTE: should update Default trial for VND & THB
    public readonly DEFAULT_TRIAL_JACKPOT: any = {
		VND: {
			"1_GRAND": 400000,
			"2_GRAND": 800000,
			"3_GRAND": 1200000,
			"4_GRAND": 2000000,
			"5_GRAND": 4000000,
			"6_GRAND": 8000000,
			"7_GRAND": 12000000,
		},
		USD: {
			"1_USD_GRAND": 80,
			"2_USD_GRAND": 400,
			"3_USD_GRAND": 800,
			"4_USD_GRAND": 4000,
			"5_USD_GRAND": 8000,
			"6_USD_GRAND": 40000,
			"7_USD_GRAND": 80000,
		},
		THB: {
			"1_THB_GRAND": 3000,
			"2_THB_GRAND": 5000,
			"3_THB_GRAND": 10000,
			"4_THB_GRAND": 20000,
			"5_THB_GRAND": 30000,
			"6_THB_GRAND": 50000,
			"7_THB_GRAND": 100000,
		}
	};

	public readonly DEFAULT_WALLET_TRIAL: any = {
		VND: 20000000,
		USD: 10000,
		THB: 300000,
	};
}
`;
}

function createGameDirectorTemplate(gameId: string, sourceType: SceneKitSourceType = "scene") {
    return `${createCocosImport(["_decorator"], sourceType)}
const { ccclass } = _decorator;
${createSlotModuleImport(["GAME_MODE_ENUM", "GameDirector"], sourceType)}
import { FreeGameDirectorModule${gameId} } from '../GameMode/FreeGameDirectorModule${gameId}';
import { GameConstant${gameId} } from '../Utils/GameConstant${gameId}';
import { GAME_EVENT_${gameId} } from '../DataConfig/EventConfig${gameId}';
${createCcClassDecorator("GameDirector" + gameId, sourceType)}
export class GameDirector${gameId} extends GameDirector {
    onLoadExtend(): void {
        super.onLoadExtend();
        this.eventManager.on(GAME_EVENT_${gameId}.PRE_RESUME_FREE_GAME_MATRIX, this.onPreResumeFreeGameMatrix, this);
    }

    onPreResumeFreeGameMatrix(matrix: string[]): void {
        const freeMode = this.gameModes.find(e => e.type === GAME_MODE_ENUM.FREE_GAME);
        if (!freeMode) {
            return;
        }
        const matrix2D = eno.SlotUtils.convertSlotMatrix(matrix, GameConstant${gameId}.TABLE_FORMAT);
        freeMode.rootNode.getComponent(FreeGameDirectorModule${gameId}).preResumeFreeTable(matrix2D);
    }
}
`;
}

function createSlotSoundPlayerModuleTemplate(gameId: string, sourceType: SceneKitSourceType = "scene") {
    return `${createCocosImport(["_decorator", "log", "sys"], sourceType)}
${createSlotModuleImport(["SlotSoundPlayerModule"], sourceType)}
const { ccclass } = _decorator;
${createCcClassDecorator("SlotSoundPlayerModule" + gameId, sourceType)}
export class SlotSoundPlayerModule${gameId} extends SlotSoundPlayerModule{
    _onEventShow(): void {
        const isIOS = sys.os == sys.OS.IOS;
        if (this.isWebSound && isIOS) {
            this.scheduleOnce(() => {
                this.resumeContext().then(() => {
                    this._soundPlayer && this._soundPlayer.onEventShow(this.musicVolume === 1 ? this.isEnableBGM : false, this.isEnableSFX);
                });
            }, 0.5);
        } else {
            this._soundPlayer && this._soundPlayer.onEventShow(this.musicVolume === 1 ? this.isEnableBGM : false, this.isEnableSFX);
        }
    }

    async resumeContext(): Promise<void> {
        const Howler = globalThis.Howler;
        if (!Howler?.ctx) {
            return Promise.resolve();
        }

        const ctx = Howler.ctx;
        const state = ctx.state;
        try {
            if (state === 'interrupted' || state === 'suspended') {
                await ctx.resume();
            } else if (state === 'running') {
                const iOSVersion = this._getVersionIOS();
                if (sys.os === sys.OS.IOS && iOSVersion >= 14) {
                    await ctx.suspend();
                    await ctx.resume();
                }
            }
        } catch (e) {
            await ctx.resume();
        }
    }

    fadeMusicTo(duration: number, volume: number, onComplete?: () => void): void {
        this.musicVolume = volume;
        super.fadeMusicTo(duration, volume, onComplete);
    }

    setMusicVolume(volume: number): void {
        this.musicVolume = volume;

        if (this.isMuteMusic) {
            return;
        }

        super.setMusicVolume(volume);
    }
}
`;
}

function createPaylineConfigTemplate(gameId: string, sourceType: SceneKitSourceType = "scene") {
    return `${createCocosImport(["_decorator", "Vec2"], sourceType)}
${createSlotModuleImport(["PaylineConfig", "PAYLINE_TYPE"], sourceType)}
import { GameConstant${gameId} } from '../Utils/GameConstant${gameId}';
const { ccclass } = _decorator;
${createCcClassDecorator("PaylineConfig" + gameId, sourceType)}
export class PaylineConfig${gameId} extends PaylineConfig {
    public readonly PAYLINE_TYPE: PAYLINE_TYPE = PAYLINE_TYPE.AllWays;
    public readonly TABLE_CONFIG: any = {
        format: GameConstant${gameId}.TABLE_FORMAT,
        cellSize: new Vec2(GameConstant${gameId}.SYMBOL_WIDTH, GameConstant${gameId}.SYMBOL_HEIGHT),
        positions: [],
    };
}
`;
}

function createPaylineSymbolModuleTemplate(gameId: string, sourceType: SceneKitSourceType = "scene") {
    return `${createCocosImport(["_decorator"], sourceType)}
${createSlotModuleImport(["PayLineInfo", "PaylineSymbolModule", "PayWayInfo"], sourceType)}
import { GameConstant${gameId} } from '../Utils/GameConstant${gameId}';
import { SOUND_CONFIG } from '../DataConfig/SoundConfig${gameId}';
const { ccclass } = _decorator;
${createCcClassDecorator("PaylineSymbolModule" + gameId, sourceType)}
export class PaylineSymbolModule${gameId} extends PaylineSymbolModule {
    protected showSpecialSymbolById(symbolId: string, duration?: number): void {
        super.showSpecialSymbolById(symbolId, duration);
        if (symbolId === GameConstant${gameId}.SCATTER_SYMBOL) {
            this.soundPlayer.stopMusic();
            this.soundPlayer.playSfx(SOUND_CONFIG.SFX_SCATTER_TRIGGER);
        }
    }

    protected showJackpotLine(payLine: PayLineInfo | PayWayInfo, duration?: number): void {
        super.showJackpotLine(payLine, duration);
        this.soundPlayer.stopMusic();
        this.soundPlayer.playSfx(SOUND_CONFIG.SFX_JP_TRIGGER);
    }
}
`;
}

function createTableModuleConfigTemplate(gameId: string, sourceType: SceneKitSourceType = "scene") {
    return `${createCocosImport(["_decorator"], sourceType)}
${createSlotModuleImport(["TableModuleConfig"], sourceType)}
import { GameConstant${gameId} } from '../Utils/GameConstant${gameId}';
const { ccclass } = _decorator;
${createCcClassDecorator("TableModuleConfig" + gameId, sourceType)}
export class TableModuleConfig${gameId} extends TableModuleConfig {
    public SYMBOL_WIDTH: number = GameConstant${gameId}.SYMBOL_WIDTH;
    public SYMBOL_HEIGHT: number = GameConstant${gameId}.SYMBOL_HEIGHT;
    public TABLE_FORMAT: number[] = GameConstant${gameId}.TABLE_FORMAT;
}
`;
}

function createSlotReelModuleTemplate(gameId: string, sourceType: SceneKitSourceType = "scene") {
    return `${createCocosImport(["_decorator"], sourceType)}
${createSlotModuleImport(["SlotReelModule"], sourceType)}
const { ccclass } = _decorator;
${createCcClassDecorator("SlotReelModule" + gameId, sourceType)}
export class SlotReelModule${gameId} extends SlotReelModule {
    gameMode: number = ${createNullInitializer(sourceType)};

    setGameMode(gameMode: number): void {
        this.gameMode = gameMode;
    }
}
`;
}

function createSlotSymbolModuleTemplate(gameId: string, sourceType: SceneKitSourceType = "scene") {
    if (sourceType === "fire") {
        return `${createCocosImport(["_decorator"], sourceType)}
${createSlotModuleImport(["SlotSymbolModule"], sourceType)}
const { ccclass } = _decorator;
const { fadeIn, fadeOut } = eno;
${createCcClassDecorator("SlotSymbolModule" + gameId, sourceType)}
export class SlotSymbolModule${gameId} extends SlotSymbolModule {
    enableHighlight(duration: number = 0.2): void {
        if (duration > 0) {
            this.node["isHighlight"] = true;
            fadeIn(this.node, duration);
            return;
        }

        super.enableHighlight();
    }

    disableHighlight(duration: number = 0.2): void {
        if (duration > 0) {
            this.node["isHighlight"] = false;
            fadeOut(this.node, duration);
            return;
        }

        super.disableHighlight();
    }
}
`;
    }

    return `${createCocosImport(["_decorator", "Color", "tween", "Tween", "UIRenderer"], sourceType)}
${createSlotModuleImport(["SlotSymbolModule"], sourceType)}
const { ccclass } = _decorator;
${createCcClassDecorator("SlotSymbolModule" + gameId, sourceType)}
export class SlotSymbolModule${gameId} extends SlotSymbolModule {
    tweenColor(obj: UIRenderer, duration: number, targetColor: Color): Tween<any> {
        const startColor = obj.color.clone();
        const colorData = { r: startColor.r, g: startColor.g, b: startColor.b };
        const toColor = { r: targetColor.r, g: targetColor.g, b: targetColor.b };

        const tweenAction = tween(colorData)
            .to(duration, toColor,
                {
                    onUpdate: () => {
                        if (obj && obj.isValid) {
                            obj.color = new Color(colorData.r, colorData.g, colorData.b, obj.color.a);
                        }
                    }
                })
            .start();

        return tweenAction;
    }

    tweenRenderersColor(duration: number, targetColor: Color): void {
        this._rendererList.forEach(renderer => {
            if (!renderer.color.equals(targetColor)) {
                if (duration) {
                    const tweenColor = this.tweenColor(renderer, duration, targetColor);
                    renderer['tweenColor'] = tweenColor;
                } else {
                    renderer.color = targetColor;
                }
            }
        });
    }

    stopColorTweens(): void {
        this._rendererList.forEach(renderer => {
            renderer['tweenColor'] && renderer['tweenColor'].stop();
            renderer['tweenColor'] = null;
        });
    }

    enableHighlight(duration: number = 0.2): void {
        this.stopColorTweens();
        if (duration > 0) {
            this.node["isHighlight"] = true;
            const normalColor = this.resourceManager.getColorNormal();
            this.tweenRenderersColor(duration, normalColor);
            return;
        }

        super.enableHighlight();
    }

    disableHighlight(duration: number = 0.2): void {
        this.stopColorTweens();
        if (duration > 0) {
            this.node["isHighlight"] = false;
            const dimColor = this.resourceManager.getColorDim();
            this.tweenRenderersColor(duration, dimColor);
            return;
        }

        super.disableHighlight();
    }

    onDestroy(): void {
        super.onDestroy();
        this.stopColorTweens();
    }
}
`;
}

function createSlotTableModuleTemplate(gameId: string, sourceType: SceneKitSourceType = "scene") {
    return `${createCocosImport(["_decorator"], sourceType)}
${createSlotModuleImport(["GAME_MODE_ENUM", "SlotTableModule"], sourceType)}
import { SlotReelModule${gameId} } from './SlotReelModule${gameId}';
const { ccclass } = _decorator;
${createCcClassDecorator("SlotTableModule" + gameId, sourceType)}
export class SlotTableModule${gameId} extends SlotTableModule {
    initTable(): void {
        super.initTable();
        this.reels.forEach(reelComponent => {
            (reelComponent as SlotReelModule${gameId}).setGameMode(this.gameMode);
        });
    }

    showBeautyMatrix(): void {
        if (this.gameMode === GAME_MODE_ENUM.FREE_GAME) {
            return;
        }
        super.showBeautyMatrix();
    }
}
`;
}

function createNormalGameDirectorModuleTemplate(gameId: string, sourceType: SceneKitSourceType = "scene") {
    return `${createCocosImport(["_decorator"], sourceType)}
${createSlotModuleImport(["GAME_MODE_ENUM", "NormalGameDirectorModule"], sourceType)}
import { GAME_EVENT_${gameId} } from '../DataConfig/EventConfig${gameId}';
const { ccclass } = _decorator;
${createCcClassDecorator("NormalGameDirectorModule" + gameId, sourceType)}
export class NormalGameDirectorModule${gameId} extends NormalGameDirectorModule {
    transitionToGameModeWhenResume(mode: number): Promise<void> {
        if (mode === GAME_MODE_ENUM.FREE_GAME) {
            const { freeGameMatrix, matrix } = this.dataStore.playSession;
            this.eventManager.emit(GAME_EVENT_${gameId}.PRE_RESUME_FREE_GAME_MATRIX, freeGameMatrix || matrix);
        }
        return Promise.resolve();
    }
}
`;
}

function createFreeGameDirectorModuleTemplate(gameId: string, sourceType: SceneKitSourceType = "scene") {
    return `${createCocosImport(["_decorator"], sourceType)}
${createSlotModuleImport(["GAME_MODE_ENUM", "FreeGameDirectorModule"], sourceType)}
const { ccclass } = _decorator;
${createCcClassDecorator("FreeGameDirectorModule" + gameId, sourceType)}
export class FreeGameDirectorModule${gameId} extends FreeGameDirectorModule {
    preResumeFreeTable(data: any): void {
        this.moduleEvent.emit('SYNC_TABLE', data, GAME_MODE_ENUM.FREE_GAME);
    }
}
`;
}

function createJackpotWinModuleTemplate(gameId: string, sourceType: SceneKitSourceType = "scene") {
    return `${createCocosImport(["_decorator", "sp", "tween"], sourceType)}
${createSlotModuleImport(["JackpotWinModule"], sourceType)}
import { UI_JACKPOT_ANIM } from '../DataConfig/AnimConfig${gameId}';
import { SOUND_CONFIG } from '../DataConfig/SoundConfig${gameId}';
const { ccclass, property } = _decorator;
const FADE_DURATION = 0.2;
${createCcClassDecorator("JackpotWinModule" + gameId, sourceType)}
export class JackpotWinModule${gameId} extends JackpotWinModule {
    @property(sp.Skeleton) jackpotWinEffect: sp.Skeleton = ${createNullInitializer(sourceType)};

    // #region Base
    onLoadExtend(): void {
        super.onLoadExtend();
        if (this.jackpotWinEffect) {
            this.jackpotWinEffect.setMix(UI_JACKPOT_ANIM.IDLE, UI_JACKPOT_ANIM.DISAPPEAR, 0.2);
        }
    }

    initValue(): void {
        super.initValue();
        this.coinsEffect.emit('RESET_COIN_EFFECT');
    }

    startParticle(): void {
        this.coinsEffect.emit('START_PARTICLE');
    }

    stopParticle(): void {
        this.coinsEffect.emit('STOP_PARTICLE');
    }
    // #region Base

    // #region Start Cutscene
    enter(): void {
        this.initValue();
        tween(this.node)
            .call(() => {
                this.playSoundStart();
                this.startParticle();
                this.playAnimationJP();
            })
            .delay(FADE_DURATION)
            .call(() => {
                this.startUpdateWinAmount()
            })
            .start();
    }

    playAnimationJP(): void {
        if (this.jackpotWinEffect) {
            this.jackpotWinEffect.setAnimation(0, UI_JACKPOT_ANIM.APPEAR, false);
            this.jackpotWinEffect.addAnimation(0, UI_JACKPOT_ANIM.IDLE, true);
        }
    }

    startUpdateWinAmount(): void {
        this._tweenMoney = tween(this);
        this._lbWinAmount.string = '0';
        this._tweenMoney = this.moneyTween.runNumber(this._lbWinAmount.node, this.animDuration, this.jackpotValue, {
            onComplete: () => {
                this.playSoundCountingEnd();
                this._skippable = false;
                this.finish();
            }
        });
    }

    onClick(): void {
        if (!this._isUpdating) {
            return;
        }
        if (!this._skippable) {
            return;
        }
        if (!this._hasClicked) {
            this._hasClicked = true;
        } else {
            return;
        }

        this.playSoundSkip();

        if (this._tweenMoney) {
            this._tweenMoney.stop();
            this._tweenMoney = null;
        }

        this._tweenMoney = this.moneyTween.runNumber(this._lbWinAmount.node, 1, this.jackpotValue, {
            onComplete: () => {
                this.finish();
            }
        });
    }
    // #endregion Start Cutscene

    // #region Sound
    playSoundStart(): void {
        this.fadeOutMusic(0.5);
        this.soundPlayer.playSfx(SOUND_CONFIG.SFX_JP);
        this.soundPlayer.playSfx(SOUND_CONFIG.SFX_COUNTING, true, 1.5);
    }

    playSoundCountingEnd(): void {
        this.fadeInMusic(0.5);
        this.soundPlayer.stopSfx(SOUND_CONFIG.SFX_COUNTING);
        this.soundPlayer.playSfx(SOUND_CONFIG.SFX_COUNTING_END);
    }

    playSoundSkip(): void {
        this.soundPlayer.stopSfx(SOUND_CONFIG.SFX_JP);
        this.soundPlayer.stopSfx(SOUND_CONFIG.SFX_COUNTING);

        this.soundPlayer.playSfx(SOUND_CONFIG.SFX_JP_END);
        this.soundPlayer.playSfx(SOUND_CONFIG.SFX_COUNTING_END);
        this.fadeInMusic(0.5);
    }

    fadeOutMusic(duration: number): void {
        const isFadable = !this.soundPlayer.isMuteMusic && this.soundPlayer.isEnableBGM;
        if (isFadable) {
            this.soundPlayer.fadeMusicTo(duration, 0);
        } else {
            this.soundPlayer.setMusicVolume(0);
        }
    }

    fadeInMusic(duration: number): void {
        const isFadable = !this.soundPlayer.isMuteMusic && this.soundPlayer.isEnableBGM;
        if (isFadable) {
            this.soundPlayer.fadeMusicTo(duration, 1);
        }
    }

    // #endregion Sound

    // #region Finish Cutscene
    finish(): void {
        this._lbWinAmount.string = this.moneyFormatter.formatMoney(this.jackpotValue);
		this.playSoundEnd();
		this._isUpdating = false;
		this.stopParticle();
		tween(this.node)
			.delay(this.delayHideTime)
            .call(() => {
                if (this.jackpotWinEffect) {
                    this.jackpotWinEffect.setAnimation(0, UI_JACKPOT_ANIM.DISAPPEAR, false);
                }
            })
            .delay(0.5)
			.call(() => {
				this._lbWinAmount.string = '';
				this.exit();
            })
            .start();
    }
    // #endregion Finish Cutscene
}
`;
}

function createWinEffectModuleTemplate(gameId: string, sourceType: SceneKitSourceType = "scene") {
    return `${createCocosImport(["_decorator", "sp", "tween", "Tween"], sourceType)}
${createSlotModuleImport(["GameUIEvents", "WinEffectLevelEnum", "WinEffectModule"], sourceType)}
import { UI_BIGWIN_ANIM } from '../DataConfig/AnimConfig${gameId}';
import { SOUND_CONFIG } from '../DataConfig/SoundConfig${gameId}';
const { ccclass, property } = _decorator;

type BigWinAnimAction = 'APPEAR' | 'IDLE' | 'DISAPPEAR';
const BIG_WIN_ANIM_KEY_BY_TITLE = ['BW', 'MW', 'SMW'];
const SOUND_DURATION = {
    [WinEffectLevelEnum.BIG]: 4.22,
    [WinEffectLevelEnum.MEGA]: 9.844,
    [WinEffectLevelEnum.SUPER]: 17.344,
}

${createCcClassDecorator("WinEffectModule" + gameId, sourceType)}
export class WinEffectModule${gameId} extends WinEffectModule {
    @property(sp.Skeleton) bigWinEffect: sp.Skeleton = ${createNullInitializer(sourceType)};
    private mixTime = 0.2;
    private playingLevelSfx: ${createNullableStringField(sourceType)};
    private endWinEffectLevel: WinEffectLevelEnum = WinEffectLevelEnum.BIG;
    private bigWinSoundTime: number = 0;
    private _tweenSound: ${createTweenType(sourceType)} = ${createNullInitializer(sourceType)};

    // #region Base
    onLoadExtend(): void { 
        super.onLoadExtend();
        this.setMix();
    }

    startParticle(): void {
        if (this._isShowNormalEffect) {
            this.coinsEffect.emit('SHOW_COINS_EFFECT', 0);
        }
        if (this._isShowFastEffect) {
            this.coinsEffect.emit('START_TURBO_COIN');
        }
    }

    stopParticle(): void {
        this.coinsEffect.emit('HIDE_ALL_COINS_EFFECTS');
    }

    getBigWinAnimKey(titleIndex: number): any {
        return BIG_WIN_ANIM_KEY_BY_TITLE[titleIndex] ?? 'BW';
    }

    getBigWinEffectAnimName(titleIndex: number, action: BigWinAnimAction): string {
        const animKey = \`\${this.getBigWinAnimKey(titleIndex)}_\${action}\` as keyof typeof UI_BIGWIN_ANIM;
        return UI_BIGWIN_ANIM[animKey];
    }

    playBigWinAnimation(titleIndex: number): void {
        if (this.bigWinEffect) {
            this.bigWinEffect.setAnimation(0, this.getBigWinEffectAnimName(titleIndex, 'APPEAR'), false);
            this.bigWinEffect.addAnimation(0, this.getBigWinEffectAnimName(titleIndex, 'IDLE'), true);
        }
    }

    updateCurrentTitle(): void {
        const isSkipped = this._speedUp;
        if (isSkipped) {
            super.updateCurrentTitle(); // update title on money
        } else {
            this.updateTitleOnSoundTime(); // update title on SE time config
        }
    }

    updateTitleOnSoundTime(): void {
        const soundTime = this.bigWinSoundTime;
        if (soundTime >= SOUND_DURATION[WinEffectLevelEnum.MEGA] &&
            this._currentTitle === WinEffectLevelEnum.MEGA &&
            this.canProcessToLevel(WinEffectLevelEnum.SUPER)) {
            this.changeTitle(WinEffectLevelEnum.SUPER);
        } else if (soundTime >= SOUND_DURATION[WinEffectLevelEnum.BIG] &&
            this._currentTitle === WinEffectLevelEnum.BIG &&
            this.canProcessToLevel(WinEffectLevelEnum.MEGA)) {
            this.changeTitle(WinEffectLevelEnum.MEGA);
        }
    }

    canProcessToLevel(level: WinEffectLevelEnum): boolean {
        return this.endWinEffectLevel >= level;
    }

    setMix(): void {
        Object.values(WinEffectLevelEnum)
            .filter(value => typeof value === 'number')
            .forEach((value) => {
                const level = value as WinEffectLevelEnum;
                const disappear = this.getBigWinEffectAnimName(level, 'DISAPPEAR')
                const idle = this.getBigWinEffectAnimName(level, 'IDLE')
                const appear = this.getBigWinEffectAnimName(level, 'APPEAR')
                if (this.bigWinEffect) {
                    this.bigWinEffect.setMix(appear, disappear, this.mixTime);
                    this.bigWinEffect.setMix(idle, disappear, this.mixTime);
                }
            });
    }

    showEffectWin(): void {
        this.endWinEffectLevel = this.getEndWinEffectLevel();
        this.animDuration = SOUND_DURATION[this.endWinEffectLevel] - this.delayHideTime;
        this.playBigWinAnimation(WinEffectLevelEnum.BIG);
        super.showEffectWin();
    }

    getEndWinEffectLevel(): WinEffectLevelEnum {
        const megaWinAmount = this.content.totalBet * this.megaRate;
        const superWinAmount = this.content.totalBet * this.superRate;

        if (this.content.winAmount >= superWinAmount) {
            return WinEffectLevelEnum.SUPER;
        }
        if (this.content.winAmount >= megaWinAmount) {
            return WinEffectLevelEnum.MEGA;
        }
        return WinEffectLevelEnum.BIG;
    }
    // #endregion Base

    // #region Start Cutscene
    enter(): void {
        this.eventManager.emit(GameUIEvents.WIN_AMOUNT.CLEAR_WIN_AMOUNT);
        eno.setOpacity(this.winAmount, 255);
        super.enter();
    }

    changeTitle(index: number): void {
        this._currentTitle = index;
        this.coinsEffect.emit('HIDE_COINS_EFFECT', index - 1);
        this.coinsEffect.emit('SHOW_COINS_EFFECT', index);
        this.playBigWinAnimation(index);
        if (!this._speedUp) {
            this.playLevelSfx(index);
        }
    }
    // #endregion Start Cutscene

    // #region Sound
    playLevelSfx(level: number): void {
        const hitSfx = this.geHitSfx(level);
        if (hitSfx) {
            this.soundPlayer.playSfx(hitSfx);
        }
    }

    geHitSfx(index: number): string | undefined {
        return SOUND_CONFIG[\`SFX_BIGWIN_HIT_\${index}\`];
    }

    stopLevelSfx(): void {
        if (this.playLevelSfx == null) {
            return;
        }

        this.soundPlayer.stopSfx(this.playingLevelSfx);
        this.playingLevelSfx = ${createEmptyStringValue(sourceType)};
    }

    playSfxFastBigWin(): void {
        this.soundPlayer && this.soundPlayer.playSfx(SOUND_CONFIG.SFX_TURBO_BIGWIN);
    }

    playSoundStart(): void {
        this.fadeOutMusic(0.5);
        const sound = this.soundPlayer.playSfx(SOUND_CONFIG.SFX_BIGWIN);
        this.resetSoundTime();
        this._tweenSound = tween(sound)
            .to(this.animDuration, {}, {
                onUpdate: (_, ratio: number) => {
                    this.bigWinSoundTime = ratio * this.animDuration;
                }
            })
            .start();
    }

    playSoundCounting(): void {
        this.soundPlayer.playSfx(SOUND_CONFIG.SFX_COUNTING, true, 1.5);
    }

    fadeOutMusic(duration: number): void {
        const isFadable = !this.soundPlayer.isMuteMusic && this.soundPlayer.isEnableBGM;
        if (isFadable) {
            this.soundPlayer.fadeMusicTo(duration, 0);
        } else {
            this.soundPlayer.setMusicVolume(0);
        }
    }

    fadeInMusic(duration: number): void {
        const isFadable = !this.soundPlayer.isMuteMusic && this.soundPlayer.isEnableBGM;
        if (isFadable) {
            this.soundPlayer.fadeMusicTo(duration, 1);
        }
    }

    playSoundSkip(): void {
        this.unscheduleAllCallbacks();
        this.stopLevelSfx();
    }

    playSoundCountingEnd(): void {
        this.soundPlayer.stopSfx(SOUND_CONFIG.SFX_BIGWIN);
        this.soundPlayer.stopSfx(SOUND_CONFIG.SFX_COUNTING);
        this.soundPlayer.playSfx(SOUND_CONFIG.SFX_COUNTING_END);
    }
    // #endregion Sound

    // #region Finish Cutscene
    resetSoundTime(): void {
        this.bigWinSoundTime = 0;
        this._tweenSound?.stop();
        this._tweenSound = ${createNullInitializer(sourceType)};
    }

    finish(): void {
        this.stopLevelSfx();
        this.soundPlayer.playSfx(SOUND_CONFIG.SFX_BIGWIN_END);
        
        this._skippable = false;
        this._isUpdating = false;
        this.updateCurrentTitle();
        this._lbWinAmount.string = this.moneyFormatter.formatMoney(this.content.winAmount)
        Tween.stopAllByTarget(this.winAmount);
        this.resetSoundTime();
        this.stopParticle();
        this._tweenFinish = tween(this)
            .delay(0.5)
            .call(() => {
                this.fadeInMusic(0.5);
            })
            .delay(this.delayHideTime)
            .call(() => {
                this.soundPlayer.stopSfx(SOUND_CONFIG.SFX_BIGWIN_END);
                if (this.bigWinEffect) {
                    this.bigWinEffect.setAnimation(0, this.getBigWinEffectAnimName(this._currentTitle, 'DISAPPEAR'), false);
                }
            })
            .delay(1)
            .call(() => eno.fadeOut(this.winAmount, 0.2))
            .delay(0.2)
            .call(() => {
                this.exit();
            })
            .start();
    }
    // #endregion Finish Cutscene
}
`;
}

function createTotalWinModuleTemplate(gameId: string, sourceType: SceneKitSourceType = "scene") {
    return `${createCocosImport(["_decorator", "sp", "tween"], sourceType)}
${createSlotModuleImport(["TotalWinModule"], sourceType)}
import { UI_TOTALWIN_ANIM } from '../DataConfig/AnimConfig${gameId}';
import { SOUND_CONFIG } from '../DataConfig/SoundConfig${gameId}';
const { ccclass, property } = _decorator;
const WIN_LEVEL = [0, 30, 80];
type TotalWinAnimAction = 'APPEAR' | 'IDLE' | 'DISAPPEAR';
const TOTAL_WIN_ANIM_KEY_BY_LEVEL: string[] = ['LV1', 'LV2', 'LV3'];
const TOTAL_WIN_SFX_DURATIONS = [
    4.667,
    7.846,
    10.322
];
const DELAY_APPEAR_ANIM = 0.5;
const MAX_TOTAL_WIN_LEVEL = 2;
${createCcClassDecorator("TotalWinModule" + gameId, sourceType)}
export class TotalWinModule${gameId} extends TotalWinModule {
    @property(sp.Skeleton) totalWinAnim: sp.Skeleton = ${createNullInitializer(sourceType)};
    level = 0;

    // #region Base
    getTotalWinAnimName(levelIndex: number, action: TotalWinAnimAction): string {
        const animKey = \`\${this.getTotalWinAnimKey(levelIndex)}_\${action}\` as keyof typeof UI_TOTALWIN_ANIM;
        return UI_TOTALWIN_ANIM[animKey];
    }

    getTotalWinAnimKey(levelIndex: number): any {
        return TOTAL_WIN_ANIM_KEY_BY_LEVEL[levelIndex] ?? 'LV1';
    }

    startParticle(): void {
        this.coinsEffect.emit('SHOW_COINS_EFFECT', this.level);
    }

    stopParticle(): void {
        this.coinsEffect.emit('HIDE_COINS_EFFECT');
    }
    // #endregion Base

    // #region Start Cutscene
    show(): void {
        super.show();
        eno.setOpacity(this.winAmount, 255)
        this._lbWinAmount.string = this.moneyFormatter.formatMoney(0);
    }

    enter(): void {
        this.playSoundStart();
        this.initValue();

        const totalBet = this.gameLogic?.getDataModel()?.BetData.totalBet;
        const winRate = eno.FloatUtils.div(this.getTotalWinAmount(), totalBet);
        for (let i = 0; i < WIN_LEVEL.length; i++) {
            if (winRate >= WIN_LEVEL[i]) {
                this.level = i;
            }
        }
        const sfxDuration = TOTAL_WIN_SFX_DURATIONS[this.level];
        this.animDuration = sfxDuration - DELAY_APPEAR_ANIM;
        if (this.totalWinAnim) {
            this.totalWinAnim.setAnimation(0, this.getTotalWinAnimName(this.level, 'APPEAR'), false);
            this.totalWinAnim.addAnimation(0, this.getTotalWinAnimName(this.level, 'IDLE'), true);
        }
        this.scheduleOnce(() => {
            this.startParticle();
            this.startUpdateWinAmount();
        }, DELAY_APPEAR_ANIM);
    }

    startUpdateWinAmount(): void {
        if (this.level > 0) {
            super.startUpdateWinAmount();
            this.soundPlayer.playSfx(SOUND_CONFIG.SFX_COUNTING, true, 1.5);
            return;
        }
        this._lbWinAmount.string = this.moneyFormatter.formatMoney(this._totalWinAmount);
        this.scheduleOnce(() => {
            this._skippable = false;
            this.finish();
        }, this.animDuration);
    }
    // #endregion Start Cutscene

    // #region Sound
    playSoundStart(): void {
        this.fadeOutMusic(0.5);
        this.soundPlayer.playSfx(SOUND_CONFIG.SFX_TOTALWIN);
    }

    playSoundEnd(): void {
        const isPlayFull = this.level == MAX_TOTAL_WIN_LEVEL && !this._hasSkip;
        if (!isPlayFull) {
            this.soundPlayer.stopSfx(SOUND_CONFIG.SFX_TOTALWIN);
            this.soundPlayer.playSfx(SOUND_CONFIG.SFX_TOTALWIN_END);
        }

        this.soundPlayer.stopSfx(SOUND_CONFIG.SFX_COUNTING);
    }

    playSoundSkip(): void {
        if (this.level > 0) {
            this.playSoundCountingEnd();
        }
    }

    playSoundCountingEnd(): void {
        this.soundPlayer.stopSfx(SOUND_CONFIG.SFX_COUNTING);
        this.soundPlayer.playSfx(SOUND_CONFIG.SFX_COUNTING_END);
    }

    fadeOutMusic(duration: number): void {
        const isFadable = !this.soundPlayer.isMuteMusic && this.soundPlayer.isEnableBGM;
        if (isFadable) {
            this.soundPlayer.fadeMusicTo(duration, 0);
        } else {
            this.soundPlayer.setMusicVolume(0);
        }
    }

    fadeInMusic(duration: number): void {
        const isFadable = !this.soundPlayer.isMuteMusic && this.soundPlayer.isEnableBGM;
        if (isFadable) {
            this.soundPlayer.fadeMusicTo(duration, 1);
        }
    }
    // #endregion Sound

    // #region Finish Cutscene
    finish(): void {
        this._lbWinAmount.string = this.moneyFormatter.formatMoney(this._totalWinAmount);
        this.playSoundEnd();
        this._isUpdating = false;
        this.stopParticle();
        tween(this.node)
            .delay(this.hideTime)
            .call(() => {
                if (this.totalWinAnim) {
                    this.totalWinAnim.setAnimation(0, this.getTotalWinAnimName(this.level, 'DISAPPEAR'), false);
                }
                this.callback && this.callback();
                this.callback = ${createNullInitializer(sourceType)};
            })
            .delay(0.5)
            .call(() => {
                this._lbWinAmount.string = '';
                this.fadeInMusic(0.5);
                this.exit();
            }).start();
    }

    exit(_data?: any, _callback?: Function): void {
        this.soundPlayer.stopSfx(SOUND_CONFIG.SFX_COUNTING);
        super.exit(_data, _callback);
    }
    // #endregion Finish Cutscene
}
`;
}

function createCoinEffectTemplate(gameId: string, sourceType: SceneKitSourceType = "scene") {
    return `${createCocosImport(["_decorator", "Component", "Node"], sourceType)}
${createSlotModuleImport(["WinEffectLevelEnum"], sourceType)}
const { ccclass, property } = _decorator;
${createCcClassDecorator("CoinEffect" + gameId, sourceType)}
export class CoinEffect${gameId} extends Component {
    @property({ type: Node }) coinBigWin: Node = ${createNullInitializer(sourceType)};
    @property({ type: Node }) coinMegaWin: Node = ${createNullInitializer(sourceType)};
    @property({ type: Node }) coinSuperWin: Node = ${createNullInitializer(sourceType)};
    @property({ type: Node }) turboCoin: Node = ${createNullInitializer(sourceType)};

    protected onLoad(): void {
        this.node.on('SHOW_COINS_EFFECT', this.showCoinsEffect, this);
        this.node.on('HIDE_COINS_EFFECT', this.hideCoinsEffect, this);
        this.node.on('HIDE_ALL_COINS_EFFECTS', this.hideAllCoinsEffects, this);
        this.node.on('START_TURBO_COIN', this.startTurboCoin, this);
    }

    startTurboCoin(): void {
        this.turboCoin.emit('START_PARTICLE');
    }

    showCoinsEffect(type: number = WinEffectLevelEnum.BIG): void {
        switch (type) {
            case WinEffectLevelEnum.BIG:
                this.coinBigWin.emit('START_PARTICLE');
                break;
            case WinEffectLevelEnum.MEGA:
                this.coinMegaWin.emit('START_PARTICLE');
                break;
            case WinEffectLevelEnum.SUPER:
                this.coinSuperWin.emit('START_PARTICLE');
                break;
            default:
                break;
        }
    }

    hideCoinsEffect(type: number = WinEffectLevelEnum.BIG): void {
        switch (type) {
            case WinEffectLevelEnum.BIG:
                this.coinBigWin.emit('STOP_PARTICLE');
                break;
            case WinEffectLevelEnum.MEGA:
                this.coinMegaWin.emit('STOP_PARTICLE');
                break;
            case WinEffectLevelEnum.SUPER:
                this.coinSuperWin.emit('STOP_PARTICLE');
                break;
            default:
                break;
        }
    }

    hideAllCoinsEffects(): void {
        this.turboCoin.emit('STOP_PARTICLE');
        this.coinBigWin.emit('STOP_PARTICLE');
        this.coinMegaWin.emit('STOP_PARTICLE');
        this.coinSuperWin.emit('STOP_PARTICLE');
    }
}
`;
}

function createParticleControlTemplate(gameId: string, sourceType: SceneKitSourceType = "scene") {
    return `${createCocosImport(["_decorator", "Component", "ParticleSystem2D"], sourceType)}
const { ccclass } = _decorator;
const { setOpacity } = eno;

${createCcClassDecorator("ParticleControl" + gameId, sourceType)}
export class ParticleControl${gameId} extends Component {
    coinParticles: ParticleSystem2D[] = [];

	onLoad(): void {
		this.node.on('START_PARTICLE', this.startParticle, this);
		this.node.on('STOP_PARTICLE', this.stopParticle, this);
		this.node.on('CHANGE_EMISSION_RATE', this.changeEmissionRate, this);
        this.coinParticles = this.getComponentsInChildren(ParticleSystem2D);
		this.node.active = false;
	}

	startParticle(): void {
		if (!this.coinParticles.length) {
			return;
		}
		this.node.active = true;
		setOpacity(this.node, 255);
		this.coinParticles.forEach((it) => {
			it.resetSystem();
		});
	}

	stopParticle(): void {
		if (!this.coinParticles.length) {
			return;
		}
		this.coinParticles.forEach(it => {
			it.stopSystem();
		});
	}

	changeEmissionRate(emissionRate: number): void {
		this.coinParticles.forEach(element => {
            element.emissionRate = emissionRate;
        });
	}
}
`;
}

function createInfoPanelTemplate(gameId: string, sourceType: SceneKitSourceType = "scene") {
    return `${createCocosImport(["_decorator"], sourceType)}
const { ccclass } = _decorator;
${createSlotModuleImport(["InfoPanel"], sourceType)}
${createCcClassDecorator("InfoPanel" + gameId, sourceType)}
export class InfoPanel${gameId} extends InfoPanel {
    onLoadExtend(): void {
        super.onLoadExtend();
        this.pageView.node.off('page-turning', this.pageViewEvent, this);
        this.pageView.node.on('scroll-ended', this.pageViewEvent, this);
    }
}
`;
}

function createSlotButtonSpineTemplate(gameId: string, sourceType: SceneKitSourceType = "scene") {
    return `${createCocosImport(["_decorator", "Node", "tween", "Tween"], sourceType)}
${createSlotModuleImport(["SlotButtonSpine"], sourceType)}
import { BTN_SPIN_ANIM } from "../DataConfig/AnimConfig${gameId}";
import { BUTTON_EVENT_${gameId} } from "../DataConfig/EventConfig${gameId}";
const { ccclass, property } = _decorator;
${createCcClassDecorator("SlotButtonSpine" + gameId, sourceType)}
export class SlotButtonSpine${gameId} extends SlotButtonSpine {
    @property(Node) arrow: Node = ${createNullInitializer(sourceType)};

    isHolding: boolean = false;
    speedRotate: number = 1;

    onLoadExtend(): void {
        super.onLoadExtend();
        this.node.on(BUTTON_EVENT_${gameId}.PLAY_HOLD_ANIM, this.playHoldAnim, this);
        this.node.on(BUTTON_EVENT_${gameId}.CANCEL_HOLD_ANIM, this.cancelHoldAnim, this);
        this.rotateIcon();
    };

    playAnimSpinToStop(): void {
        if (this.isHolding) {
            return;
        }
        const { isResume } = this.dataStore.playSession;
        if (this.isAutoSpin || !this.spineBtnSpin) {
            return;
        }
        if (this.arrow) {
            this.arrow.active = false;
        }
        Tween.stopAllByTarget(this.node);
        const hasStopAnim = this.spineBtnSpin.findAnimation(this.animStop);
        const hasSpinToStopAnim = this.spineBtnSpin.findAnimation(this.animSpinToStop);
        
        if (hasStopAnim && isResume) {
            this.spineBtnSpin.setAnimation(0, this.animStop, true);
        } else if (hasSpinToStopAnim && hasStopAnim) {
            this.spineBtnSpin.setAnimation(0, this.animSpinToStop, false);
            this.spineBtnSpin.addAnimation(0, this.animStop, true);
        }
    }

    playAnimIdle(): void {
		if (this.spineBtnSpin.animation !== this.animIdle) {
            this.spineBtnSpin.setAnimation(0, BTN_SPIN_ANIM.PRESS_STOP, false);
            this.spineBtnSpin.addAnimation(0, this.animIdle, true);
            tween(this.node)
                .delay(0.3)
                .call(() => {
                    this.rotateIcon();
                })
                .start();
        }
	}

    playAnimHover(): void {
        super.playAnimHover();
        this.rotateIcon(1);
        Tween.stopAllByTarget(this.node);
    }

    playHoldAnim(): void {
        this.isHolding = true;
        this.spineHover.node.active = false;
        this.spineBtnSpin.setAnimation(0, this.animHolder, false);
        if (this.arrow) {
            Tween.stopAllByTarget(this.arrow);
            this.arrow.active = false;
        }
        Tween.stopAllByTarget(this.node);
    }

    cancelHoldAnim(): void {
        this.isHolding = false;
    }

    rotateIcon(timeStep: number = 2): void {
        if (!this.arrow) {
            return;
        }
        this.arrow.active = true;
        timeStep /= this.speedRotate;
        tween(this.arrow)
            .by(timeStep, { angle: 360 })
            .repeatForever()
            .start();
    }

	onDestroy(): void {
		this.unscheduleAllCallbacks();
        if (this.arrow) {
            Tween.stopAllByTarget(this.arrow);
        }
        Tween.stopAllByTarget(this.node);
	}
}
`;
}

function createSlotButtonNormalTemplate(gameId: string, sourceType: SceneKitSourceType = "scene") {
    return `${createCocosImport(["_decorator", "EventKeyboard", "KeyCode", "tween"], sourceType)}
${createGameLogicUiEventsImport(sourceType)}
${createSlotModuleImport(["SlotButtonNormal", "SPIN_BUTTON_STATE_ENUM"], sourceType)}
import { BUTTON_EVENT_${gameId} } from "../DataConfig/EventConfig${gameId}";
import { SOUND_CONFIG } from "../DataConfig/SoundConfig${gameId}";

const { ccclass } = _decorator;
const DELAY_LOADING_TIME = 0.3;
${createCcClassDecorator("SlotButtonNormal" + gameId, sourceType)}
export class SlotButtonNormal${gameId} extends SlotButtonNormal {
    isPressed: boolean = false;
    _tweenDelayTime = null;

    onTouchStart(): void {
        if (!this.holdToAutoSpin || this.hasPromotion) {
            return;
        }
        const isNormalOrHover = this.state == SPIN_BUTTON_STATE_ENUM.NORMAL || this.state == SPIN_BUTTON_STATE_ENUM.HOVER;
        if (isNormalOrHover) {
            this.scheduleOnce(this.playHoldAnim, this.holdTime);
        }

        super.onTouchStart();
    }

    playHoldAnim(): void {
        if (this.sfxSpinId) {
            this.soundPlayer?.playSfx(this.sfxSpinId);
        } else {
            this.soundPlayer?.playSFXClick();
        }
        this.display.emit(BUTTON_EVENT_${gameId}.PLAY_HOLD_ANIM);
        this.isPressed = true;
    }

    onTouchCancel(): void {
        super.onTouchCancel();
        this.unschedule(this.playHoldAnim);
        if (!this.isHold && this.isPressed) {
            this.isPressed = false;
            this.display.emit(BUTTON_EVENT_${gameId}.CANCEL_HOLD_ANIM);
        }
    }

    startHoldForAutoSpinAction(): void {
        this.holdAction = () => {
            this.gameLogic.emit(GameLogicUIEvents.START_AUTO_SPIN);
            if (this.buttonModel.state === SPIN_BUTTON_STATE_ENUM.SPINNING) {
                this.soundPlayer.playSfx(SOUND_CONFIG.BTN_AUTO);
            }
            this.holdAction = null;
            this.isHold = true;
        };
        this.scheduleOnce(this.holdAction, this.holdTime);
    }

    onKeyUp(event: EventKeyboard): void {
        if (event.keyCode == KeyCode.SPACE &&
            !this.uiManager.checkDisplayPopup() &&
            !this.gameLogic.getUIManager().hasBlockingPopup() &&
            this.dataStore.isFullDisplay) {
            this.playSfxSpin();
            this.gameLogic.emit(GameLogicUIEvents.TRIGGER_SPACE_BUTTON);
        }
    }

    addEventListeners(): void {
        this._tweenDelayTime && this._tweenDelayTime.stop();
        this._tweenDelayTime = null;
        this._tweenDelayTime = tween(this.node)
            .delay(DELAY_LOADING_TIME)
            .call(() => {
                super.addEventListeners();
                this._tweenDelayTime = null;
            })
            .start();
    }

    onDestroy(): void {
        this._tweenDelayTime && this._tweenDelayTime.stop();
        this._tweenDelayTime = null;
        super.onDestroy();
    }
}
`;
}

function createWinAmountModuleTemplate(gameId: string, sourceType: SceneKitSourceType = "scene") {
    return `${createCocosImport(["Label", "Node", "Tween", "Vec3", "_decorator", "log", "sp", "tween"], sourceType)}
${createSlotModuleImport(["PoolFactoryModule", "WinAmountModule"], sourceType)}
import { UI_SUBWINAMOUNT_ANIM, UI_WIN_AMOUNT_ANIM } from '../DataConfig/AnimConfig${gameId}';
import { SOUND_CONFIG } from '../DataConfig/SoundConfig${gameId}';
import { UI_SUBWINAMOUNT_TIME } from '../DataConfig/TimeConfig${gameId}';
const { ccclass, property } = _decorator;
const { fadeOut, setOpacity } = eno;

${createCcClassDecorator("WinAmountModule" + gameId, sourceType)}
export class WinAmountModule${gameId} extends WinAmountModule {
    @property(sp.Skeleton) subWinFrameEffect: sp.Skeleton = ${createNullInitializer(sourceType)};
    @property(Label) labelSubWinAmount: Label = ${createNullInitializer(sourceType)};
    @property(Node) holderNode: Node = ${createNullInitializer(sourceType)};
    @property({ type: PoolFactoryModule }) labelPool: PoolFactoryModule = ${createNullInitializer(sourceType)};

    winAmountPS: number = 0;
    _charNodeList: Node[] = [];
    _tweenFadeSubWin: Tween = ${createNullInitializer(sourceType)};

    // #region Base
    syncWinAmount(value: any): void {
        this.resetCallBack();
        super.syncWinAmount(value);
    }

    createLabel(text: string): Node {
        if (!this.labelPool) {
            return;
        }
        const labelNode = this.labelPool.getObject();
        const label = labelNode.getComponent(Label);
        label.string = text;
        labelNode.setParent(this.holderNode);
        labelNode.setScale(Vec3.ZERO);
        labelNode.active = true;
        return labelNode;
    }
    // #endregion Base

    // #region Update WinAmount
    updateWinAmount({ winAmount, winAmountPS, time, winLevel }): Promise<void> {
        return new Promise((resolve) => {
            this._callBackOnComplete = resolve;
            this.winAmountPS = winAmountPS;
            if (this._tweenFade) {
				this._tweenFade.stop();
			}
            if (this._tweenFadeSubWin) {
                this._tweenFadeSubWin.stop();
            }
			this._winValue = winAmount;
			time = this._currentValue === winAmount ? 0 : time;
			
            if (time) {
                this.playSubWinAppear(winLevel);
                tween(this.node)
                    .call(() => {
                        this.tweenSubWinAmount(winLevel, winAmount, time);
                    })
                    .start();
            } else {
                this.updateWinAmountInstantly(winAmountPS);
            }
		});
	}

    updateWinAmountInstantly(winAmount: number): void {
        this._resetLabel();
        this.currentValue = winAmount;
        this.labelWinAmount.string = this.moneyFormatter.formatMoney(this.currentValue);
        this.resetCallBack();
        log("show win Amount instantly", winAmount);
    }

    playSubWinAppear(winLevel: number = 1): void {
        eno.setOpacity(this.subWinFrameEffect.node, 0);
        this.subWinFrameEffect.node.active = true;
        eno.fadeIn(this.subWinFrameEffect.node, 0.2);
        this.subWinFrameEffect.setAnimation(0, UI_SUBWINAMOUNT_ANIM.APPEAR, false);
        this.subWinFrameEffect.addAnimation(0, UI_SUBWINAMOUNT_ANIM.IDLE, true);
        this.soundPlayer.playSfx(\`SFX_WIN_\${winLevel}\`, false, 0.7);
    }

    tweenSubWinAmount(winLevel: number, winAmount: number, time: number): void {
        setOpacity(this.subWinFrameEffect.node, 255);
        switch (winLevel) {
            case 1:
                this.playSubWin1(winLevel, winAmount, time);
                break;
            case 2:
                this.playSubWin2(winLevel, winAmount, time);
                break;
            case 3:
                this.playSubWin3(winLevel, winAmount, time);
                break;
            case 4:
                this.playSubWin4(winLevel, winAmount, time);
                break;        
            default:
                break;
        }
    }

    playMainWinEffect(winLevel: number, winAmount: number): void {
        this.hideSubWinEffect();
        this.currentValue = this.winAmountPS || winAmount;
        const key = \`WIN_\${winLevel}\`;
        const keyStart = \`WIN_\${winLevel}_START\`;
        const keyEnd = \`WIN_\${winLevel}_END\`;
        const animationName = UI_WIN_AMOUNT_ANIM[key] ? UI_WIN_AMOUNT_ANIM[key] : UI_WIN_AMOUNT_ANIM[keyStart]; 
        const animationEndName = UI_WIN_AMOUNT_ANIM[keyEnd]; 
        this.clearLabel();
        this.winFrameEffect.setAnimation(0, animationName, false);
        if (animationEndName) {
            this.winFrameEffect.addAnimation(0, animationEndName, false);
        }
        this.resetCallBack();
    }

    fadeOutNumber(time: number = 0.5): void {
        this.resetCallBack();
        super.fadeOutNumber(time);
        if (!this._winValue) {
			return;
		}
        Tween.stopAllByTarget(this.node);
        Tween.stopAllByTarget(this.labelSubWinAmount.node);
        this.clearLabel();
        this.labelSubWinAmount.string = this.moneyFormatter.formatMoney(this._winValue);
        if (this.subWinFrameEffect.node.active) {
            eno.setOpacity(this.subWinFrameEffect.node, 255);
            this._tweenFadeSubWin = fadeOut(this.subWinFrameEffect.node, time);
        }
    }

    playDisappearSound(winLevel: number): void {
        this.soundPlayer.playSfx(SOUND_CONFIG[\`SFX_WIN_\${winLevel}_IMPACT\`], false, 0.7);
    }
    // #end Update WinAmount

    // #region SubWin 1 -> 4
    playSubWin1(winLevel: number, winAmount: number, time: number): void {
        this.labelSubWinAmount.string = this.moneyFormatter.formatMoney(winAmount);
        tween(this.node)
            .delay(UI_SUBWINAMOUNT_TIME.APPEAR + time)
            .call(() => {
                this.subWinFrameEffect.setAnimation(0, UI_SUBWINAMOUNT_ANIM.DISAPPEAR, false);
                this.playDisappearSound(winLevel);
            })
            .delay(UI_SUBWINAMOUNT_TIME.DISAPPEAR )
            .call(() => {
                this.playMainWinEffect(winLevel, winAmount);
            })
            .start();
    }

    playSubWin2(winLevel: number, winAmount: number, time: number): void {
        const winAmountStr = this.moneyFormatter.formatMoney(winAmount);
        const winAmountChars = winAmountStr.split('');

        tween(this.node)
            .delay(0.2)
            .call(() => {
                winAmountChars.forEach((char, index) => {
                    const charNode = this.createLabel(char);
                    tween(charNode)
                        .delay(index * 0.1)
                        .to(0.075, { scale: new Vec3(1.2, 1.2, 1.2) }, { easing: 'sineOut' })
                        .to(0.075, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
                        .start();
                })
            })
            .delay(this.labelPool.usedObjects.length * 0.1 + time)
            .call(() => {
                this.subWinFrameEffect.setAnimation(0, UI_SUBWINAMOUNT_ANIM.DISAPPEAR, false);
                this.playDisappearSound(winLevel);
            })
            .delay(UI_SUBWINAMOUNT_TIME.DISAPPEAR )
            .call(() => {
                this.playMainWinEffect(winLevel, winAmount);
            })
            .start();
    }

    playSubWin3(winLevel: number, winAmount: number, time: number): void {
        tween(this.node)
            .call(() => {
                this._tweenValue = this.moneyTween.runNumber(this.labelSubWinAmount.node, time, winAmount, {
                    onComplete: () => {
                        this._tweenValue = null;
                        tween(this.node)
                            .delay(0.5)
                            .call(() => {
                                this.subWinFrameEffect.setAnimation(0, UI_SUBWINAMOUNT_ANIM.DISAPPEAR, false);
                                this.playDisappearSound(winLevel);
                            })
                            .delay(UI_SUBWINAMOUNT_TIME.DISAPPEAR)
                            .call(() => {
                                this.playMainWinEffect(winLevel, winAmount);
                            })
                            .start();
                    }
                });
            })
            .start();
    }

    playSubWin4(winLevel: number, winAmount: number, time: number): void {
        tween(this.node)
            .call(() => {
                this._tweenValue = this.moneyTween.runNumber(this.labelSubWinAmount.node, time, winAmount, {
                    onComplete: () => {
                        this._tweenValue = null;
                        this.subWinFrameEffect.setAnimation(0, UI_SUBWINAMOUNT_ANIM.END_4, false);
                        this.subWinFrameEffect.addAnimation(0, UI_SUBWINAMOUNT_ANIM.DISAPPEAR, false);
                        tween(this.node)
                            .delay(UI_SUBWINAMOUNT_TIME.END_4)
                            .call(() => {
                                this.playDisappearSound(winLevel);
                            })
                            .delay(UI_SUBWINAMOUNT_TIME.DISAPPEAR)
                            .call(() => {
                                this.playMainWinEffect(winLevel, winAmount);
                            })
                            .start();
                    }
                });
            })
            .start();
    }
    // #endregion SubWin 1 -> 4

    // #region Reset
    hideSubWinEffect(): void {
        this.subWinFrameEffect.node.active = false;
        this.labelSubWinAmount.string = '';
    }

    clearLabel(): void {
        if (this.labelPool) {
            this.labelPool.usedObjects.forEach(obj => {
                Tween.stopAllByTarget(obj)
            })
            this.labelPool.clear();
        }
        this._charNodeList = [];
    }

    stopWinEffect(): void {
        Tween.stopAllByTarget(this.node);
        this.stopTweenValue();
        this.winFrameEffect.setAnimation(0, UI_WIN_AMOUNT_ANIM.STATIC, false);
        if (this.subWinFrameEffect.node.active) {
            Tween.stopAllByTarget(this.labelSubWinAmount.node);
        }
        this.hideSubWinEffect();
        this.clearLabel();
        this.soundPlayer.stopSfx(SOUND_CONFIG.SFX_WIN_1);
        this.soundPlayer.stopSfx(SOUND_CONFIG.SFX_WIN_2);
        this.soundPlayer.stopSfx(SOUND_CONFIG.SFX_WIN_3);
        this.soundPlayer.stopSfx(SOUND_CONFIG.SFX_WIN_4);
    }

    stopTweenFade(): void {
		this._tweenFadeSubWin && this._tweenFadeSubWin.stop();
		this._tweenFadeSubWin = null;
        super.stopTweenFade();
	}

    clearWinAmount(): void {
        super.clearWinAmount();
        this.hideSubWinEffect();
        this.clearLabel();
	}
    // #endregion Reset
}
`;
}

function ensureNamedImport(content: string, modulePath: string, importName: string) {
    const importRegex = new RegExp(`^import\\s+\\{([^}]+)\\}\\s+from\\s+['"]${modulePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}['"];`, "m");
    const importMatch = content.match(importRegex);

    if (!importMatch || importMatch.index === undefined) {
        return `import { ${importName} } from '${modulePath}';\n${content}`;
    }

    const existingNames = importMatch[1].split(",").map((item) => item.trim()).filter(Boolean);
    if (existingNames.includes(importName)) {
        return content;
    }

    const nextImport = `import { ${[...existingNames, importName].join(", ")} } from '${modulePath}';`;
    return `${content.slice(0, importMatch.index)}${nextImport}${content.slice(importMatch.index + importMatch[0].length)}`;
}

function ensureImportLine(content: string, importLine: string) {
    if (content.includes(importLine)) {
        return content;
    }

    const importMatches = [...content.matchAll(/^import .+;$/gm)];
    if (importMatches.length > 0) {
        const lastImport = importMatches[importMatches.length - 1];
        const insertIndex = (lastImport.index || 0) + lastImport[0].length;
        return `${content.slice(0, insertIndex)}\n${importLine}${content.slice(insertIndex)}`;
    }

    return `${importLine}\n${content}`;
}

function updateGameConfigContent(content: string, gameId: string) {
    let nextContent = content;
    const constantImport = `import { GameConstant${gameId} } from '../Utils/GameConstant${gameId}';`;

    nextContent = ensureImportLine(nextContent, constantImport);

    const additions: string[] = [];
    if (!/\bTABLE_FORMAT\b/.test(nextContent)) {
        additions.push(`    public readonly TABLE_FORMAT: number[] = GameConstant${gameId}.TABLE_FORMAT;`);
    }
    if (!/\bSYMBOL_HEIGHT\b/.test(nextContent)) {
        additions.push(`    public readonly SYMBOL_HEIGHT: number = GameConstant${gameId}.SYMBOL_HEIGHT;`);
    }
    if (!/\bSYMBOL_WIDTH\b/.test(nextContent)) {
        additions.push(`    public readonly SYMBOL_WIDTH: number = GameConstant${gameId}.SYMBOL_WIDTH;`);
    }
    if (!/\bWIN_LEVEL_CONFIG\b/.test(nextContent)) {
        additions.push(`    public readonly WIN_LEVEL_CONFIG: any = {
        THRESHOLDS: [1, 3, 10],
        COUNT_MONEY_TIME: { 1: 0.5, 2: 1, 3: 2, 4: 4 },
        WIN_LINE_TIME: { 1: 1.5, 2: 2.5, 3: 3.5, 4: 5.5 },
    };`);
    }
    if (!/\bDEFAULT_TRIAL_BET_ID\b/.test(nextContent)) {
        additions.push(`    public readonly DEFAULT_TRIAL_BET_ID: string = '50';

    // NOTE: should update Default trial for VND & THB
    public readonly DEFAULT_TRIAL_JACKPOT: any = {
		VND: {
			"1_GRAND": 400000,
			"2_GRAND": 800000,
			"3_GRAND": 1200000,
			"4_GRAND": 2000000,
			"5_GRAND": 4000000,
			"6_GRAND": 8000000,
			"7_GRAND": 12000000,
		},
		USD: {
			"1_USD_GRAND": 80,
			"2_USD_GRAND": 400,
			"3_USD_GRAND": 800,
			"4_USD_GRAND": 4000,
			"5_USD_GRAND": 8000,
			"6_USD_GRAND": 40000,
			"7_USD_GRAND": 80000,
		},
		THB: {
			"1_THB_GRAND": 3000,
			"2_THB_GRAND": 5000,
			"3_THB_GRAND": 10000,
			"4_THB_GRAND": 20000,
			"5_THB_GRAND": 30000,
			"6_THB_GRAND": 50000,
			"7_THB_GRAND": 100000,
		}
	};

	public readonly DEFAULT_WALLET_TRIAL: any = {
		VND: 20000000,
		USD: 10000,
		THB: 300000,
	};`);
    }

    if (additions.length === 0) {
        return nextContent;
    }

    const tableFormatMatch = nextContent.match(/^.*\bTABLE_FORMAT\b.*$/m);
    if (tableFormatMatch && tableFormatMatch.index !== undefined && additions.every((addition) => /SYMBOL_(HEIGHT|WIDTH)/.test(addition))) {
        const insertIndex = tableFormatMatch.index + tableFormatMatch[0].length;
        return `${nextContent.slice(0, insertIndex)}\n${additions.join("\n")}${nextContent.slice(insertIndex)}`;
    }

    const hasTrialConfigAddition = additions.some((addition) => addition.includes("DEFAULT_TRIAL_BET_ID"));
    const winLevelConfigMatch = nextContent.match(/^\s*public\s+readonly\s+WIN_LEVEL_CONFIG\b[\s\S]*?\n\s*};/m);
    if (hasTrialConfigAddition && winLevelConfigMatch && winLevelConfigMatch.index !== undefined) {
        const insertIndex = winLevelConfigMatch.index + winLevelConfigMatch[0].length;
        return `${nextContent.slice(0, insertIndex)}\n${additions.join("\n")}${nextContent.slice(insertIndex)}`;
    }

    const totalBetMatch = nextContent.match(/^.*\bTOTAL_BET_CREDIT\b.*$/m);
    if (totalBetMatch && totalBetMatch.index !== undefined) {
        const insertIndex = totalBetMatch.index + totalBetMatch[0].length;
        return `${nextContent.slice(0, insertIndex)}\n${additions.join("\n")}${nextContent.slice(insertIndex)}`;
    }

    const classMatch = nextContent.match(new RegExp(`export\\s+class\\s+GameConfig${gameId}\\s+extends\\s+GameConfig\\s*\\{`));
    if (classMatch && classMatch.index !== undefined) {
        const insertIndex = classMatch.index + classMatch[0].length;
        return `${nextContent.slice(0, insertIndex)}\n${additions.join("\n")}${nextContent.slice(insertIndex)}`;
    }

    throw new Error(`Cannot find GameConfig${gameId} class body.`);
}

function updatePaylineConfigContent(content: string, gameId: string, sourceType: SceneKitSourceType = "scene") {
    let nextContent = sourceType === "fire" ? content : ensureNamedImport(content, "cc", "Vec2");
    nextContent = ensureImportLine(nextContent, `import { GameConstant${gameId} } from '../Utils/GameConstant${gameId}';`);

    if (/^\s*public\s+readonly\s+TABLE_CONFIG\b/m.test(nextContent)) {
        return qualifyFireCocosGlobals(nextContent, sourceType);
    }

    const tableConfig = `    public readonly TABLE_CONFIG: any = {
        format: GameConstant${gameId}.TABLE_FORMAT,
        cellSize: new Vec2(GameConstant${gameId}.SYMBOL_WIDTH, GameConstant${gameId}.SYMBOL_HEIGHT),
        positions: [],
    };`;
    const paylineTypeMatch = nextContent.match(/^\s*public\s+readonly\s+PAYLINE_TYPE\b.*$/m);
    if (paylineTypeMatch && paylineTypeMatch.index !== undefined) {
        const insertIndex = paylineTypeMatch.index + paylineTypeMatch[0].length;
        return qualifyFireCocosGlobals(`${nextContent.slice(0, insertIndex)}\n${tableConfig}${nextContent.slice(insertIndex)}`, sourceType);
    }

    const classMatch = nextContent.match(new RegExp(`export\\s+class\\s+PaylineConfig${gameId}\\s+extends\\s+PaylineConfig\\s*\\{`));
    if (classMatch && classMatch.index !== undefined) {
        const insertIndex = classMatch.index + classMatch[0].length;
        return qualifyFireCocosGlobals(`${nextContent.slice(0, insertIndex)}\n${tableConfig}${nextContent.slice(insertIndex)}`, sourceType);
    }

    throw new Error(`Cannot find PaylineConfig${gameId} class body.`);
}

function updateTableModuleConfigContent(content: string, gameId: string) {
    let nextContent = ensureImportLine(content, `import { GameConstant${gameId} } from '../Utils/GameConstant${gameId}';`);
    const additions: string[] = [];

    if (!/^\s*public\s+SYMBOL_WIDTH\b/m.test(nextContent)) {
        additions.push(`    public SYMBOL_WIDTH: number = GameConstant${gameId}.SYMBOL_WIDTH;`);
    }
    if (!/^\s*public\s+SYMBOL_HEIGHT\b/m.test(nextContent)) {
        additions.push(`    public SYMBOL_HEIGHT: number = GameConstant${gameId}.SYMBOL_HEIGHT;`);
    }
    if (!/^\s*public\s+TABLE_FORMAT\b/m.test(nextContent)) {
        additions.push(`    public TABLE_FORMAT: number[] = GameConstant${gameId}.TABLE_FORMAT;`);
    }

    if (additions.length === 0) {
        return nextContent;
    }

    const classMatch = nextContent.match(new RegExp(`export\\s+class\\s+TableModuleConfig${gameId}\\s+extends\\s+TableModuleConfig\\s*\\{`));
    if (classMatch && classMatch.index !== undefined) {
        const insertIndex = classMatch.index + classMatch[0].length;
        return `${nextContent.slice(0, insertIndex)}\n${additions.join("\n")}${nextContent.slice(insertIndex)}`;
    }

    throw new Error(`Cannot find TableModuleConfig${gameId} class body.`);
}

function getBoilerplateFiles(sceneFilePath: string, gameId: string, tableFormat: number[], sourceType: SceneKitSourceType = "scene") {
    const projectRoot = path.dirname(sceneFilePath);
    const files = [
        {
            filePath: path.join(projectRoot, "scripts", "Core", `GameConfig${gameId}.ts`),
            content: createGameConfigTemplate(gameId, sourceType),
            mode: "patchGameConfig" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "Core", `GameDirector${gameId}.ts`),
            content: createGameDirectorTemplate(gameId, sourceType),
            mode: "overwrite" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "Core", `SlotSoundPlayerModule${gameId}.ts`),
            content: createSlotSoundPlayerModuleTemplate(gameId, sourceType),
            mode: "overwrite" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "Payline", `PaylineConfig${gameId}.ts`),
            content: createPaylineConfigTemplate(gameId, sourceType),
            mode: "patchPaylineConfig" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "Payline", `PaylineSymbolModule${gameId}.ts`),
            content: createPaylineSymbolModuleTemplate(gameId, sourceType),
            mode: "overwrite" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "Table", `TableModuleConfig${gameId}.ts`),
            content: createTableModuleConfigTemplate(gameId, sourceType),
            mode: "patchTableModuleConfig" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "Table", `SlotReelModule${gameId}.ts`),
            content: createSlotReelModuleTemplate(gameId, sourceType),
            mode: "overwrite" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "Table", `SlotSymbolModule${gameId}.ts`),
            content: createSlotSymbolModuleTemplate(gameId, sourceType),
            mode: "overwrite" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "Table", `SlotTableModule${gameId}.ts`),
            content: createSlotTableModuleTemplate(gameId, sourceType),
            mode: "overwrite" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "GameMode", `NormalGameDirectorModule${gameId}.ts`),
            content: createNormalGameDirectorModuleTemplate(gameId, sourceType),
            mode: "overwrite" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "GameMode", `FreeGameDirectorModule${gameId}.ts`),
            content: createFreeGameDirectorModuleTemplate(gameId, sourceType),
            mode: "overwrite" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "Cutscene", `JackpotWinModule${gameId}.ts`),
            content: createJackpotWinModuleTemplate(gameId, sourceType),
            mode: "overwrite" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "Cutscene", `WinEffectModule${gameId}.ts`),
            content: createWinEffectModuleTemplate(gameId, sourceType),
            mode: "overwrite" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "Cutscene", `TotalWinModule${gameId}.ts`),
            content: createTotalWinModuleTemplate(gameId, sourceType),
            mode: "overwrite" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "Cutscene", `CoinEffect${gameId}.ts`),
            content: createCoinEffectTemplate(gameId, sourceType),
            mode: "overwrite" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "Cutscene", `ParticleControl${gameId}.ts`),
            content: createParticleControlTemplate(gameId, sourceType),
            mode: "overwrite" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "Cutscene", `InfoPanel${gameId}.ts`),
            content: createInfoPanelTemplate(gameId, sourceType),
            mode: "overwrite" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "Gui", `WinAmountModule${gameId}.ts`),
            content: createWinAmountModuleTemplate(gameId, sourceType),
            mode: "overwrite" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "Gui", `SlotButtonNormal${gameId}.ts`),
            content: createSlotButtonNormalTemplate(gameId, sourceType),
            mode: "overwrite" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "Gui", `SlotButtonSpine${gameId}.ts`),
            content: createSlotButtonSpineTemplate(gameId, sourceType),
            mode: "overwrite" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "DataConfig", `EventConfig${gameId}.ts`),
            content: createEventConfigTemplate(gameId),
            mode: "overwrite" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "DataConfig", `SoundConfig${gameId}.ts`),
            content: createSoundConfigTemplate(),
            mode: "overwrite" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "DataConfig", `AnimConfig${gameId}.ts`),
            content: createAnimConfigTemplate(),
            mode: "overwrite" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "DataConfig", `TimeConfig${gameId}.ts`),
            content: createTimeConfigTemplate(),
            mode: "overwrite" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "Utils", `DataType${gameId}.ts`),
            content: createDataTypeTemplate(gameId),
            mode: "overwrite" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "Utils", `DataUtils${gameId}.ts`),
            content: createDataUtilsTemplate(gameId),
            mode: "overwrite" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "Utils", `GameConstant${gameId}.ts`),
            content: createGameConstantTemplate(gameId, tableFormat),
            mode: "overwrite" as const,
        },
    ];

    return files.map((file) => ({
        ...file,
        content: qualifyFireCocosGlobals(file.content, sourceType),
    }));
}

function readJsonFile<T>(filePath: string): T {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function ensureTypescriptMetaFile(scriptFilePath: string) {
    if (!scriptFilePath.endsWith(".ts")) {
        return;
    }

    const metaPath = `${scriptFilePath}.meta`;
    if (fs.existsSync(metaPath)) {
        return;
    }

    const meta = {
        ver: "4.0.23",
        importer: "typescript",
        imported: true,
        uuid: randomUUID(),
        files: [],
        subMetas: {},
        userData: {},
    };
    fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
}

function getBoilerplateStatusRank(status: BoilerplateFileResult["status"]) {
    if (status === "updated") return 3;
    if (status === "created") return 2;
    return 1;
}

function mergeBoilerplateFileResults(results: BoilerplateFileResult[]): BoilerplateFileResult[] {
    const merged = new Map<string, BoilerplateFileResult>();

    for (const result of results) {
        const current = merged.get(result.filePath);
        if (!current || getBoilerplateStatusRank(result.status) > getBoilerplateStatusRank(current.status)) {
            merged.set(result.filePath, result);
        }
    }

    return Array.from(merged.values());
}

function findFirstFileByName(rootDir: string, fileName: string): string | null {
    if (!fs.existsSync(rootDir)) {
        return null;
    }

    const entries = fs.readdirSync(rootDir, { withFileTypes: true });
    for (const entry of entries) {
        const entryPath = path.join(rootDir, entry.name);
        if (entry.isFile() && entry.name === fileName) {
            return entryPath;
        }
        if (entry.isDirectory()) {
            const foundPath = findFirstFileByName(entryPath, fileName);
            if (foundPath) {
                return foundPath;
            }
        }
    }

    return null;
}

function getCommonSlotModuleRoot(projectRoot: string, sourceType: SceneKitSourceType) {
    return path.resolve(projectRoot, "..", "..", "cc-common", sourceType === "fire" ? "cc-slot-module" : "cc30-slot-module");
}

function readMetaUuid(metaPath: string): string | null {
    if (!fs.existsSync(metaPath)) {
        return null;
    }

    const meta = readJsonFile<{ uuid?: unknown }>(metaPath);
    return typeof meta.uuid === "string" && meta.uuid.trim() ? meta.uuid.trim() : null;
}

function getReelPrefabPatchTargets(projectRoot: string) {
    return [
        path.join(projectRoot, "data", "prefabs", "GameMode", "MainGamePrefab.prefab"),
        path.join(projectRoot, "data", "prefabs", "GameMode", "FreeGamePrefab.prefab"),
    ];
}

function getSceneKitPatchPreview(sceneFilePath: string, gameId: string): SceneKitPatchTarget[] {
    const projectRoot = path.dirname(sceneFilePath);
    const reelPrefabMetaPath = path.join(projectRoot, "data", "prefabs", "Table", `SlotReelPrefab${gameId}.prefab.meta`);

    return [
        {
            filePath: reelPrefabMetaPath,
            status: fs.existsSync(reelPrefabMetaPath) ? "exists" : "missing",
        },
        ...getReelPrefabPatchTargets(projectRoot).map((filePath) => ({
            filePath,
            status: fs.existsSync(filePath) ? "exists" as const : "missing" as const,
        })),
    ];
}

function patchReelPrefabRefs(projectRoot: string, gameId: string, sourceType: SceneKitSourceType): BoilerplateFileResult[] {
    const reelPrefabMetaPath = path.join(projectRoot, "data", "prefabs", "Table", `SlotReelPrefab${gameId}.prefab.meta`);
    if (!fs.existsSync(reelPrefabMetaPath)) {
        throw new Error(`SlotReelPrefab${gameId}.prefab.meta does not exist.`);
    }

    const reelPrefabMeta = readJsonFile<{ uuid?: unknown }>(reelPrefabMetaPath);
    if (typeof reelPrefabMeta.uuid !== "string" || !reelPrefabMeta.uuid.trim()) {
        throw new Error(`SlotReelPrefab${gameId}.prefab.meta does not contain a valid uuid.`);
    }

    const reelPrefabUuid = reelPrefabMeta.uuid.trim();
    const results: BoilerplateFileResult[] = [];
    const reelPrefabRefPattern = sourceType === "fire"
        ? /("reelPrefab"\s*:\s*\{\s*"__uuid__"\s*:\s*")([^"]+)("(\s*,\s*"__expectedType__"\s*:\s*"cc\.Prefab")?\s*\})/g
        : /("reelPrefab"\s*:\s*\{\s*"__uuid__"\s*:\s*")([^"]+)("\s*,\s*"__expectedType__"\s*:\s*"cc\.Prefab"\s*\})/g;

    for (const prefabPath of getReelPrefabPatchTargets(projectRoot)) {
        if (!fs.existsSync(prefabPath)) {
            continue;
        }

        const currentContent = fs.readFileSync(prefabPath, "utf8");
        let replacedCount = 0;
        const nextContent = currentContent.replace(reelPrefabRefPattern, (match, prefix: string, currentUuid: string, suffix: string) => {
            replacedCount += 1;
            if (currentUuid === reelPrefabUuid) {
                return match;
            }
            return `${prefix}${reelPrefabUuid}${suffix}`;
        });

        if (replacedCount === 0) {
            results.push({ filePath: prefabPath, status: "exists" });
            continue;
        }

        if (nextContent !== currentContent) {
            JSON.parse(nextContent);
            fs.writeFileSync(prefabPath, nextContent, "utf8");
            results.push({ filePath: prefabPath, status: "updated" });
        } else {
            results.push({ filePath: prefabPath, status: "exists" });
        }
    }

    return results;
}

function replaceUuidPairsInFile(targetFilePath: string, oldUuid: string, newUuid: string): BoilerplateFileResult {
    const pairs = getUuidReplacementPairs(oldUuid, newUuid);
    const currentContent = fs.readFileSync(targetFilePath, "utf8");
    let nextContent = currentContent;

    for (const pair of pairs) {
        nextContent = nextContent.replace(new RegExp(escapeRegExp(pair.from), "g"), pair.to);
    }

    if (nextContent === currentContent) {
        return { filePath: targetFilePath, status: "exists" };
    }

    JSON.parse(nextContent);
    fs.writeFileSync(targetFilePath, nextContent, "utf8");
    return { filePath: targetFilePath, status: "updated" };
}

function patchStarterKitScriptRefs(sceneFilePath: string, projectRoot: string, gameId: string, sourceType: SceneKitSourceType): BoilerplateFileResult[] {
    const commonRoot = getCommonSlotModuleRoot(projectRoot, sourceType);
    const patchTargets: Array<{
        targetFilePaths: string[];
        baseMetaName: string;
        newMetaPath: string;
    }> = [
        {
            targetFilePaths: [sceneFilePath],
            baseMetaName: "GameDirector.ts.meta",
            newMetaPath: path.join(projectRoot, "scripts", "Core", `GameDirector${gameId}.ts.meta`),
        },
        {
            targetFilePaths: [
                path.join(projectRoot, "data", "prefabs", "Popup", "InfoPanel.prefab"),
                path.join(projectRoot, "data", "prefabs", "Popup", "Info", "InfoPanel.prefab"),
            ],
            baseMetaName: "InfoPanel.ts.meta",
            newMetaPath: path.join(projectRoot, "scripts", "Cutscene", `InfoPanel${gameId}.ts.meta`),
        },
        {
            targetFilePaths: getReelPrefabPatchTargets(projectRoot),
            baseMetaName: "SlotTableModule.ts.meta",
            newMetaPath: path.join(projectRoot, "scripts", "Table", `SlotTableModule${gameId}.ts.meta`),
        },
        {
            targetFilePaths: [path.join(projectRoot, "data", "prefabs", "Table", `SlotReelPrefab${gameId}.prefab`)],
            baseMetaName: "SlotReelModule.ts.meta",
            newMetaPath: path.join(projectRoot, "scripts", "Table", `SlotReelModule${gameId}.ts.meta`),
        },
        {
            targetFilePaths: [path.join(projectRoot, "data", "prefabs", "Table", `SymbolPrefab${gameId}.prefab`)],
            baseMetaName: "SlotSymbolModule.ts.meta",
            newMetaPath: path.join(projectRoot, "scripts", "Table", `SlotSymbolModule${gameId}.ts.meta`),
        },
        {
            targetFilePaths: [path.join(projectRoot, "data", "prefabs", "GameMode", "MainGamePrefab.prefab")],
            baseMetaName: "NormalGameDirectorModule.ts.meta",
            newMetaPath: path.join(projectRoot, "scripts", "GameMode", `NormalGameDirectorModule${gameId}.ts.meta`),
        },
        {
            targetFilePaths: [path.join(projectRoot, "data", "prefabs", "GameMode", "FreeGamePrefab.prefab")],
            baseMetaName: "FreeGameDirectorModule.ts.meta",
            newMetaPath: path.join(projectRoot, "scripts", "GameMode", `FreeGameDirectorModule${gameId}.ts.meta`),
        },
        {
            targetFilePaths: [path.join(projectRoot, "data", "prefabs", "Cutscene", "JackpotWin.prefab")],
            baseMetaName: "JackpotWinModule.ts.meta",
            newMetaPath: path.join(projectRoot, "scripts", "Cutscene", `JackpotWinModule${gameId}.ts.meta`),
        },
        {
            targetFilePaths: [path.join(projectRoot, "data", "prefabs", "Cutscene", "WinEffect.prefab")],
            baseMetaName: "WinEffectModule.ts.meta",
            newMetaPath: path.join(projectRoot, "scripts", "Cutscene", `WinEffectModule${gameId}.ts.meta`),
        },
        {
            targetFilePaths: [path.join(projectRoot, "data", "prefabs", "Cutscene", "TotalWin.prefab")],
            baseMetaName: "TotalWinModule.ts.meta",
            newMetaPath: path.join(projectRoot, "scripts", "Cutscene", `TotalWinModule${gameId}.ts.meta`),
        },
    ];

    const results: BoilerplateFileResult[] = [];
    for (const target of patchTargets) {
        const baseMetaPath = findFirstFileByName(commonRoot, target.baseMetaName);
        const oldUuid = baseMetaPath ? readMetaUuid(baseMetaPath) : null;
        const newUuid = readMetaUuid(target.newMetaPath);
        if (!oldUuid || !newUuid) {
            continue;
        }

        for (const targetFilePath of target.targetFilePaths) {
            if (!fs.existsSync(targetFilePath)) {
                continue;
            }
            results.push(replaceUuidPairsInFile(targetFilePath, oldUuid, newUuid));
        }
    }

    return results;
}

function getUuidLikeReplacementPairs(oldUuidInput: string, newUuidInput: string) {
    const oldValue = String(oldUuidInput || "").trim();
    const newValue = String(newUuidInput || "").trim();

    if (!oldValue || !newValue) {
        throw new Error("Old UUID and new UUID are required.");
    }

    const isOldRawUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(oldValue);
    const isNewRawUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(newValue);

    if (isOldRawUuid !== isNewRawUuid) {
        throw new Error("Old and new UUID must use the same format.");
    }

    if (isOldRawUuid && isNewRawUuid) {
        return getUuidReplacementPairs(oldValue, newValue);
    }

    return [{ from: oldValue, to: newValue }];
}

function replaceUuidRefs(targetFilePathInput: string, oldUuidInput: string, newUuidInput: string, shouldWrite: boolean) {
    const targetFilePath = String(targetFilePathInput || "").trim();

    if (!targetFilePath || !isCocosSceneOrPrefabFile(targetFilePath)) {
        throw new Error("Please choose a .scene, .fire, or .prefab target file.");
    }
    if (!fs.existsSync(targetFilePath)) {
        throw new Error("Target scene/fire/prefab file does not exist.");
    }

    const pairs = getUuidLikeReplacementPairs(oldUuidInput, newUuidInput);
    const currentContent = fs.readFileSync(targetFilePath, "utf8");
    let nextContent = currentContent;
    const replacements: ComponentRefReplacement[] = [];

    for (const pair of pairs) {
        const pattern = new RegExp(escapeRegExp(pair.from), "g");
        const count = nextContent.match(pattern)?.length ?? 0;
        if (count === 0) {
            continue;
        }

        nextContent = nextContent.replace(pattern, pair.to);
        replacements.push({
            from: pair.from,
            to: pair.to,
            count,
        });
    }

    const totalCount = replacements.reduce((sum, item) => sum + item.count, 0);
    const changed = nextContent !== currentContent;

    if (shouldWrite && changed) {
        JSON.parse(nextContent);
        fs.writeFileSync(targetFilePath, nextContent, "utf8");
    }

    return {
        targetFilePath,
        oldUuid: String(oldUuidInput || "").trim(),
        newUuid: String(newUuidInput || "").trim(),
        replacements,
        totalCount,
        changed,
    };
}

export function registerSceneKitHandler() {
    ipcMain.handle("scene-kit:select-source-file", async (_event, sourceTypeInput?: string) => {
        const sourceType = normalizeSceneKitSourceType(sourceTypeInput);
        const extension = getSceneKitSourceExtension(sourceType).slice(1);
        const result = await dialog.showOpenDialog({
            properties: ["openFile"],
            filters: [
                { name: sourceType === "fire" ? "Cocos 2.x Fire" : "Cocos 3.x Scene", extensions: [extension] },
            ],
        });
        if (result.canceled || result.filePaths.length === 0) return null;
        return result.filePaths[0];
    });

    ipcMain.handle("scene-kit:select-scene-or-prefab-file", async () => {
        const result = await dialog.showOpenDialog({
            properties: ["openFile"],
            filters: [
                { name: "Cocos Scene or Prefab", extensions: ["scene", "fire", "prefab"] },
            ],
        });
        if (result.canceled || result.filePaths.length === 0) return null;
        return result.filePaths[0];
    });

    ipcMain.handle("scene-kit:preview-boilerplate", async (_event, sceneFilePath: string, tableFormatInput?: string, sourceTypeInput?: string) => {
        const sourceType = normalizeSceneKitSourceType(sourceTypeInput);
        const sourceExtension = getSceneKitSourceExtension(sourceType);
        const normalizedScenePath = String(sceneFilePath || "").trim();
        const gameId = extractGameIdFromScenePath(normalizedScenePath);
        const tableFormat = parseTableFormatInput(tableFormatInput);

        if (!normalizedScenePath || !isCocosSceneFile(normalizedScenePath, sourceType)) {
            throw new Error(`Please choose a ${sourceExtension} file.`);
        }

        if (!gameId) {
            throw new Error(`Cannot detect gameId from ${sourceExtension} file name.`);
        }

        return {
            gameId,
            sourceType,
            projectRoot: path.dirname(normalizedScenePath),
            tableFormat,
            files: getBoilerplateFiles(normalizedScenePath, gameId, tableFormat, sourceType).map((file) => ({
                filePath: file.filePath,
                status: fs.existsSync(file.filePath) ? "exists" : "new",
            })),
            patches: getSceneKitPatchPreview(normalizedScenePath, gameId),
        };
    });

    ipcMain.handle("scene-kit:create-boilerplate", async (_event, sceneFilePath: string, tableFormatInput?: string, sourceTypeInput?: string) => {
        const sourceType = normalizeSceneKitSourceType(sourceTypeInput);
        const sourceExtension = getSceneKitSourceExtension(sourceType);
        const normalizedScenePath = String(sceneFilePath || "").trim();
        const gameId = extractGameIdFromScenePath(normalizedScenePath);
        const tableFormat = parseTableFormatInput(tableFormatInput);

        if (!normalizedScenePath || !isCocosSceneFile(normalizedScenePath, sourceType)) {
            throw new Error(`Please choose a ${sourceExtension} file.`);
        }

        if (!fs.existsSync(normalizedScenePath)) {
            throw new Error(`${sourceExtension} file does not exist.`);
        }

        if (!gameId) {
            throw new Error(`Cannot detect gameId from ${sourceExtension} file name.`);
        }

        const results: BoilerplateFileResult[] = [];
        for (const file of getBoilerplateFiles(normalizedScenePath, gameId, tableFormat, sourceType)) {
            if (fs.existsSync(file.filePath)) {
                const currentContent = fs.readFileSync(file.filePath, "utf8");
                let nextContent = file.content;
                if (file.mode === "patchGameConfig") {
                    nextContent = updateGameConfigContent(currentContent, gameId);
                } else if (file.mode === "patchPaylineConfig") {
                    nextContent = updatePaylineConfigContent(currentContent, gameId, sourceType);
                } else if (file.mode === "patchTableModuleConfig") {
                    nextContent = updateTableModuleConfigContent(currentContent, gameId);
                }
                nextContent = qualifyFireCocosGlobals(nextContent, sourceType);
                fs.writeFileSync(file.filePath, nextContent, "utf8");
                ensureTypescriptMetaFile(file.filePath);
                results.push({ filePath: file.filePath, status: nextContent === currentContent ? "exists" : "updated" });
                continue;
            }

            fs.mkdirSync(path.dirname(file.filePath), { recursive: true });
            fs.writeFileSync(file.filePath, file.content, "utf8");
            ensureTypescriptMetaFile(file.filePath);
            results.push({ filePath: file.filePath, status: "created" });
        }
        const projectRoot = path.dirname(normalizedScenePath);
        results.push(...patchReelPrefabRefs(projectRoot, gameId, sourceType));
        results.push(...patchStarterKitScriptRefs(normalizedScenePath, projectRoot, gameId, sourceType));
        const mergedResults = mergeBoilerplateFileResults(results);

        return {
            gameId,
            sourceType,
            projectRoot,
            tableFormat,
            files: mergedResults,
        };
    });

    ipcMain.handle("scene-kit:replace-uuid-ref", async (_event, targetFilePath: string, oldUuid: string, newUuid: string) => {
        return replaceUuidRefs(targetFilePath, oldUuid, newUuid, true);
    });
}

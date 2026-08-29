import { ipcMain } from "electron";
import fs from "fs";
import path from "path";

interface BoilerplateFileResult {
    filePath: string;
    status: "created" | "exists" | "updated";
}

function extractGameIdFromScenePath(sceneFilePath: string) {
    const fileName = path.basename(sceneFilePath);
    const sceneNameMatch = fileName.match(/^g(\d{4,})(?:[A-Za-z])?\.scene$/i);
    if (sceneNameMatch) {
        return sceneNameMatch[1];
    }

    const fallbackMatch = sceneFilePath.match(/(?:^|[^\d])(\d{4,})(?:[^\d]|$)/);
    return fallbackMatch ? fallbackMatch[1] : "";
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

function createDateTypeTemplate(gameId: string) {
    return `export enum DateType${gameId} {
}
`;
}

function createDataUtilsTemplate(gameId: string) {
    return `export class DataUtils${gameId} {
}
`;
}

function createGameConstantTemplate(gameId: string) {
    return `export const GameConstant${gameId} = {
    SYMBOL_HEIGHT: 128,
    SYMBOL_WIDTH: 140,
    TABLE_FORMAT: [3, 3, 3, 3, 3],
    SCATTER_SYMBOL: 'A',
    WILD_SYMBOL: 'K',
};
`;
}

function createGameConfigTemplate(gameId: string) {
    return `import { _decorator } from 'cc';
import { GameConfig } from '../../../../cc-common/cc30-slot-module/SlotModuleExport';
import { PAY_SYSTEM_TYPE_ENUM } from '../../../../cc-common/cc30-slot-module/SlotModuleExport';
import { GameConstant${gameId} } from '../Utils/GameConstant${gameId}';
const { ccclass } = _decorator;
@ccclass('GameConfig${gameId}')
export class GameConfig${gameId} extends GameConfig {
    public GAME_ID = "${gameId}";
    public JP_PREFIX_EVENT = "${gameId}_";
    public PAY_SYSTEM = PAY_SYSTEM_TYPE_ENUM.ALLWAYS;
    public TOTAL_BET_CREDIT:number = 25;
    public readonly TABLE_FORMAT: number[] = GameConstant${gameId}.TABLE_FORMAT;
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

function createGameDirectorTemplate(gameId: string) {
    return `import { _decorator } from 'cc';
const { ccclass } = _decorator;
import { GAME_MODE_ENUM, GameDirector } from '../../../../cc-common/cc30-slot-module/SlotModuleExport';
import { FreeGameDirectorModule${gameId} } from '../GameMode/FreeGameDirectorModule${gameId}';
import { GameConstant${gameId} } from '../Utils/GameConstant${gameId}';
import { GAME_EVENT_${gameId} } from '../DataConfig/EventConfig${gameId}';
@ccclass('GameDirector${gameId}')
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

function createPaylineConfigTemplate(gameId: string) {
    return `import { _decorator, Vec2 } from 'cc';
import { PaylineConfig, PAYLINE_TYPE } from '../../../../cc-common/cc30-slot-module/SlotModuleExport';
import { GameConstant${gameId} } from '../Utils/GameConstant${gameId}';
const { ccclass } = _decorator;
@ccclass('PaylineConfig${gameId}')
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

function createPaylineSymbolModuleTemplate(gameId: string) {
    return `import { _decorator } from 'cc';
import { PayLineInfo, PaylineSymbolModule, PayWayInfo } from '../../../../cc-common/cc30-slot-module/SlotModuleExport';
import { GameConstant${gameId} } from '../Utils/GameConstant${gameId}';
import { SOUND_CONFIG } from '../DataConfig/SoundConfig${gameId}';
const { ccclass } = _decorator;
@ccclass('PaylineSymbolModule${gameId}')
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

function createTableModuleConfigTemplate(gameId: string) {
    return `import { _decorator } from 'cc';
import { TableModuleConfig } from '../../../../cc-common/cc30-slot-module/SlotModuleExport';
import { GameConstant${gameId} } from '../Utils/GameConstant${gameId}';
const { ccclass } = _decorator;
@ccclass('TableModuleConfig${gameId}')
export class TableModuleConfig${gameId} extends TableModuleConfig {
    public SYMBOL_WIDTH: number = GameConstant${gameId}.SYMBOL_WIDTH;
    public SYMBOL_HEIGHT: number = GameConstant${gameId}.SYMBOL_HEIGHT;
    public TABLE_FORMAT: number[] = GameConstant${gameId}.TABLE_FORMAT;
}
`;
}

function createSlotReelModuleTemplate(gameId: string) {
    return `import { _decorator } from 'cc';
import { GAME_MODE_ENUM, SlotReelModule } from '../../../../cc-common/cc30-slot-module/SlotModuleExport';
const { ccclass } = _decorator;
@ccclass('SlotReelModule${gameId}')
export class SlotReelModule${gameId} extends SlotReelModule {
    gameMode: typeof GAME_MODE_ENUM;

    setGameMode(gameMode: typeof GAME_MODE_ENUM): void {
        this.gameMode = gameMode;
    }
}
`;
}

function createSlotSymbolModuleTemplate(gameId: string) {
    return `import { _decorator, Color, tween, Tween, UIRenderer } from 'cc';
import { SlotSymbolModule } from '../../../../cc-common/cc30-slot-module/SlotModuleExport';
const { ccclass } = _decorator;
@ccclass('SlotSymbolModule${gameId}')
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
                renderer['tweenColor'] && renderer['tweenColor'].stop();
                renderer['tweenColor'] = null;

                if (duration) {
                    const tweenColor = this.tweenColor(renderer, duration, targetColor);
                    renderer['tweenColor'] = tweenColor;
                } else {
                    renderer.color = targetColor;
                }
            }
        });
    }

    enableHighlight(duration: number = 0.2): void {
        if (duration > 0) {
            this.node["isHighlight"] = true;
            const normalColor = this.resourceManager.getColorNormal();
            this.tweenRenderersColor(duration, normalColor);
            return;
        }

        super.enableHighlight();
    }

    disableHighlight(duration: number = 0.2): void {
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
        this._rendererList.forEach(renderer => {
            renderer['tweenColor'] && renderer['tweenColor'].stop();
            renderer['tweenColor'] = null;
        });
    }
}
`;
}

function createSlotTableModuleTemplate(gameId: string) {
    return `import { _decorator } from 'cc';
import { GAME_MODE_ENUM, SlotTableModule } from '../../../../cc-common/cc30-slot-module/SlotModuleExport';
import { SlotReelModule${gameId} } from './SlotReelModule${gameId}';
const { ccclass } = _decorator;
@ccclass('SlotTableModule${gameId}')
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

function createNormalGameDirectorModuleTemplate(gameId: string) {
    return `import { _decorator } from 'cc';
import { GAME_MODE_ENUM, NormalGameDirectorModule } from '../../../../cc-common/cc30-slot-module/SlotModuleExport';
import { GAME_EVENT_${gameId} } from '../DataConfig/EventConfig${gameId}';
const { ccclass } = _decorator;
@ccclass('NormalGameDirectorModule${gameId}')
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

function createFreeGameDirectorModuleTemplate(gameId: string) {
    return `import { _decorator } from 'cc';
import { GAME_MODE_ENUM, FreeGameDirectorModule } from '../../../../cc-common/cc30-slot-module/SlotModuleExport';
const { ccclass } = _decorator;
@ccclass('FreeGameDirectorModule${gameId}')
export class FreeGameDirectorModule${gameId} extends FreeGameDirectorModule {
    preResumeFreeTable(data): void {
        this.moduleEvent.emit('SYNC_TABLE', data, GAME_MODE_ENUM.FREE_GAME);
    }
}
`;
}

function createJackpotWinModuleTemplate(gameId: string) {
    return `import { _decorator, sp, Tween, tween } from 'cc';
import { JackpotWinModule } from '../../../../cc-common/cc30-slot-module/SlotModuleExport';
import { UI_JACKPOT_ANIM } from '../DataConfig/AnimConfig${gameId}';
import { SOUND_CONFIG } from '../DataConfig/SoundConfig${gameId}';
const { ccclass, property } = _decorator;
const FADE_DURATION = 0.2;
@ccclass('JackpotWinModule${gameId}')
export class JackpotWinModule${gameId} extends JackpotWinModule {
    @property(sp.Skeleton) jackpotWinEffect: sp.Skeleton = null;

    // #region Base
    onLoadExtend(): void {
        super.onLoadExtend();
        this.jackpotWinEffect.setMix(UI_JACKPOT_ANIM.IDLE, UI_JACKPOT_ANIM.DISAPPEAR, 0.2);
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
    reset(): void {
        Tween.stopAllByTarget(this.node);
        this.jackpotWinEffect.node.active = false;
    }

    enter(): void {
        this.reset();
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
        this.jackpotWinEffect.node.active = true;
        this.jackpotWinEffect.setAnimation(0, UI_JACKPOT_ANIM.APPEAR, false);
        this.jackpotWinEffect.addAnimation(0, UI_JACKPOT_ANIM.IDLE, true);
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
                this.jackpotWinEffect.setAnimation(0, UI_JACKPOT_ANIM.DISAPPEAR, false);
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

function createWinEffectModuleTemplate(gameId: string) {
    return `import { _decorator, sp, tween, Tween } from 'cc';
import { GameUIEvents, WinEffectLevelEnum, WinEffectModule } from '../../../../cc-common/cc30-slot-module/SlotModuleExport';
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

@ccclass('WinEffectModule${gameId}')
export class WinEffectModule${gameId} extends WinEffectModule {
    @property(sp.Skeleton) bigWinEffect: sp.Skeleton = null;
    private mixTime = 0.2;
    private playingLevelSfx: string | null = null;
    private endWinEffectLevel: WinEffectLevelEnum = WinEffectLevelEnum.BIG;
    private bigWinSoundTime: number = 0;
    private _tweenSound: Tween<any> = null;

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
        this.bigWinEffect.setAnimation(0, this.getBigWinEffectAnimName(titleIndex, 'APPEAR'), false);
        this.bigWinEffect.addAnimation(0, this.getBigWinEffectAnimName(titleIndex, 'IDLE'), true);
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
                this.bigWinEffect.setMix(appear, disappear, this.mixTime);
                this.bigWinEffect.setMix(idle, disappear, this.mixTime);
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
        this.playingLevelSfx = null;
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
        this._tweenSound = null;
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
                this.bigWinEffect.setAnimation(0, this.getBigWinEffectAnimName(this._currentTitle, 'DISAPPEAR'), false);
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

function createTotalWinModuleTemplate(gameId: string) {
    return `import { _decorator, sp, tween } from 'cc';
import { TotalWinModule } from '../../../../cc-common/cc30-slot-module/SlotModuleExport';
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
@ccclass('TotalWinModule${gameId}')
export class TotalWinModule${gameId} extends TotalWinModule {
    @property(sp.Skeleton) totalWinAnim: sp.Skeleton = null;
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
        this.totalWinAnim.setAnimation(0, this.getTotalWinAnimName(this.level, 'APPEAR'), false);
        this.totalWinAnim.addAnimation(0, this.getTotalWinAnimName(this.level, 'IDLE'), true);
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
                this.totalWinAnim.setAnimation(0, this.getTotalWinAnimName(this.level, 'DISAPPEAR'), false);
                this.callback && this.callback();
                this.callback = null;
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

function createCoinEffectTemplate(gameId: string) {
    return `import { _decorator, Component, Node } from 'cc';
import { WinEffectLevelEnum } from '../../../../cc-common/cc30-slot-module/SlotModuleExport';
const { ccclass, property } = _decorator;
@ccclass('CoinEffect${gameId}')
export class CoinEffect${gameId} extends Component {
    @property({ type: Node }) coinBigWin: Node = null;
    @property({ type: Node }) coinMegaWin: Node = null;
    @property({ type: Node }) coinSuperWin: Node = null;
    @property({ type: Node }) turboCoin: Node = null;

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

function createParticleControlTemplate(gameId: string) {
    return `import { _decorator, Component, ParticleSystem2D } from 'cc';
const { ccclass } = _decorator;
const { setOpacity } = eno;

@ccclass('ParticleControl${gameId}')
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

function createInfoPanelTemplate(gameId: string) {
    return `import { _decorator } from 'cc';
const { ccclass } = _decorator;
import { InfoPanel } from '../../../../cc-common/cc30-slot-module/SlotModuleExport';
@ccclass('InfoPanel${gameId}')
export class InfoPanel${gameId} extends InfoPanel {
    onLoadExtend(): void {
        super.onLoadExtend();
        this.pageView.node.off('page-turning', this.pageViewEvent, this);
        this.pageView.node.on('scroll-ended', this.pageViewEvent, this);
    }
}
`;
}

function createSlotButtonSpineTemplate(gameId: string) {
    return `import { _decorator, Node, tween, Tween } from "cc";
import { SlotButtonSpine } from "../../../../cc-common/cc30-slot-module/SlotModuleExport";
import { BTN_SPIN_ANIM } from "../DataConfig/AnimConfig${gameId}";
import { BUTTON_EVENT_${gameId} } from "../DataConfig/EventConfig${gameId}";
const { ccclass, property } = _decorator;
@ccclass("SlotButtonSpine${gameId}")
export class SlotButtonSpine${gameId} extends SlotButtonSpine {
    @property(Node) arrow: Node;

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

function createSlotButtonNormalTemplate(gameId: string) {
    return `import { _decorator, EventKeyboard, KeyCode, tween } from "cc";
import { GameLogicUIEvents, SlotButtonNormal, SPIN_BUTTON_STATE_ENUM } from "../../../../cc-common/cc30-slot-module/SlotModuleExport";
import { BUTTON_EVENT_${gameId} } from "../DataConfig/EventConfig${gameId}";
import { SOUND_CONFIG } from "../DataConfig/SoundConfig${gameId}";

const { ccclass } = _decorator;
const DELAY_LOADING_TIME = 0.3;
@ccclass("SlotButtonNormal${gameId}")
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

function createWinAmountModuleTemplate(gameId: string) {
    return `import { Label, Node, Tween, Vec3, _decorator, log, sp, tween } from 'cc';
import { PoolFactoryModule, WinAmountModule } from '../../../../cc-common/cc30-slot-module/SlotModuleExport';
import { UI_SUBWINAMOUNT_ANIM, UI_WIN_AMOUNT_ANIM } from '../DataConfig/AnimConfig${gameId}';
import { SOUND_CONFIG } from '../DataConfig/SoundConfig${gameId}';
import { UI_SUBWINAMOUNT_TIME } from '../DataConfig/TimeConfig${gameId}';
const { ccclass, property } = _decorator;
const { fadeOut, setOpacity } = eno;

@ccclass('WinAmountModule${gameId}')
export class WinAmountModule${gameId} extends WinAmountModule {
    @property(sp.Skeleton) subWinFrameEffect: sp.Skeleton = null;
    @property(Label) labelSubWinAmount: Label = null;
    @property(Node) holderNode: Node = null;
    @property({ type: PoolFactoryModule }) labelPool: PoolFactoryModule;

    winAmountPS: number = 0;
    _charNodeList: Node[];
    _tweenFadeSubWin: Tween<Node>;

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

function updatePaylineConfigContent(content: string, gameId: string) {
    let nextContent = ensureNamedImport(content, "cc", "Vec2");
    nextContent = ensureImportLine(nextContent, `import { GameConstant${gameId} } from '../Utils/GameConstant${gameId}';`);

    if (/^\s*public\s+readonly\s+TABLE_CONFIG\b/m.test(nextContent)) {
        return nextContent;
    }

    const tableConfig = `    public readonly TABLE_CONFIG: any = {
        format: GameConstant${gameId}.TABLE_FORMAT,
        cellSize: new Vec2(GameConstant${gameId}.SYMBOL_WIDTH, GameConstant${gameId}.SYMBOL_HEIGHT),
        positions: [],
    };`;
    const paylineTypeMatch = nextContent.match(/^\s*public\s+readonly\s+PAYLINE_TYPE\b.*$/m);
    if (paylineTypeMatch && paylineTypeMatch.index !== undefined) {
        const insertIndex = paylineTypeMatch.index + paylineTypeMatch[0].length;
        return `${nextContent.slice(0, insertIndex)}\n${tableConfig}${nextContent.slice(insertIndex)}`;
    }

    const classMatch = nextContent.match(new RegExp(`export\\s+class\\s+PaylineConfig${gameId}\\s+extends\\s+PaylineConfig\\s*\\{`));
    if (classMatch && classMatch.index !== undefined) {
        const insertIndex = classMatch.index + classMatch[0].length;
        return `${nextContent.slice(0, insertIndex)}\n${tableConfig}${nextContent.slice(insertIndex)}`;
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

function getBoilerplateFiles(sceneFilePath: string, gameId: string) {
    const projectRoot = path.dirname(sceneFilePath);
    return [
        {
            filePath: path.join(projectRoot, "scripts", "Core", `GameConfig${gameId}.ts`),
            content: createGameConfigTemplate(gameId),
            mode: "patchGameConfig" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "Core", `GameDirector${gameId}.ts`),
            content: createGameDirectorTemplate(gameId),
            mode: "overwrite" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "Payline", `PaylineConfig${gameId}.ts`),
            content: createPaylineConfigTemplate(gameId),
            mode: "patchPaylineConfig" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "Payline", `PaylineSymbolModule${gameId}.ts`),
            content: createPaylineSymbolModuleTemplate(gameId),
            mode: "overwrite" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "Table", `TableModuleConfig${gameId}.ts`),
            content: createTableModuleConfigTemplate(gameId),
            mode: "patchTableModuleConfig" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "Table", `SlotReelModule${gameId}.ts`),
            content: createSlotReelModuleTemplate(gameId),
            mode: "overwrite" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "Table", `SlotSymbolModule${gameId}.ts`),
            content: createSlotSymbolModuleTemplate(gameId),
            mode: "overwrite" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "Table", `SlotTableModule${gameId}.ts`),
            content: createSlotTableModuleTemplate(gameId),
            mode: "overwrite" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "GameMode", `NormalGameDirectorModule${gameId}.ts`),
            content: createNormalGameDirectorModuleTemplate(gameId),
            mode: "overwrite" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "GameMode", `FreeGameDirectorModule${gameId}.ts`),
            content: createFreeGameDirectorModuleTemplate(gameId),
            mode: "overwrite" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "Cutscene", `JackpotWinModule${gameId}.ts`),
            content: createJackpotWinModuleTemplate(gameId),
            mode: "overwrite" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "Cutscene", `WinEffectModule${gameId}.ts`),
            content: createWinEffectModuleTemplate(gameId),
            mode: "overwrite" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "Cutscene", `TotalWinModule${gameId}.ts`),
            content: createTotalWinModuleTemplate(gameId),
            mode: "overwrite" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "Cutscene", `CoinEffect${gameId}.ts`),
            content: createCoinEffectTemplate(gameId),
            mode: "overwrite" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "Cutscene", `ParticleControl${gameId}.ts`),
            content: createParticleControlTemplate(gameId),
            mode: "overwrite" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "Cutscene", `InfoPanel${gameId}.ts`),
            content: createInfoPanelTemplate(gameId),
            mode: "overwrite" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "Gui", `WinAmountModule${gameId}.ts`),
            content: createWinAmountModuleTemplate(gameId),
            mode: "overwrite" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "Gui", `SlotButtonNormal${gameId}.ts`),
            content: createSlotButtonNormalTemplate(gameId),
            mode: "overwrite" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "Gui", `SlotButtonSpine${gameId}.ts`),
            content: createSlotButtonSpineTemplate(gameId),
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
            filePath: path.join(projectRoot, "scripts", "Utils", `DateType${gameId}.ts`),
            content: createDateTypeTemplate(gameId),
            mode: "overwrite" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "Utils", `DataUtils${gameId}.ts`),
            content: createDataUtilsTemplate(gameId),
            mode: "overwrite" as const,
        },
        {
            filePath: path.join(projectRoot, "scripts", "Utils", `GameConstant${gameId}.ts`),
            content: createGameConstantTemplate(gameId),
            mode: "overwrite" as const,
        },
    ];
}

export function registerSceneKitHandler() {
    ipcMain.handle("scene-kit:preview-boilerplate", async (_event, sceneFilePath: string) => {
        const normalizedScenePath = String(sceneFilePath || "").trim();
        const gameId = extractGameIdFromScenePath(normalizedScenePath);

        if (!normalizedScenePath || !normalizedScenePath.endsWith(".scene")) {
            throw new Error("Please choose a .scene file.");
        }

        if (!gameId) {
            throw new Error("Cannot detect gameId from scene file name.");
        }

        return {
            gameId,
            projectRoot: path.dirname(normalizedScenePath),
            files: getBoilerplateFiles(normalizedScenePath, gameId).map((file) => ({
                filePath: file.filePath,
                status: fs.existsSync(file.filePath) ? "exists" : "new",
            })),
        };
    });

    ipcMain.handle("scene-kit:create-boilerplate", async (_event, sceneFilePath: string) => {
        const normalizedScenePath = String(sceneFilePath || "").trim();
        const gameId = extractGameIdFromScenePath(normalizedScenePath);

        if (!normalizedScenePath || !normalizedScenePath.endsWith(".scene")) {
            throw new Error("Please choose a .scene file.");
        }

        if (!fs.existsSync(normalizedScenePath)) {
            throw new Error("Scene file does not exist.");
        }

        if (!gameId) {
            throw new Error("Cannot detect gameId from scene file name.");
        }

        const results: BoilerplateFileResult[] = [];
        for (const file of getBoilerplateFiles(normalizedScenePath, gameId)) {
            if (fs.existsSync(file.filePath)) {
                const currentContent = fs.readFileSync(file.filePath, "utf8");
                let nextContent = file.content;
                if (file.mode === "patchGameConfig") {
                    nextContent = updateGameConfigContent(currentContent, gameId);
                } else if (file.mode === "patchPaylineConfig") {
                    nextContent = updatePaylineConfigContent(currentContent, gameId);
                } else if (file.mode === "patchTableModuleConfig") {
                    nextContent = updateTableModuleConfigContent(currentContent, gameId);
                }
                fs.writeFileSync(file.filePath, nextContent, "utf8");
                results.push({ filePath: file.filePath, status: nextContent === currentContent ? "exists" : "updated" });
                continue;
            }

            fs.mkdirSync(path.dirname(file.filePath), { recursive: true });
            fs.writeFileSync(file.filePath, file.content, "utf8");
            results.push({ filePath: file.filePath, status: "created" });
        }

        return {
            gameId,
            projectRoot: path.dirname(normalizedScenePath),
            files: results,
        };
    });
}

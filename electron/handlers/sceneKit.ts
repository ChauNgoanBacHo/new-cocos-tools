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
const { ccclass, property } = _decorator;
const FADE_DURATION = 0.2;
@ccclass('JackpotWinModule${gameId}')
export class JackpotWinModule${gameId} extends JackpotWinModule {
    @property(sp.Skeleton) jackpotWinEffect: sp.Skeleton = null;

    onLoadExtend(): void {
        super.onLoadExtend();
        // this.jackpotWinEffect.setMix(UI_JACKPOT_ANIM.IDLE, UI_JACKPOT_ANIM.DISAPPEAR, 0.2);
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
                this.startUpdateWinAmount();
            })
            .start();
    }

    playAnimationJP(): void {
        this.jackpotWinEffect.node.active = true;
        // this.jackpotWinEffect.setAnimation(0, UI_JACKPOT_ANIM.APPEAR, false);
        // this.jackpotWinEffect.addAnimation(0, UI_JACKPOT_ANIM.IDLE, true);
    }

    playSoundStart(): void {
        this.fadeOutMusic(0.5);
        // this.soundPlayer.playSfx(SOUND_CONFIG.SFX_JP);
        // this.soundPlayer.playSfx(SOUND_CONFIG.SFX_COUNTING, true, 1.5);
    }

    playSoundCountingEnd(): void {
        this.fadeInMusic(0.5);
        // this.soundPlayer.stopSfx(SOUND_CONFIG.SFX_COUNTING);
        // this.soundPlayer.playSfx(SOUND_CONFIG.SFX_COUNTING_END);
    }

    playSoundSkip(): void {
        // this.soundPlayer.stopSfx(SOUND_CONFIG.SFX_JP);
        // this.soundPlayer.stopSfx(SOUND_CONFIG.SFX_COUNTING);

        // this.soundPlayer.playSfx(SOUND_CONFIG.SFX_JP_END);
        // this.soundPlayer.playSfx(SOUND_CONFIG.SFX_COUNTING_END);
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

    finish(): void {
        this._lbWinAmount.string = this.moneyFormatter.formatMoney(this.jackpotValue);
        this.playSoundEnd();
        this._isUpdating = false;
        this.stopParticle();
        tween(this.node)
            .delay(this.delayHideTime)
            .call(() => {
                // this.jackpotWinEffect.setAnimation(0, UI_JACKPOT_ANIM.DISAPPEAR, false);
            })
            .delay(0.5)
            .call(() => {
                this._lbWinAmount.string = '';
                this.exit();
            })
            .start();
    }
}
`;
}

function createWinEffectModuleTemplate(gameId: string) {
    return `import { _decorator, sp, tween, Tween } from 'cc';
import { WinEffectLevelEnum, WinEffectModule } from '../../../../cc-common/cc30-slot-module/SlotModuleExport';
const { ccclass, property } = _decorator;

type BigWinAnimAction = 'APPEAR' | 'IDLE' | 'DISAPPEAR';
const BIG_WIN_ANIM_KEY_BY_TITLE = ['BW', 'MW', 'SMW'];

const WinEffectSoundDuration${gameId} = {
    [WinEffectLevelEnum.BIG]: 4.22,
    [WinEffectLevelEnum.MEGA]: 9.844,
    [WinEffectLevelEnum.SUPER]: 17.344,
}
const MIX_TIME = 0.2;

@ccclass('WinEffectModule${gameId}')
export class WinEffectModule${gameId} extends WinEffectModule {
    @property(sp.Skeleton) bigWinEffect: sp.Skeleton = null;
    private playingLevelSfx: string | null = null;
    private endWinEffectLevel: WinEffectLevelEnum = WinEffectLevelEnum.BIG;

    private bigWinSoundTime: number = 0;
    private _tweenSound: Tween<any> = null;

    onLoadExtend(): void {
        super.onLoadExtend();
        this.setMix();
    }

    getBigWinBackgroundAnimName(titleIndex: number, action: BigWinAnimAction): string {
        // const animKey = \`\${this.getBigWinAnimKey(titleIndex)}_\${action}\` as keyof typeof UI_BIGWIN_BACKGROUND_ANIM;
        // return UI_BIGWIN_BACKGROUND_ANIM[animKey];
    }

    getBigWinAnimKey(titleIndex: number): any {
        return BIG_WIN_ANIM_KEY_BY_TITLE[titleIndex] ?? 'BW';
    }

    getBigWinEffectAnimName(titleIndex: number, action: BigWinAnimAction): string {
        // const animKey = \`\${this.getBigWinAnimKey(titleIndex)}_\${action}\` as keyof typeof UI_BIGWIN_ANIM;
        // return UI_BIGWIN_ANIM[animKey];
    }

    private playBigWinAnimation(titleIndex: number): void {
        // this.bigWinEffect.setAnimation(0, this.getBigWinEffectAnimName(titleIndex, 'APPEAR'), false);
        // this.bigWinEffect.addAnimation(0, this.getBigWinEffectAnimName(titleIndex, 'IDLE'), true);
    }

    updateCurrentTitle(): void {
        const isSkipped = this._speedUp;
        if (isSkipped) {
            super.updateCurrentTitle(); // update title on money
        } else {
            this.updateTitleOnSoundTime(); // update title on SE time config
        }
    }

    private updateTitleOnSoundTime(): void {
        const soundTime = this.bigWinSoundTime;
        if (soundTime >= WinEffectSoundDuration${gameId}[WinEffectLevelEnum.MEGA] &&
            this._currentTitle === WinEffectLevelEnum.MEGA &&
            this.canProcessToLevel(WinEffectLevelEnum.SUPER)) {
            this.changeTitle(WinEffectLevelEnum.SUPER);
        } else if (soundTime >= WinEffectSoundDuration${gameId}[WinEffectLevelEnum.BIG] &&
            this._currentTitle === WinEffectLevelEnum.BIG &&
            this.canProcessToLevel(WinEffectLevelEnum.MEGA)) {
            this.changeTitle(WinEffectLevelEnum.MEGA);
        }
    }

    private canProcessToLevel(level: WinEffectLevelEnum): boolean {
        return this.endWinEffectLevel >= level;
    }

    setMix(): void {
        Object.values(WinEffectLevelEnum)
            .filter(value => typeof value === 'number')
            .forEach((value) => {
                const level = value as WinEffectLevelEnum;
                const disappear = this.getBigWinEffectAnimName(level, 'DISAPPEAR');
                const idle = this.getBigWinEffectAnimName(level, 'IDLE');
                const appear = this.getBigWinEffectAnimName(level, 'APPEAR');
                this.bigWinEffect.setMix(appear, disappear, MIX_TIME);
                this.bigWinEffect.setMix(idle, disappear, MIX_TIME);
            });
    }

    showEffectWin(): void {
        this.endWinEffectLevel = this.getEndWinEffectLevel();
        this.animDuration = WinEffectSoundDuration${gameId}[this.endWinEffectLevel] - this.delayHideTime;
        this.playBigWinAnimation(WinEffectLevelEnum.BIG);

        super.showEffectWin();
    }

    private getEndWinEffectLevel(): WinEffectLevelEnum {
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

    // finish(): void {
    //     this.stopLevelSfx();
    //     this.soundPlayer.playSfx(SOUND_CONFIG.SFX_BIGWIN_END);
    //     this._skippable = false;
    //     this._isUpdating = false;
    //     this.updateCurrentTitle();
    //     this._lbWinAmount.string = this.moneyFormatter.formatMoney(this.content.winAmount)
    //     Tween.stopAllByTarget(this.winAmount);
    //     this.resetSoundTime();
    //     this.stopParticle();
    //     this._tweenFinish = tween(this)
    //         .delay(0.5)
    //         .call(() => {
    //             this.fadeInMusic(0.5);
    //         })
    //         .delay(this.delayHideTime)
    //         .call(() => {
    //             this.soundPlayer.stopSfx(SOUND_CONFIG.SFX_BIGWIN_END);
    //             this.bigWinEffect.setAnimation(0, this.getBigWinEffectAnimName(this._currentTitle, 'DISAPPEAR'), false);
    //         })
    //         .delay(UI_BIGWIN_TIME.BW_DISAPPEAR * 0.25)
    //         .call(() => eno.fadeOut(this.winAmount, 0.2))
    //         .delay(UI_BIGWIN_TIME.BW_DISAPPEAR * 0.75)
    //         .call(() => {
    //             this.exit();
    //         })
    //         .start();
    // }

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

    changeTitle(index: number): void {
        this._currentTitle = index;
        this.coinsEffect.emit('HIDE_COINS_EFFECT', index - 1);
        this.coinsEffect.emit('SHOW_COINS_EFFECT', index);
        this.playBigWinAnimation(index);
        if (!this._speedUp) {
            this.playLevelSfx(index);
        }
    }

    private playLevelSfx(level: number): void {
        const hitSfx = this.geHitSfx(level);
        if (hitSfx) {
            this.soundPlayer.playSfx(hitSfx);
        }
    }

    private geHitSfx(index: number): string | undefined {
        // return SOUND_CONFIG[\`SFX_BIGWIN_HIT_\${index}\`];
    }

    private stopLevelSfx(): void {
        if (this.playLevelSfx == null) {
            return;
        }

        this.soundPlayer.stopSfx(this.playingLevelSfx);
        this.playingLevelSfx = null;
    }

    playSfxFastBigWin(): void {
        // this.soundPlayer && this.soundPlayer.playSfx(SOUND_CONFIG.SFX_TURBO_BIGWIN);
    }

    playSoundStart(): void {
        this.fadeOutMusic(0.5);
        // this.soundPlayer.playSfx(SOUND_CONFIG.SFX_RAIN_COIN, true);
        // const sound = this.soundPlayer.playSfx(SOUND_CONFIG.SFX_BIGWIN);
        // this.resetSoundTime();
        // this._tweenSound = tween(sound)
        //     .to(this.animDuration, {}, {
        //         onUpdate: (_, ratio: number) => {
        //             this.bigWinSoundTime = ratio * this.animDuration;
        //         }
        //     })
        //     .start();
    }

    private resetSoundTime(): void {
        this.bigWinSoundTime = 0;
        this._tweenSound?.stop();
        this._tweenSound = null;
    }

    playSoundCounting(): void {
        // this.soundPlayer.playSfx(SOUND_CONFIG.SFX_COUNTING, true, 1.5);
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
        // this.soundPlayer.stopSfx(SOUND_CONFIG.SFX_RAIN_COIN);
        // this.soundPlayer.stopSfx(SOUND_CONFIG.SFX_BIGWIN);
        // this.soundPlayer.stopSfx(SOUND_CONFIG.SFX_COUNTING);
        // this.soundPlayer.playSfx(SOUND_CONFIG.SFX_COUNTING_END);
    }
}
`;
}

function createTotalWinModuleTemplate(gameId: string) {
    return `import { _decorator, sp, tween } from 'cc';
import { TotalWinModule } from '../../../../cc-common/cc30-slot-module/SlotModuleExport';
const { ccclass, property } = _decorator;
const WIN_LEVEL = [0, 30, 80];

type TotalWinAnimAction = 'APPEAR' | 'IDLE' | 'DISAPPEAR';
const TOTAL_WIN_ANIM_KEY_BY_LEVEL: string[] = ['LV1', 'LV2', 'LV3'];

const TOTAL_WIN_SFX_DURATIONS = [
    4.667,
    7.846,
    10.322
]

const DELAY_START_COUNT = 0.5;
const MAX_TOTAL_WIN_LEVEL = 2;
const DELAY_APPEAR = 0.5;
@ccclass('TotalWinModule${gameId}')
export class TotalWinModule${gameId} extends TotalWinModule {
    @property(sp.Skeleton) totalWinAnim: sp.Skeleton = null;
    level = 0;

    getTotalWinAnimName(levelIndex: number, action: TotalWinAnimAction): string {
        // const animKey = \`\${this.getTotalWinAnimKey(levelIndex)}_\${action}\` as keyof typeof UI_TOTALWIN_ANIM;
        // return UI_TOTALWIN_ANIM[animKey];
    }

    getTotalWinAnimKey(levelIndex: number): any {
        return TOTAL_WIN_ANIM_KEY_BY_LEVEL[levelIndex] ?? 'LV1';
    }

    play(content?: any, callback?: Function): void {
        this.scheduleOnce(()=>{
            super.play(content, callback);
        }, DELAY_APPEAR);
    }

    show(): void {
        super.show();
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
        this.animDuration = sfxDuration - DELAY_START_COUNT;
        this.totalWinAnim.setAnimation(0, this.getTotalWinAnimName(this.level, 'APPEAR'), false);
        this.totalWinAnim.addAnimation(0, this.getTotalWinAnimName(this.level, 'IDLE'), true);
        this.scheduleOnce(() => {
            this.startParticle();
            this.startUpdateWinAmount();
        }, DELAY_START_COUNT);
    }

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

    startUpdateWinAmount(): void {
        if (this.level > 0) {
            super.startUpdateWinAmount();
            // this.soundPlayer.playSfx(SOUND_CONFIG.SFX_COUNTING, true, 1.5);
            return;
        }
        this._lbWinAmount.string = this.moneyFormatter.formatMoney(this._totalWinAmount);
        this.scheduleOnce(() => {
            this._skippable = false;
            this.finish();
        }, this.animDuration);
    }

    startParticle(): void {
        this.coinsEffect.emit('SHOW_COINS_EFFECT', this.level);
    }

    stopParticle(): void {
        this.coinsEffect.emit('HIDE_COINS_EFFECT');
    }

    playSoundStart(): void {
        this.fadeOutMusic(0.5);
        // this.soundPlayer.playSfx(SOUND_CONFIG.SFX_TOTALWIN);
        // this.soundPlayer.playSfx(SOUND_CONFIG.SFX_RAIN_COIN, true);
    }

    playSoundEnd(): void {
        const isPlayFull = this.level == MAX_TOTAL_WIN_LEVEL && !this._hasSkip;
        if (!isPlayFull) {
            // this.soundPlayer.stopSfx(SOUND_CONFIG.SFX_TOTALWIN)
            // this.soundPlayer.playSfx(SOUND_CONFIG.SFX_TOTALWIN_END)
        }

        // this.soundPlayer.stopSfx(SOUND_CONFIG.SFX_RAIN_COIN)
        // this.soundPlayer.stopSfx(SOUND_CONFIG.SFX_COUNTING);
    }

    playSoundSkip(): void {
        if (this.level > 0) {
            this.playSoundCountingEnd();
        }
    }

    playSoundCountingEnd(): void {
        // this.soundPlayer.stopSfx(SOUND_CONFIG.SFX_COUNTING);
        // this.soundPlayer.playSfx(SOUND_CONFIG.SFX_COUNTING_END);
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

    if (additions.length === 0) {
        return nextContent;
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
            filePath: path.join(projectRoot, "scripts", "Payline", `PaylineConfig${gameId}.ts`),
            content: createPaylineConfigTemplate(gameId),
            mode: "patchPaylineConfig" as const,
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
            filePath: path.join(projectRoot, "scripts", "DataConfig", `EventConfig${gameId}.ts`),
            content: createEventConfigTemplate(gameId),
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

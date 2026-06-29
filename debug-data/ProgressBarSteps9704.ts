import { _decorator } from "cc";
import { UI_PROGRES_BAR_FLAG_FG_ANIM, UI_PROGRES_BAR_FLAG_JP_ANIM, UI_PROGRES_BAR_FLAG_MG_ANIM } from "../DataConfig/AnimConfig9704";
import { GameMode } from "../Utils/DataType9704";
import { BlendingTrack9704, blendingTrackManager9704 } from "../Utils/SkeletonUtils9704";
import { ProgressBarFlagSpineController9704 } from "./ProgressBarFlagSpineController9704";

const { ccclass } = _decorator;

const NEARWIN_TRACK_ID = 1;
const BLEND_NEARWIN_DURATION = 0.1;

const MAX_STEPS_ANIM = {
    [GameMode.MAIN]: 17,
    [GameMode.SUPER_FREE]: 17,
    [GameMode.REGULAR_FREE]: 17,
}

@ccclass("ProgressBarSteps9704")
export class ProgressBarSteps9704 extends ProgressBarFlagSpineController9704 {
    private _nearWinBlendingTrack: BlendingTrack9704 | null = null;
    private get nearWinBlendingTrack(): BlendingTrack9704 {
        if (this._nearWinBlendingTrack == null) {
            this._nearWinBlendingTrack = blendingTrackManager9704.createBlendingTrack(this.spine, NEARWIN_TRACK_ID);
        }
        return this._nearWinBlendingTrack;
    }

    updateProgressStep(gameMode: GameMode, progressStep: number): void {
        this.updateGameMode(gameMode);

        if (progressStep === 0) {
            this.spine.node.active = false;
            return;
        }

        const steps = Math.min(progressStep, MAX_STEPS_ANIM[gameMode]);
        const animFlagName = this.getStepAnim(gameMode, steps);
        this.show();
        if (animFlagName) {
            this.spine.setAnimation(0, animFlagName, false);
        } else {
            this.spine.setToSetupPose();
            this.spine.clearTracks();
        }
    }

    playNearWin(gameMode?: GameMode): void {
        if (gameMode != undefined) {
            this.updateGameMode(gameMode);
        }

        this.show();
        this.nearWinBlendingTrack.setAnimation(this.getNearWinAnim(this.currentGameMode), true);
        this.nearWinBlendingTrack.blendIn(BLEND_NEARWIN_DURATION);
    }

    stopNearWin(): void {
        this.nearWinBlendingTrack.blendOut(BLEND_NEARWIN_DURATION);
    }

    private getNearWinAnim(gameMode: GameMode): string {
        switch (gameMode) {
            case GameMode.MAIN:
                return UI_PROGRES_BAR_FLAG_MG_ANIM.MG_NEARWIN;
            case GameMode.SUPER_FREE:
                return UI_PROGRES_BAR_FLAG_FG_ANIM.FG_NEARWIN;
            case GameMode.REGULAR_FREE:
                return UI_PROGRES_BAR_FLAG_JP_ANIM.JP_NEARWIN;
        }
    }

    private getStepAnim(gameMode: GameMode, progressStep: number): string {
        switch (gameMode) {
            case GameMode.MAIN:
                return UI_PROGRES_BAR_FLAG_MG_ANIM[`MG_${progressStep}`];
            case GameMode.SUPER_FREE:
                return UI_PROGRES_BAR_FLAG_FG_ANIM[`FG_${progressStep}`];
            case GameMode.REGULAR_FREE:
                return UI_PROGRES_BAR_FLAG_JP_ANIM[`JP_${progressStep}`];
        }
    }

    reset(): void {
        super.reset();
        this.spine.node.active = false;
    }
}
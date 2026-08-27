import { _decorator } from 'cc';
import { GameConfig } from '../../../../cc-common/cc30-slot-module/SlotModuleExport';
import { PAY_SYSTEM_TYPE_ENUM } from '../../../../cc-common/cc30-slot-module/SlotModuleExport';
const { ccclass } = _decorator;
@ccclass('GameConfig9876')
export class GameConfig9876 extends GameConfig {
    public GAME_ID = "9876";
	public JP_PREFIX_EVENT = "9876_";
    public PAY_SYSTEM = PAY_SYSTEM_TYPE_ENUM.ALLWAYS;
    public TOTAL_BET_CREDIT:number = 25;
}
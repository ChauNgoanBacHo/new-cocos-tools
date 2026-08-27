import { _decorator } from 'cc';
import { PaylineConfig, PAYLINE_TYPE } from '../../../../cc-common/cc30-slot-module/SlotModuleExport';
const { ccclass } = _decorator;
@ccclass('PaylineConfig9876')
export class PaylineConfig9876 extends PaylineConfig {
    public readonly PAYLINE_TYPE: PAYLINE_TYPE = PAYLINE_TYPE.AllWays;
}
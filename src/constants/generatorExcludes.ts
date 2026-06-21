export const DEFAULT_SOUND_EXCLUDE_LIST = [
    "BTN_BET_DECREASE",
    "BTN_BET_INCREASE",
    "BTN_DEMOPLAY",
    "BTN_GENERAL",
    "BTN_SPIN",
    "BTN_TURBO_OFF",
    "BTN_TURBO_ON",
    "SFX_NEARWIN",
    "SFX_REEL_STOP",
];

export const DEFAULT_ANIM_EXCLUDE_LIST = [
    "SYMBOL_2_ANIM",
    "SYMBOL_3_ANIM",
    "SYMBOL_4_ANIM",
    "SYMBOL_5_ANIM",
    "SYMBOL_6_ANIM",
    "SYMBOL_7_ANIM",
    "SYMBOL_8_ANIM",
    "SYMBOL_9_ANIM",
    "SYMBOL_J_ANIM",
    "SYMBOL_Q_ANIM",
    "VFX_PAYLINE_ANIM",
];

export function normalizeExcludeList(values: string[]) {
    return [...new Set(
        values
            .map((value) => String(value || "").trim().toUpperCase())
            .filter(Boolean),
    )];
}

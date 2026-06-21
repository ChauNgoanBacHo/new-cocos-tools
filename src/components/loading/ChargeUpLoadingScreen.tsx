import type { LoadingScreenProps } from "./types";
import punchImage from "../../assets/punch.png";

export function ChargeUpLoadingScreen({ brandLogo }: LoadingScreenProps) {
    return (
        <div className="splash-container relative flex h-screen w-screen items-center justify-center overflow-hidden bg-[#07080d] text-white [animation:charge-screen-shake_0.42s_1.14s_cubic-bezier(0.22,1,0.36,1)_both]">
            <div className="pointer-events-none absolute inset-0 opacity-0 [background:radial-gradient(circle_at_center,transparent_45%,rgba(0,0,0,0.22)_78%,rgba(0,0,0,0.5)_100%)] [animation:charge-vignette_0.75s_1.08s_ease-out_forwards]" />
            <div className="pointer-events-none absolute inset-0 z-[4] opacity-0 [background:radial-gradient(circle_at_center,rgba(255,52,102,0.34)_0%,rgba(255,23,79,0.16)_26%,rgba(255,23,79,0.08)_48%,transparent_72%)] [animation:charge-impact-flash_0.28s_1.14s_cubic-bezier(0.22,1,0.36,1)_forwards]" />
            <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center overflow-hidden">
                <img
                    src={punchImage}
                    alt="Charge up punch"
                    className="punch-background h-full w-full object-cover opacity-0 scale-[0.74] [animation:charge-punch-reveal_0.86s_0.98s_cubic-bezier(0.175,0.885,0.32,1.275)_forwards]"
                />
            </div>

            <div className="relative z-10 flex h-full w-full items-center justify-center px-6">
                <div className="relative flex min-h-[520px] w-full max-w-4xl items-center justify-center">
                    <div className="absolute -inset-x-8 -inset-y-10 rounded-[42px] bg-black/92" />
                    <div className="pointer-events-none absolute left-1/2 top-1/2 z-[6] h-[460px] w-[460px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#ffd6c4]/40 opacity-0 shadow-[0_0_18px_rgba(255,122,89,0.18)] [animation:charge-ring-burst_1.35s_0.12s_linear_forwards]" />
                    <div className="relative z-10 flex min-h-[320px] flex-col items-center justify-center gap-5">
                        <div className="absolute inset-x-0 top-1/2 h-12 -translate-y-1/2 bg-gradient-to-r from-transparent via-white/40 to-transparent blur-md opacity-0 animate-[charge-scan_1.8s_1.25s_ease-out_forwards]" />
                        <div className="relative w-[390px] max-w-full overflow-visible">
                            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                                <div className="absolute inset-y-[-12%] left-[-22%] z-20 w-16 skew-x-[-18deg] bg-gradient-to-r from-transparent via-white/85 to-transparent opacity-0 blur-sm [animation:charge-logo-sweep_0.95s_1.9s_ease-out_forwards]" />
                            </div>
                            <div className="pointer-events-none absolute inset-[-10%] z-0 rounded-full opacity-0 blur-2xl [background:radial-gradient(circle,rgba(255,23,79,0.45)_0%,rgba(255,23,79,0.16)_42%,transparent_72%)] [animation:charge-logo-flare_0.6s_1.16s_ease-out_forwards]" />
                            <img
                                src={brandLogo}
                                alt="One Punch DevKit"
                                className="relative z-10 block w-full drop-shadow-[0_0_28px_rgba(255,23,79,0.32)] [animation:charge-logo-impact_0.72s_1.12s_cubic-bezier(0.34,1.56,0.64,1)_forwards]"
                            />
                        </div>
                        <div className="flex flex-col items-center gap-5 [animation:charge-ui-fade-out_0.55s_1.1s_cubic-bezier(0.4,0,0.2,1)_forwards]">
                            <div className="h-2.5 w-[360px] overflow-hidden rounded-full border border-white/10 bg-white/5 shadow-inner shadow-black/50">
                                <div className="h-full w-full origin-left scale-x-0 rounded-full bg-[linear-gradient(90deg,#ff174f_0%,#ff4d79_58%,#fbbf24_100%)] shadow-[0_0_24px_rgba(255,23,79,0.48)] animate-[charge-bar_1.55s_0.2s_cubic-bezier(0.22,1,0.36,1)_forwards]" />
                            </div>
                            <div className="text-center">
                                <div className="text-[11px] font-mono uppercase tracking-[0.42em] text-[#f7d287]">
                                    Charging Hero Systems
                                </div>
                                <div className="mt-2 text-[10px] font-mono uppercase tracking-[0.26em] text-white/40">
                                    Circuit ignition • Core voltage • Devkit release
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

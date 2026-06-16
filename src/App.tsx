import { useState, useEffect } from "react";
import "preline/preline";

// Import các file tính năng riêng biệt vừa tạo
import CheatConsole from "./components/CheatConsole";
import CreateAnimConfigs from "./components/CreateAnimConfigs";
import CreateSoundConfigs from "./components/CreateSoundConfigs";
import CheckConfigs from "./components/CheckConfigs";
import CheckAssets from "./components/CheckAssets";
import CodeHealth from "./components/CodeHealth";
import SpinePreview from "./components/SpinePreview";
import { DriveSyncMenu } from "./components/DriveSyncMenu";
import { useStoredState } from "./hooks/useStoredState";

type TabType = "cheat" | "anim" | "sound" | "check-config" | "check-assets" | "code-health" | "spine-preview" | "drive-sync";

// Elegant line icons (Heroicons outline, stroke-based) per tab. Defined once and
// rendered data-driven in the sidebar.
const TABS: { id: TabType; label: string; icon: React.ReactNode }[] = [
    {
        id: "cheat",
        label: "Cheat Matrix",
        icon: <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />,
    },
    {
        id: "drive-sync",
        label: "Drive Sync",
        icon: <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />,
    },
    {
        id: "anim",
        label: "Create Anim",
        icon: <><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15.91 11.672a.375.375 0 010 .656l-5.603 3.113A.375.375 0 019.75 15.113V8.887c0-.286.307-.466.557-.327l5.603 3.112z" /></>,
    },
    {
        id: "sound",
        label: "Create Sound",
        icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />,
    },
    {
        id: "check-config",
        label: "Check Configs",
        icon: <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />,
    },
    {
        id: "check-assets",
        label: "Check Assets",
        icon: <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />,
    },
    {
        id: "spine-preview",
        label: "Spine Preview",
        icon: <><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></>,
    },
    {
        id: "code-health",
        label: "Code Health",
        icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />,
    },
];

function App() {
    const [activeTab, setActiveTab] = useState<TabType>("cheat");
    const [isLoading, setIsLoading] = useState(true);
    const [appVersion, setAppVersion] = useState("v0.1.0");
    const [isDark, setIsDark] = useStoredState<boolean>("theme", true);
    const [, setCodeHealthSourcePath] = useStoredState<string>("code-health-source-path", "");
    const [, setCodeHealthAutoRunKey] = useStoredState<string>("code-health-auto-run-key", "");

    const handleOpenCodeHealth = (sourcePath: string) => {
        setCodeHealthSourcePath(sourcePath);
        setCodeHealthAutoRunKey(`${sourcePath}::${Date.now()}`);
        setActiveTab("code-health");
    };

    useEffect(() => {
        const timer = setTimeout(() => setIsLoading(false), 1600);
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (isDark) {
            document.documentElement.classList.add("dark");
        } else {
            document.documentElement.classList.remove("dark");
        }
    }, [isDark]);

    useEffect(() => {
        window.electronAPI.getAppVersion()
            .then((version) => setAppVersion(`v${version}`))
            .catch(() => setAppVersion("v0.1.0"));
    }, []);

    useEffect(() => {
        // Re-initialize Preline UI components on tab change
        setTimeout(() => {
            // @ts-ignore
            window.HSStaticMethods?.autoInit();
        }, 50);
    }, [activeTab]);

    // Hàm render chỉ còn nhiệm vụ gọi các Component con tương ứng
    const renderContent = () => {
        switch (activeTab) {
            case "cheat":
                return <CheatConsole />;
            case "anim":
                return <CreateAnimConfigs onOpenCodeHealth={handleOpenCodeHealth} />;
            case "sound":
                return <CreateSoundConfigs />;
            case "check-config":
                return <CheckConfigs />;
            case "check-assets":
                return <CheckAssets />;
            case "code-health":
                return <CodeHealth />;
            case "spine-preview":
                return <SpinePreview />;
            case "drive-sync":
                return <DriveSyncMenu />;
            default:
                return null;
        }
    };

    if (isLoading) {
        const reelSymbols = [
            "7", "BAR", "⚡", "💎", "🍒", "WILD", "🍀", "⭐", "🔥", "🎲", "🔔", "🍋",
            "BONUS", "x2", "🍉", "👑", "💰", "JACK", "7", "BAR", "⚡", "💎", "🍒", "WILD",
        ];
        return (
            <div className="flex h-screen w-screen items-center justify-center bg-zinc-950 overflow-hidden">
                <div className="flex flex-col items-center gap-5">
                    <div className="relative">
                        <div className="absolute -inset-8 rounded-full bg-amber-500/10 blur-2xl" />
                        <div className="relative w-64 rounded-3xl border border-amber-500/40 bg-zinc-900 shadow-2xl shadow-amber-950/40 p-4">
                            <div className="flex justify-center gap-2 mb-3">
                                {Array.from({ length: 9 }).map((_, index) => (
                                    <span key={index} className="slot-light h-2 w-2 rounded-full bg-amber-300 shadow-sm shadow-amber-300/80" />
                                ))}
                            </div>

                            <div className="rounded-2xl border border-zinc-700 bg-zinc-950 p-3 shadow-inner">
                                <div className="grid grid-cols-3 gap-2 overflow-hidden">
                                    {[0, 1, 2].map((reel) => (
                                        <div key={reel} className="h-24 overflow-hidden rounded-xl border border-zinc-700 bg-gradient-to-b from-zinc-800 via-zinc-950 to-zinc-800">
                                            <div className="slot-reel-strip flex flex-col">
                                                {reelSymbols
                                                    .slice(reel * 5)
                                                    .concat(reelSymbols.slice(0, reel * 5))
                                                    .map((symbol, index) => (
                                                    <div
                                                        key={`${reel}-${index}`}
                                                        className="h-12 flex items-center justify-center text-base font-black font-mono text-amber-300">
                                                        {symbol}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="absolute -right-7 top-12 flex flex-col items-center">
                                <div className="h-16 w-2 rounded-full bg-zinc-700 border border-zinc-600" />
                                <div className="slot-handle -mt-1 h-8 w-8 rounded-full bg-red-600 border-4 border-red-400 shadow-lg shadow-red-950/60" />
                            </div>

                            <div className="mt-3 rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-center">
                                <span className="text-[10px] font-mono font-bold uppercase tracking-[0.28em] text-amber-300">
                                    Loading Tools
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="text-center">
                        <p className="text-amber-400/90 text-xs font-mono uppercase tracking-widest">Spinning up</p>
                        <p className="text-zinc-600 text-[10px] font-mono mt-1 tracking-wide">Preparing cheat console...</p>
                    </div>
                </div>
            </div>
        );
    }

    const sidebarClassName = isDark
        ? "w-64 bg-zinc-950 border-r border-zinc-800/50 p-5 flex flex-col justify-between shadow-lg z-10"
        : "w-64 bg-white border-r border-slate-200 p-5 flex flex-col justify-between shadow-[0_18px_45px_rgba(148,163,184,0.18)] z-10";

    const sidebarTitleClassName = isDark
        ? "text-md font-bold uppercase tracking-widest text-amber-400/90 font-mono"
        : "text-md font-bold uppercase tracking-widest text-amber-600 font-mono";

    const sidebarSubtitleClassName = isDark
        ? "text-zinc-500 text-xs mt-1 tracking-wide"
        : "text-slate-500 text-xs mt-1 tracking-wide";

    const navItemClassName = (active: boolean) =>
        active
            ? isDark
                ? "bg-amber-950/30 text-amber-300 border-amber-800/40 shadow-sm font-semibold"
                : "bg-amber-100 text-amber-900 border-amber-300 shadow-sm shadow-amber-100 font-semibold"
            : isDark
                ? "text-zinc-400 border-transparent hover:bg-zinc-800/50 hover:text-zinc-100"
                : "text-slate-600 border-transparent hover:bg-white hover:border-slate-200 hover:text-slate-900 hover:shadow-sm";

    const navIconClassName = (active: boolean) =>
        active
            ? isDark
                ? "text-amber-400"
                : "text-amber-600"
            : isDark
                ? "text-zinc-500 group-hover:text-zinc-300"
                : "text-slate-400 group-hover:text-slate-700";

    const sidebarFooterClassName = isDark
        ? "pt-4 border-t border-zinc-800/50 flex flex-col items-center gap-2"
        : "pt-4 border-t border-slate-200 flex flex-col items-center gap-2";

    const themeToggleButtonClassName = isDark
        ? "p-2 rounded-lg bg-zinc-800/50 hover:bg-zinc-700/50 text-zinc-400 hover:text-zinc-200 transition-all cursor-pointer"
        : "p-2 rounded-lg bg-white hover:bg-amber-50 border border-slate-200 text-slate-500 hover:text-amber-700 transition-all cursor-pointer shadow-sm";

    const footerNoteClassName = isDark
        ? "text-[10px] text-zinc-600 font-mono tracking-wider"
        : "text-[10px] text-slate-400 font-mono tracking-wider";

    return (
        <div className="flex h-screen w-screen font-sans overflow-hidden bg-slate-100 dark:bg-zinc-950 text-slate-800 dark:text-zinc-200">
            {/* MENU BÊN TRÁI */}
            <aside className={sidebarClassName}>
                <div>
                    <div className="mb-8 px-2">
                        <h3 className={sidebarTitleClassName}>
                            Slot Tools
                        </h3>
                        <p className={sidebarSubtitleClassName}>
                            Tool management
                        </p>
                    </div>

                    <nav className="flex flex-col gap-2">
                        {TABS.map((tab) => {
                            const active = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`group w-full text-left py-3 px-3.5 rounded-lg font-medium text-sm transition-all duration-200 cursor-pointer flex items-center justify-between border ${navItemClassName(active)}`}>
                                    <span className="flex items-center gap-3">
                                        <svg
                                            className={`w-[18px] h-[18px] shrink-0 transition-colors ${navIconClassName(active)}`}
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                            strokeWidth={1.5}>
                                            {tab.icon}
                                        </svg>
                                        <span>{tab.label}</span>
                                    </span>
                                    {active && (
                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                                    )}
                                </button>
                            );
                        })}
                    </nav>
                </div>

                <div className={sidebarFooterClassName}>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setIsDark(!isDark)}
                            className={themeToggleButtonClassName}>
                            {isDark ? (
                                <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                                </svg>
                            ) : (
                                <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                                </svg>
                            )}
                        </button>
                    </div>
                    <span className={footerNoteClassName}>Prompted by TiTi</span>
                    <span className={footerNoteClassName}>{appVersion}</span>
                </div>
            </aside>

            {/* NỘI DUNG HIỂN THỊ CHÍNH BÊN PHẢI */}
            <main className="flex-1 p-8 overflow-y-auto bg-slate-100 dark:bg-zinc-900">
                <div className="max-w-4xl h-full flex flex-col justify-between">
                    <div>

                        {/* <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm min-h-[400px]"> */}
                            {renderContent()}
                        {/* </div> */}
                    </div>

                    <footer className="text-center text-xs text-zinc-400 dark:text-zinc-600 font-mono mt-8 border-t border-zinc-200 dark:border-zinc-800 pt-4 tracking-wide">
                        Tool Cho Người Lười
                    </footer>
                </div>
            </main>
        </div>
    );
}

export default App;

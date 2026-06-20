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
import { SettingsPanel } from "./components/SettingsPanel";

type TabType = "cheat" | "anim" | "sound" | "check-config" | "check-assets" | "code-health" | "spine-preview" | "drive-sync" | "settings";

// Elegant line icons (Heroicons outline, stroke-based) per tab. Defined once and
// rendered data-driven in the sidebar.
const TABS: { id: TabType; label: string; icon: React.ReactNode }[] = [
    {
        id: "cheat",
        label: "Cheat Matrix",
        icon: (
            <>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l1.9 4.6L19 9.1l-3.7 3.2.9 4.9-4.2-2.4-4.2 2.4.9-4.9L5 9.1l5.1-1.5L12 3z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8.5v7" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.8 12h6.4" />
            </>
        ),
    },
    {
        id: "drive-sync",
        label: "Drive Sync",
        icon: (
            <>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 16.5v1.25A2.25 2.25 0 008.25 20h7.5A2.25 2.25 0 0018 17.75V16.5" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 10.5L12 6.5l4 4" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v8" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 13h3m9 0h3" />
            </>
        ),
    },
    {
        id: "anim",
        label: "Create Anim",
        icon: (
            <>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.5 6.5h11v11h-11z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 4.5v4M14.5 15.5v4M19.5 9.5h-4M8.5 14.5h-4" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 9.5l4 2.5-4 2.5v-5z" />
            </>
        ),
    },
    {
        id: "sound",
        label: "Create Sound",
        icon: (
            <>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 10.5h3.5l3-2.5v8l-3-2.5H8z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 9.5c1.5 1 1.5 4 0 5" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.8 7.8c2.6 2.2 2.6 6.2 0 8.4" />
            </>
        ),
    },
    {
        id: "check-config",
        label: "Check Configs",
        icon: (
            <>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 6.5h8M8 10.5h5M8 14.5h4" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.5 4.5h11a1 1 0 011 1v13a1 1 0 01-1 1h-11a1 1 0 01-1-1v-13a1 1 0 011-1z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.5 14.5l1.5 1.5 3-3" />
            </>
        ),
    },
    {
        id: "check-assets",
        label: "Check Assets",
        icon: (
            <>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3.8l6.5 3.7v8.9L12 20.2l-6.5-3.8V7.5L12 3.8z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8.2l2.2 1.3v2.8L12 13.6l-2.2-1.3V9.5L12 8.2z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 13.8v6.1" />
            </>
        ),
    },
    {
        id: "spine-preview",
        label: "Spine Preview",
        icon: (
            <>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5c4.6 0 8.2 3 9.5 7.5-1.3 4.5-4.9 7.5-9.5 7.5S3.8 16.5 2.5 12C3.8 7.5 7.4 4.5 12 4.5z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 9.2v5.6M12 8v8M14 9.2v5.6" />
            </>
        ),
    },
    {
        id: "code-health",
        label: "Code Health",
        icon: (
            <>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 5h7l4 4v10a1 1 0 01-1 1H7a1 1 0 01-1-1V6a1 1 0 011-1z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 5v4h4" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 15l1.8 1.8L15 12.5" />
            </>
        ),
    },
];

function App() {
    const [activeTab, setActiveTab] = useState<TabType>("cheat");
    const [isLoading, setIsLoading] = useState(true);
    const [appVersion, setAppVersion] = useState("v0.1.0");
    const [isDark, setIsDark] = useStoredState<boolean>("theme", true);
    const [menuOrder, setMenuOrder] = useStoredState<TabType[]>("app-menu-order", TABS.map((tab) => tab.id));
    const [hiddenMenuIds, setHiddenMenuIds] = useStoredState<TabType[]>("app-hidden-menu-ids", []);
    const [, setCodeHealthSourcePath] = useStoredState<string>("code-health-source-path", "");
    const [, setCodeHealthAutoRunKey] = useStoredState<string>("code-health-auto-run-key", "");

    const resolvedMenuItems = menuOrder
        .map((menuId) => TABS.find((tab) => tab.id === menuId))
        .filter((tab): tab is (typeof TABS)[number] => Boolean(tab));

    const missingMenuItems = TABS.filter((tab) => !resolvedMenuItems.some((resolvedTab) => resolvedTab.id === tab.id));
    const orderedMenuItems = [...resolvedMenuItems, ...missingMenuItems];
    const visibleMenuItems = orderedMenuItems.filter((tab) => !hiddenMenuIds.includes(tab.id));

    const handleOpenCodeHealth = (sourcePath: string) => {
        setCodeHealthSourcePath(sourcePath);
        setCodeHealthAutoRunKey(`${sourcePath}::${Date.now()}`);
        setActiveTab("code-health");
    };

    const handleToggleMenuVisibility = (menuId: TabType) => {
        setHiddenMenuIds((prev) =>
            prev.includes(menuId)
                ? prev.filter((id) => id !== menuId)
                : [...prev, menuId],
        );
    };

    const handleMoveMenuItem = (draggedId: TabType, targetId: TabType) => {
        setMenuOrder((prev) => {
            const normalizedOrder = [...prev];
            if (!normalizedOrder.includes(draggedId)) {
                normalizedOrder.push(draggedId);
            }
            if (!normalizedOrder.includes(targetId)) {
                normalizedOrder.push(targetId);
            }

            const draggedIndex = normalizedOrder.indexOf(draggedId);
            const targetIndex = normalizedOrder.indexOf(targetId);
            if (draggedIndex < 0 || targetIndex < 0 || draggedIndex === targetIndex) {
                return normalizedOrder;
            }

            const nextOrder = [...normalizedOrder];
            const [draggedItem] = nextOrder.splice(draggedIndex, 1);
            nextOrder.splice(targetIndex, 0, draggedItem);
            return nextOrder;
        });
    };

    const handleResetMenuOrder = () => {
        setMenuOrder(TABS.map((tab) => tab.id));
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
                return <CreateSoundConfigs onOpenCodeHealth={handleOpenCodeHealth} />;
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
            case "settings":
                return (
                    <SettingsPanel
                        isDark={isDark}
                        menuItems={orderedMenuItems.map((item) => ({ id: item.id, label: item.label }))}
                        hiddenMenuIds={hiddenMenuIds}
                        onToggleMenuVisibility={(menuId) => handleToggleMenuVisibility(menuId as TabType)}
                        onMoveMenuItem={(draggedId, targetId) => handleMoveMenuItem(draggedId as TabType, targetId as TabType)}
                        onResetMenuOrder={handleResetMenuOrder}
                    />
                );
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
        ? "w-64 bg-[rgb(25,27,33)] border-r border-[#2b3040] p-5 flex flex-col justify-between shadow-lg z-10"
        : "w-64 bg-[rgb(25,27,33)] border-r border-[#2b3040] p-5 flex flex-col justify-between shadow-[0_18px_45px_rgba(15,23,42,0.2)] z-10";

    const sidebarTitleClassName = isDark
        ? "opm-title text-[1.12rem] leading-tight text-white"
        : "opm-title text-[1.12rem] leading-tight text-white";

    const sidebarSubtitleClassName = isDark
        ? "opm-kicker text-[#7b8295] text-[10px] mt-1"
        : "opm-kicker text-[#7b8295] text-[10px] mt-1";

    const navItemClassName = (active: boolean) =>
        active
            ? isDark
                ? "bg-[#7d6df7] text-white border-[#7d6df7] shadow-[0_10px_24px_rgba(125,109,247,0.28)] font-semibold"
                : "bg-[#7d6df7] text-white border-[#7d6df7] shadow-[0_10px_24px_rgba(125,109,247,0.24)] font-semibold"
            : isDark
                ? "text-[#8e95a7] border-transparent hover:bg-[#2b3040] hover:text-white"
                : "text-[#8e95a7] border-transparent hover:bg-[#2b3040] hover:text-white";

    const navIconClassName = (active: boolean) =>
        active
            ? isDark
                ? "text-white"
                : "text-white"
            : isDark
                ? "text-[#71788d] group-hover:text-white"
                : "text-[#71788d] group-hover:text-white";

    const sidebarFooterClassName = isDark
        ? "pt-4 border-t border-[#2b3040] flex flex-col items-center gap-2"
        : "pt-4 border-t border-[#2b3040] flex flex-col items-center gap-2";

    const themeToggleButtonClassName = isDark
        ? "p-2 rounded-lg bg-[#2b3040] hover:bg-[#353b4c] text-[#8e95a7] hover:text-white transition-all cursor-pointer"
        : "p-2 rounded-lg bg-[#2b3040] hover:bg-[#353b4c] text-[#8e95a7] hover:text-white transition-all cursor-pointer";

    const footerNoteClassName = isDark
        ? "text-[10px] text-[#6d7488] font-mono tracking-wider"
        : "text-[10px] text-[#6d7488] font-mono tracking-wider";

    return (
        <div className="flex h-screen w-screen font-sans overflow-hidden bg-[rgb(25,27,33)] text-slate-800 dark:text-zinc-200">
            {/* MENU BÊN TRÁI */}
            <aside className={sidebarClassName}>
                <div>
                    <div className="mb-8 px-2">
                        <h3 className={sidebarTitleClassName}>
                            One Punch Tools
                        </h3>
                        <p className={sidebarSubtitleClassName}>
                            Hero utility console
                        </p>
                    </div>

                    <nav className="flex flex-col gap-2">
                        {visibleMenuItems.map((tab) => {
                            const active = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`group w-full text-left py-3 px-3.5 rounded-lg font-medium text-sm transition-all duration-200 cursor-pointer flex items-center justify-between border ${navItemClassName(active)}`}>
                                    <span className="flex items-center gap-3">
                                        <svg
                                            className={`w-5 h-5 shrink-0 transition-colors ${navIconClassName(active)}`}
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                            strokeWidth={1.75}>
                                            {tab.icon}
                                        </svg>
                                        <span className="opm-nav-label">{tab.label}</span>
                                    </span>
                                </button>
                            );
                        })}
                    </nav>
                </div>

                <div className={sidebarFooterClassName}>
                    <div className="flex items-center gap-2">
                        <div className="relative group">
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
                            <span className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[10px] font-medium text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100 dark:bg-zinc-700">
                                Toggle theme
                            </span>
                        </div>
                        <div className="relative group">
                            <button
                                type="button"
                                onClick={() => setActiveTab("settings")}
                                className={themeToggleButtonClassName}>
                                <svg className={`w-4 h-4 ${isDark ? "text-zinc-300" : "text-slate-500"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                                    />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                            </button>
                            <span className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[10px] font-medium text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100 dark:bg-zinc-700">
                                Open settings
                            </span>
                        </div>
                    </div>
                    <span className={footerNoteClassName}>Prompted by TiTi</span>
                    <span className={footerNoteClassName}>{appVersion}</span>
                </div>
            </aside>

            {/* NỘI DUNG HIỂN THỊ CHÍNH BÊN PHẢI */}
            <main className="flex-1 p-8 overflow-y-auto bg-[rgb(25,27,33)] [font-family:var(--sans)]">
                <div className="w-full h-full flex flex-col justify-between">
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

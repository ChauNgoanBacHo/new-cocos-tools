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
import { ChargeUpLoadingScreen } from "./components/loading/ChargeUpLoadingScreen";
import brandLogo from "./assets/logo.png";

type TabType = "cheat" | "anim" | "sound" | "check-config" | "check-assets" | "code-health" | "spine-preview" | "drive-sync" | "settings";
type MenuGroupId = "simulation" | "generators" | "analysis" | "tools";

// Elegant line icons (Heroicons outline, stroke-based) per tab. Defined once and
// rendered data-driven in the sidebar.
const TABS: { id: TabType; label: string; icon: React.ReactNode }[] = [
    {
        id: "cheat",
        label: "Matrix Hub",
        icon: (
            <>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.5 7.5l6.5-3 6.5 3-6.5 3-6.5-3z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.5 12l6.5-3 6.5 3-6.5 3-6.5-3z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.5 16.5l6.5-3 6.5 3-6.5 3-6.5-3z" />
            </>
        ),
    },
    {
        id: "drive-sync",
        label: "Drive Synchronizer",
        icon: (
            <>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 8.5a4.5 4.5 0 018.6-1.8A3.75 3.75 0 0117.25 14H7.75a3.25 3.25 0 01-.75-6.5z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17l2.5 2.5L14 17" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 14l-2.5-2.5L10 14" />
            </>
        ),
    },
    {
        id: "anim",
        label: "Anim Generator",
        icon: (
            <>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 5.5h12a1 1 0 011 1v11a1 1 0 01-1 1H6a1 1 0 01-1-1v-11a1 1 0 011-1z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 8.5l6 3.5-6 3.5v-7z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 3.75v3M16 17.25v3M20.25 8H17.5M6.5 16H3.75" />
            </>
        ),
    },
    {
        id: "sound",
        label: "Sound Generator",
        icon: (
            <>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 10.25h3.25L15 7.5v9l-3.75-2.75H8z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 9.5c1.25 1 1.25 4 0 5" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.75 7.75c2.25 2 2.25 6.5 0 8.5" />
            </>
        ),
    },
    {
        id: "check-config",
        label: "Usage Check",
        icon: (
            <>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 5.5h10a1 1 0 011 1v10a1 1 0 01-1 1H7a1 1 0 01-1-1v-10a1 1 0 011-1z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 9h6M9 12h3.5" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.75 15.25l1.5 1.5 2.75-3" />
            </>
        ),
    },
    {
        id: "check-assets",
        label: "Asset Cleanup",
        icon: (
            <>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7.5h8" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.25 5.5h5.5l.5 2H8.75l.5-2z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.5 7.5l.75 10a1 1 0 001 .9h2.5a1 1 0 001-.9l.75-10" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 10.5v4.5M13.5 10.5v4.5" />
            </>
        ),
    },
    {
        id: "spine-preview",
        label: "Spine Viewer",
        icon: (
            <>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 5c4.75 0 8.3 3.1 9.5 7-1.2 3.9-4.75 7-9.5 7S3.7 15.9 2.5 12C3.7 8.1 7.25 5 12 5z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9.25a2.75 2.75 0 110 5.5 2.75 2.75 0 010-5.5z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v1M12 15v1" />
            </>
        ),
    },
    {
        id: "code-health",
        label: "Code Health",
        icon: (
            <>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.5 6.5h11a1 1 0 011 1v8.5a1 1 0 01-1 1h-11a1 1 0 01-1-1V7.5a1 1 0 011-1z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.5 14l2.25-2.5 2 1.75 2.75-3.25" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 18.5h6" />
            </>
        ),
    },
];

const MENU_GROUPS: { id: MenuGroupId; label: string; itemIds: TabType[] }[] = [
    {
        id: "simulation",
        label: "Data",
        itemIds: ["cheat"],
    },
    {
        id: "generators",
        label: "Generators",
        itemIds: ["anim", "sound"],
    },
    {
        id: "analysis",
        label: "Analysis",
        itemIds: ["check-config", "check-assets", "code-health"],
    },
    {
        id: "tools",
        label: "Tools",
        itemIds: ["spine-preview", "drive-sync"],
    },
];

function App() {
    const [activeTab, setActiveTab] = useState<TabType>("cheat");
    const [menuPulseTab, setMenuPulseTab] = useState<TabType>("cheat");
    const [menuPulseTick, setMenuPulseTick] = useState(0);
    const [cheatViewResetKey, setCheatViewResetKey] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [appVersion, setAppVersion] = useState("v0.1.0");
    const [isDark, setIsDark] = useStoredState<boolean>("theme", true);
    const [menuGroupOrder, setMenuGroupOrder] = useStoredState<MenuGroupId[]>("app-menu-group-order", MENU_GROUPS.map((group) => group.id));
    const [hiddenMenuGroupIds, setHiddenMenuGroupIds] = useStoredState<MenuGroupId[]>("app-hidden-menu-group-ids", []);
    const [, setCodeHealthSourcePath] = useStoredState<string>("code-health-source-path", "");
    const [, setCodeHealthAutoRunKey] = useStoredState<string>("code-health-auto-run-key", "");

    const tabMap = new Map(TABS.map((tab) => [tab.id, tab] as const));

    const resolvedMenuGroups = menuGroupOrder
        .map((groupId) => MENU_GROUPS.find((group) => group.id === groupId))
        .filter((group): group is (typeof MENU_GROUPS)[number] => Boolean(group));

    const missingMenuGroups = MENU_GROUPS.filter((group) => !resolvedMenuGroups.some((resolvedGroup) => resolvedGroup.id === group.id));
    const orderedMenuGroups = [...resolvedMenuGroups, ...missingMenuGroups];
    const visibleMenuGroups = orderedMenuGroups
        .filter((group) => !hiddenMenuGroupIds.includes(group.id))
        .map((group) => ({
            ...group,
            items: group.itemIds
                .map((itemId) => tabMap.get(itemId))
                .filter((item): item is (typeof TABS)[number] => Boolean(item)),
        }))
        .filter((group) => group.items.length > 0);

    const handleOpenCodeHealth = (sourcePath: string) => {
        setCodeHealthSourcePath(sourcePath);
        setCodeHealthAutoRunKey(`${sourcePath}::${Date.now()}`);
        setActiveTab("code-health");
    };

    const handleToggleMenuGroupVisibility = (groupId: MenuGroupId) => {
        setHiddenMenuGroupIds((prev) =>
            prev.includes(groupId)
                ? prev.filter((id) => id !== groupId)
                : [...prev, groupId],
        );
    };

    const handleMoveMenuGroup = (draggedId: MenuGroupId, targetId: MenuGroupId) => {
        setMenuGroupOrder((prev) => {
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

    const handleResetMenuGroupOrder = () => {
        setMenuGroupOrder(MENU_GROUPS.map((group) => group.id));
    };

    const triggerMenuSelection = (tabId: TabType) => {
        setActiveTab(tabId);
        setMenuPulseTab(tabId);
        setMenuPulseTick((prev) => prev + 1);

        if (tabId === "cheat") {
            setCheatViewResetKey((prev) => prev + 1);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => setIsLoading(false), 2000);
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
                return <CheatConsole resetSignal={cheatViewResetKey} />;
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
                        menuGroups={orderedMenuGroups.map((group) => ({
                            id: group.id,
                            label: group.label,
                            items: group.itemIds
                                .map((itemId) => tabMap.get(itemId))
                                .filter((item): item is (typeof TABS)[number] => Boolean(item))
                                .map((item) => ({ id: item.id, label: item.label })),
                        }))}
                        hiddenMenuGroupIds={hiddenMenuGroupIds}
                        onToggleMenuGroupVisibility={(groupId) => handleToggleMenuGroupVisibility(groupId as MenuGroupId)}
                        onMoveMenuGroup={(draggedId, targetId) => handleMoveMenuGroup(draggedId as MenuGroupId, targetId as MenuGroupId)}
                        onResetMenuOrder={handleResetMenuGroupOrder}
                    />
                );
            default:
                return null;
        }
    };

    if (isLoading) {
        return <ChargeUpLoadingScreen brandLogo={brandLogo} />;
    }

    const sidebarClassName = isDark
        ? "w-64 bg-[rgb(25,27,33)] border-r border-[#2b3040] p-5 flex flex-col justify-between shadow-lg z-10"
        : "w-64 bg-[#f7f7fb] border-r border-[#dde3f0] p-5 flex flex-col justify-between shadow-[0_18px_45px_rgba(148,163,184,0.18)] z-10";

    const navItemClassName = (active: boolean) =>
        active
            ? isDark
                ? "bg-[#7d6df7] text-white border-[#7d6df7] shadow-[0_10px_24px_rgba(125,109,247,0.28)] font-semibold"
                : "bg-[#7d6df7] text-white border-[#7d6df7] shadow-[0_10px_24px_rgba(125,109,247,0.18)] font-semibold"
            : isDark
                ? "text-[#8e95a7] border-transparent hover:bg-[#2b3040] hover:text-white"
                : "text-[#5f6b82] border-transparent hover:bg-[#eceffd] hover:text-[#2a3447]";

    const navIconClassName = (active: boolean) =>
        active
            ? isDark
                ? "text-white"
                : "text-white"
            : isDark
                ? "text-[#71788d] group-hover:text-white"
                : "text-[#8b95aa] group-hover:text-[#49566d]";

    const sidebarFooterClassName = isDark
        ? "pt-4 border-t border-[#2b3040] flex flex-col items-center gap-2"
        : "pt-4 border-t border-[#dde3f0] flex flex-col items-center gap-2";

    const themeToggleButtonClassName = isDark
        ? "p-2 rounded-lg bg-[#2b3040] hover:bg-[#353b4c] text-[#8e95a7] hover:text-white transition-all cursor-pointer"
        : "p-2 rounded-lg bg-[#eef2fb] hover:bg-[#e3e9f8] text-[#61708a] hover:text-[#253047] transition-all cursor-pointer";

    const footerNoteClassName = isDark
        ? "text-[10px] text-[#6d7488] font-mono tracking-wider"
        : "text-[10px] text-[#8791a5] font-mono tracking-wider";

    const appShellClassName = isDark
        ? "flex h-screen w-screen font-sans overflow-hidden bg-[rgb(25,27,33)] text-slate-800 dark:text-zinc-200"
        : "flex h-screen w-screen font-sans overflow-hidden bg-[#eef3fb] text-slate-800";

    const mainClassName = isDark
        ? "flex-1 p-8 overflow-y-auto bg-[rgb(25,27,33)] [font-family:var(--sans)]"
        : "flex-1 p-8 overflow-y-auto bg-[#eef3fb] [font-family:var(--sans)]";

    const groupLabelClassName = isDark
        ? "px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#6d7488]"
        : "px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#97a0b3]";

    const tooltipClassName = isDark
        ? "pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[10px] font-medium text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100 dark:bg-zinc-700"
        : "pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#1f2736] px-2 py-1 text-[10px] font-medium text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100";

    const mainFooterClassName = isDark
        ? "text-center text-[10px] text-[#6d7488] font-mono mt-8 border-t border-zinc-200 dark:border-zinc-800 pt-4 tracking-wider"
        : "text-center text-[10px] text-[#8791a5] font-mono mt-8 border-t border-[#dbe3f2] pt-4 tracking-wider";

    return (
        <div className={appShellClassName}>
            {/* MENU BÊN TRÁI */}
            <aside className={sidebarClassName}>
                <div>
                    <div className="mb-8 px-2">
                        <img
                            src={brandLogo}
                            alt="One Punch DevKit"
                            className="block h-auto w-full max-w-[244px]"
                        />
                    </div>

                    <nav className="flex flex-col gap-5">
                        {visibleMenuGroups.map((group) => (
                            <div key={group.id} className="space-y-2">
                                <div className={groupLabelClassName}>
                                    {group.label}
                                </div>
                                <div className="flex flex-col gap-2">
                                    {group.items.map((tab) => {
                                        const active = activeTab === tab.id;
                                        return (
                                            <button
                                                key={`${tab.id}-${active && menuPulseTab === tab.id ? menuPulseTick : "idle"}`}
                                                onClick={() => triggerMenuSelection(tab.id)}
                                                className={`group w-full text-left py-3 px-3.5 rounded-lg font-medium text-sm transition-all duration-200 cursor-pointer flex items-center justify-between border ${navItemClassName(active)} ${active && menuPulseTab === tab.id ? "opm-nav-item-active" : ""}`}>
                                                <span className="flex items-center gap-3">
                                                    <svg
                                                        className={`w-5 h-5 shrink-0 transition-colors ${navIconClassName(active)} ${active && menuPulseTab === tab.id ? "opm-nav-icon-active" : ""}`}
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
                                </div>
                            </div>
                        ))}
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
                                    <svg className="w-4 h-4 text-[#9b8cff]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                                    </svg>
                                ) : (
                                    <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                                    </svg>
                                )}
                            </button>
                            <span className={tooltipClassName}>
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
                            <span className={tooltipClassName}>
                                Open settings
                            </span>
                        </div>
                    </div>
                    <span className={footerNoteClassName}>Prompted by TiTi</span>
                    <span className={footerNoteClassName}>{appVersion}</span>
                </div>
            </aside>

            {/* NỘI DUNG HIỂN THỊ CHÍNH BÊN PHẢI */}
            <main className={mainClassName}>
                <div className="w-full h-full flex flex-col justify-between">
                    <div>

                        {/* <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm min-h-[400px]"> */}
                            {renderContent()}
                        {/* </div> */}
                    </div>

                    <footer className={mainFooterClassName}>
                        Tool Cho Người Lười
                    </footer>
                </div>
            </main>
        </div>
    );
}

export default App;

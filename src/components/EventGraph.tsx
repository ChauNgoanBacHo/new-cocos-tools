import { useEffect, useMemo, useRef, useState } from "react";
import {
    Background,
    Controls,
    MarkerType,
    ReactFlow,
    type Edge,
    type Node,
    type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import ELK from "elkjs/lib/elk.bundled.js";
import { useStoredState } from "../hooks/useStoredState";

type EventUsageKind = "emit" | "on";

interface EventUsage {
    id: string;
    kind: EventUsageKind;
    eventValue: string;
    eventExpression: string;
    filePath: string;
    relativePath: string;
    componentName: string;
    functionName: string;
    line: number;
    column: number;
    caller: string;
}

interface EventGraphResult {
    sourcePath: string;
    scannedFiles: number;
    totalEvents: number;
    totalEmits: number;
    totalListeners: number;
    usages: EventUsage[];
}

interface EventGroup {
    eventValue: string;
    emits: EventUsage[];
    listeners: EventUsage[];
}

interface ComponentEventSummary {
    componentName: string;
    relativePath: string;
    emits: EventUsage[];
    listeners: EventUsage[];
    events: EventGroup[];
}

const elk = new ELK();

function groupEvents(usages: EventUsage[]) {
    const groups = new Map<string, EventGroup>();

    usages.forEach((usage) => {
        const group = groups.get(usage.eventValue) || {
            eventValue: usage.eventValue,
            emits: [],
            listeners: [],
        };

        if (usage.kind === "emit") {
            group.emits.push(usage);
        } else {
            group.listeners.push(usage);
        }

        groups.set(usage.eventValue, group);
    });

    return Array.from(groups.values()).sort((left, right) => {
        const leftScore = (left.emits.length ? 1 : 0) + (left.listeners.length ? 1 : 0);
        const rightScore = (right.emits.length ? 1 : 0) + (right.listeners.length ? 1 : 0);
        return rightScore - leftScore || left.eventValue.localeCompare(right.eventValue);
    });
}

function groupComponents(usages: EventUsage[]) {
    const componentMap = new Map<string, ComponentEventSummary>();
    const eventMapByComponent = new Map<string, Map<string, EventGroup>>();

    usages.forEach((usage) => {
        const componentKey = usage.relativePath;
        const summary = componentMap.get(componentKey) || {
            componentName: usage.componentName,
            relativePath: usage.relativePath,
            emits: [],
            listeners: [],
            events: [],
        };
        const eventMap = eventMapByComponent.get(componentKey) || new Map<string, EventGroup>();
        const eventGroup = eventMap.get(usage.eventValue) || {
            eventValue: usage.eventValue,
            emits: [],
            listeners: [],
        };

        if (usage.kind === "emit") {
            summary.emits.push(usage);
            eventGroup.emits.push(usage);
        } else {
            summary.listeners.push(usage);
            eventGroup.listeners.push(usage);
        }

        eventMap.set(usage.eventValue, eventGroup);
        eventMapByComponent.set(componentKey, eventMap);
        componentMap.set(componentKey, summary);
    });

    return Array.from(componentMap.values())
        .map((summary) => ({
            ...summary,
            events: Array.from(eventMapByComponent.get(summary.relativePath)?.values() || [])
                .sort((left, right) => {
                    const leftCount = left.emits.length + left.listeners.length;
                    const rightCount = right.emits.length + right.listeners.length;
                    return rightCount - leftCount || left.eventValue.localeCompare(right.eventValue);
                }),
        }))
        .sort((left, right) => {
            const leftCount = left.emits.length + left.listeners.length;
            const rightCount = right.emits.length + right.listeners.length;
            return rightCount - leftCount || left.relativePath.localeCompare(right.relativePath);
        });
}

function makeOverviewComponentNode(summary: ComponentEventSummary): Node {
    const total = summary.emits.length + summary.listeners.length;
    return {
        id: `component:${summary.relativePath}`,
        position: { x: 0, y: 0 },
        draggable: false,
        connectable: false,
        data: {
            label: (
                <div className="w-[240px] text-left">
                    <div className="truncate text-sm font-black text-white">{summary.componentName}</div>
                    <div className="mt-1 truncate font-mono text-[10px] text-cyan-50/85">{summary.relativePath}</div>
                    <div className="mt-2 flex gap-2 text-[10px] font-bold uppercase tracking-wider">
                        <span className="rounded-md bg-white/20 px-2 py-0.5 text-white ring-1 ring-white/20">{summary.emits.length} emit</span>
                        <span className="rounded-md bg-white/20 px-2 py-0.5 text-white ring-1 ring-white/20">{summary.listeners.length} on</span>
                        <span className="rounded-md bg-black/18 px-2 py-0.5 text-white ring-1 ring-white/15">{total}</span>
                    </div>
                </div>
            ),
            type: "component",
        },
        style: {
            borderRadius: 8,
            border: "1px solid rgba(34, 211, 238, 0.9)",
            background: "linear-gradient(135deg, #06b6d4 0%, #2563eb 52%, #7c3aed 100%)",
            boxShadow: "0 0 0 1px rgba(255, 255, 255, 0.18), 0 16px 38px rgba(6, 182, 212, 0.34), 0 0 28px rgba(124, 58, 237, 0.42)",
            padding: 12,
            width: 280,
            height: 104,
        },
    };
}

function makeOverviewEventNode(group: EventGroup): Node {
    const isMatched = group.emits.length && group.listeners.length;
    const isEmitOnly = group.emits.length && !group.listeners.length;
    const border = isMatched
        ? "1px solid rgba(16, 185, 129, 0.42)"
        : isEmitOnly
            ? "1px solid rgba(245, 158, 11, 0.42)"
            : "1px solid rgba(239, 68, 68, 0.42)";
    const background = isMatched
        ? "var(--event-graph-match-bg, #ecfdf5)"
        : isEmitOnly
            ? "var(--event-graph-emit-only-bg, #fffbeb)"
            : "var(--event-graph-on-only-bg, #fef2f2)";

    return {
        id: `event:${group.eventValue}`,
        position: { x: 0, y: 0 },
        draggable: false,
        connectable: false,
        data: {
            label: (
                <div className="w-[250px] text-left">
                    <div className="truncate font-mono text-xs font-bold text-slate-900 dark:text-zinc-100">{group.eventValue}</div>
                    <div className="mt-2 flex gap-2 text-[10px] font-bold uppercase tracking-wider">
                        <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">{group.emits.length} emit</span>
                        <span className="rounded-md bg-sky-100 px-2 py-0.5 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">{group.listeners.length} on</span>
                    </div>
                </div>
            ),
            type: "event",
            eventValue: group.eventValue,
        },
        style: {
            borderRadius: 8,
            border,
            background,
            padding: 12,
            width: 290,
            height: 82,
        },
    };
}

async function layoutGraph(nodes: Node[], edges: Edge[]) {
    const graph = await elk.layout({
        id: "root",
        layoutOptions: {
            "elk.algorithm": "layered",
            "elk.direction": "RIGHT",
            "elk.spacing.nodeNode": "46",
            "elk.layered.spacing.nodeNodeBetweenLayers": "84",
            "elk.edgeRouting": "ORTHOGONAL",
        },
        children: nodes.map((node) => ({
            id: node.id,
            width: Number(node.style?.width) || 270,
            height: Number(node.style?.height) || 94,
        })),
        edges: edges.map((edge) => ({
            id: edge.id,
            sources: [edge.source],
            targets: [edge.target],
        })),
    });

    const positions = new Map((graph.children || []).map((child) => [child.id, { x: child.x || 0, y: child.y || 0 }]));
    return nodes.map((node) => ({
        ...node,
        position: positions.get(node.id) || node.position,
    }));
}

function buildOverviewGraph(eventGroups: EventGroup[], componentSummaries: ComponentEventSummary[]) {
    const nodes = new Map<string, Node>();
    const edges = new Map<string, Edge & { data?: { count: number } }>();
    const summaryByPath = new Map(componentSummaries.map((summary) => [summary.relativePath, summary]));
    const groupByValue = new Map(eventGroups.map((group) => [group.eventValue, group]));

    componentSummaries.forEach((summary) => {
        nodes.set(`component:${summary.relativePath}`, makeOverviewComponentNode(summary));
    });

    eventGroups.forEach((group) => {
        nodes.set(`event:${group.eventValue}`, makeOverviewEventNode(group));
    });

    const addEdge = (source: string, target: string, color: string) => {
        const id = `${source}->${target}`;
        const existing = edges.get(id);
        const count = (existing?.data?.count || 0) + 1;
        edges.set(id, {
            id,
            source,
            target,
            label: count > 1 ? String(count) : undefined,
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { stroke: color, strokeWidth: count > 1 ? 2.5 : 1.8 },
            labelStyle: { fill: color, fontWeight: 800, fontSize: 10 },
            data: { count },
        });
    };

    eventGroups.forEach((group) => {
        group.emits.forEach((usage) => {
            if (!summaryByPath.has(usage.relativePath) || !groupByValue.has(group.eventValue)) return;
            addEdge(`component:${usage.relativePath}`, `event:${group.eventValue}`, "#10b981");
        });
        group.listeners.forEach((usage) => {
            if (!summaryByPath.has(usage.relativePath) || !groupByValue.has(group.eventValue)) return;
            addEdge(`event:${group.eventValue}`, `component:${usage.relativePath}`, "#0ea5e9");
        });
    });

    return {
        nodes: Array.from(nodes.values()),
        edges: Array.from(edges.values()),
    };
}

export default function EventGraph({ isStandalone = false }: { isStandalone?: boolean }) {
    const [sourcePath, setSourcePath] = useStoredState<string>("event-graph-source-path", "");
    const [result, setResult] = useState<EventGraphResult | null>(null);
    const [overviewNodes, setOverviewNodes] = useState<Node[]>([]);
    const [overviewEdges, setOverviewEdges] = useState<Edge[]>([]);
    const [selectedOverviewComponentId, setSelectedOverviewComponentId] = useState("");
    const [status, setStatus] = useState<{ type: "success" | "error" | null; message: string }>({ type: null, message: "" });
    const [isLoading, setIsLoading] = useState(false);
    const overviewFlowRef = useRef<ReactFlowInstance<Node, Edge> | null>(null);

    const eventGroups = useMemo(() => groupEvents(result?.usages || []), [result]);
    const componentSummaries = useMemo(() => groupComponents(result?.usages || []), [result]);
    const highlightedOverviewEdgeIds = useMemo(() => {
        if (!selectedOverviewComponentId) return new Set<string>();
        const selectedEmitEventIds = new Set(
            overviewEdges
                .filter((edge) => edge.source === selectedOverviewComponentId && edge.target.startsWith("event:"))
                .map((edge) => edge.target),
        );
        return new Set(
            overviewEdges
                .filter((edge) => (
                    edge.source === selectedOverviewComponentId
                    || edge.target === selectedOverviewComponentId
                    || (selectedEmitEventIds.has(edge.source) && edge.target.startsWith("component:"))
                ))
                .map((edge) => edge.id),
        );
    }, [overviewEdges, selectedOverviewComponentId]);
    const highlightedOverviewNodeIds = useMemo(() => {
        if (!selectedOverviewComponentId) return new Set<string>();
        const ids = new Set<string>([selectedOverviewComponentId]);
        const selectedEmitEventIds = new Set<string>();
        overviewEdges.forEach((edge) => {
            if (edge.source === selectedOverviewComponentId || edge.target === selectedOverviewComponentId) {
                ids.add(edge.source);
                ids.add(edge.target);
            }
            if (edge.source === selectedOverviewComponentId && edge.target.startsWith("event:")) {
                selectedEmitEventIds.add(edge.target);
            }
        });
        overviewEdges.forEach((edge) => {
            if (selectedEmitEventIds.has(edge.source) && edge.target.startsWith("component:")) {
                ids.add(edge.source);
                ids.add(edge.target);
            }
        });
        return ids;
    }, [overviewEdges, selectedOverviewComponentId]);
    const displayOverviewNodes = useMemo(() => {
        if (!selectedOverviewComponentId) return overviewNodes;
        return overviewNodes.map((node) => {
            const isHighlighted = highlightedOverviewNodeIds.has(node.id);
            const isSelected = node.id === selectedOverviewComponentId;
            return {
                ...node,
                style: {
                    ...node.style,
                    opacity: isHighlighted ? 1 : 0.18,
                    filter: isHighlighted ? "none" : "grayscale(0.35)",
                    boxShadow: isSelected
                        ? "0 0 0 3px rgba(255, 255, 255, 0.9), 0 0 0 6px rgba(34, 211, 238, 0.72), 0 20px 48px rgba(34, 211, 238, 0.5)"
                        : node.style?.boxShadow,
                },
            };
        });
    }, [highlightedOverviewNodeIds, overviewNodes, selectedOverviewComponentId]);
    const displayOverviewEdges = useMemo(() => {
        if (!selectedOverviewComponentId) return overviewEdges;
        return overviewEdges.map((edge) => {
            const isHighlighted = highlightedOverviewEdgeIds.has(edge.id);
            return {
                ...edge,
                animated: isHighlighted,
                style: {
                    ...edge.style,
                    opacity: isHighlighted ? 1 : 0.08,
                    strokeWidth: isHighlighted ? 4 : edge.style?.strokeWidth,
                },
                labelStyle: {
                    ...edge.labelStyle,
                    opacity: isHighlighted ? 1 : 0.12,
                },
            };
        });
    }, [highlightedOverviewEdgeIds, overviewEdges, selectedOverviewComponentId]);

    useEffect(() => {
        const graph = buildOverviewGraph(eventGroups, componentSummaries);
        setOverviewEdges(graph.edges);
        void layoutGraph(graph.nodes, graph.edges).then(setOverviewNodes);
    }, [eventGroups, componentSummaries]);

    const handleSelectSource = async () => {
        const folder = await window.electronAPI.selectFolder();
        if (!folder) return;
        setSourcePath(folder);
        setResult(null);
        setSelectedOverviewComponentId("");
    };

    const handleOpenFullscreen = async () => {
        try {
            await window.electronAPI.eventGraph.openFullscreen();
        } catch (error: any) {
            setStatus({ type: "error", message: error.message || "Failed to open Event Map window." });
        }
    };

    const handleExitFullscreen = async () => {
        try {
            await window.electronAPI.eventGraph.closeFullscreen();
        } catch (error: any) {
            setStatus({ type: "error", message: error.message || "Failed to close Event Map window." });
        }
    };

    const handleScan = async () => {
        if (!sourcePath.trim()) {
            setStatus({ type: "error", message: "Please choose a source folder first." });
            return;
        }

        setIsLoading(true);
        setStatus({ type: null, message: "" });
        setSelectedOverviewComponentId("");
        try {
            const nextResult = await window.electronAPI.eventGraph.scan(sourcePath);
            setResult(nextResult);
            setStatus({
                type: "success",
                message: `Scanned ${nextResult.scannedFiles} file(s), found ${nextResult.totalEmits} emit(s), ${nextResult.totalListeners} listener(s).`,
            });
        } catch (error: any) {
            setResult(null);
            setStatus({ type: "error", message: error.message || "Failed to scan source events." });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (!isStandalone || result || isLoading || !sourcePath.trim()) return;
        void handleScan();
    }, [isStandalone, sourcePath]);

    const activeComponentCount = componentSummaries.length;
    const emitComponentCount = componentSummaries.filter((summary) => summary.emits.length > 0).length;
    const listenerComponentCount = componentSummaries.filter((summary) => summary.listeners.length > 0).length;

    const handleFocusComponent = (summary: ComponentEventSummary) => {
        const nodeId = `component:${summary.relativePath}`;
        const targetNode = overviewNodes.find((node) => node.id === nodeId);
        setSelectedOverviewComponentId(nodeId);

        if (!targetNode || !overviewFlowRef.current) return;
        const width = Number(targetNode.style?.width) || 280;
        const height = Number(targetNode.style?.height) || 104;
        overviewFlowRef.current.setCenter(
            targetNode.position.x + width / 2,
            targetNode.position.y + height / 2,
            { zoom: 0.9, duration: 520 },
        );
    };

    return (
        <div className={isStandalone ? "min-h-screen bg-[#eef3fb] p-6 dark:bg-[rgb(25,27,33)]" : "sm:col-span-2"}>
            <style>{`:root { --event-graph-node-bg: #ffffff; --event-graph-match-bg: #ecfdf5; --event-graph-emit-only-bg: #fffbeb; --event-graph-on-only-bg: #fef2f2; --event-graph-control-bg: #ffffff; --event-graph-control-border: rgba(203, 213, 225, 0.95); --event-graph-control-color: #475569; --event-graph-control-hover-bg: #eef2ff; --event-graph-control-hover-color: #6251dd; } .dark { --event-graph-node-bg: #1b2029; --event-graph-match-bg: rgba(16, 185, 129, 0.1); --event-graph-emit-only-bg: rgba(245, 158, 11, 0.1); --event-graph-on-only-bg: rgba(239, 68, 68, 0.1); --event-graph-control-bg: rgba(35, 41, 56, 0.94); --event-graph-control-border: rgba(255, 255, 255, 0.08); --event-graph-control-color: #d8d4ff; --event-graph-control-hover-bg: rgba(125, 109, 247, 0.28); --event-graph-control-hover-color: #ffffff; } .event-map-flow .react-flow__attribution { display: none; } .event-map-flow .react-flow__edges { z-index: 0; } .event-map-flow .react-flow__edge-labels { z-index: 1; } .event-map-flow .react-flow__nodes { z-index: 2; } .event-map-flow .react-flow__node { z-index: 3 !important; } .event-map-flow .react-flow__controls { overflow: hidden; border: 1px solid var(--event-graph-control-border); border-radius: 12px; background: var(--event-graph-control-bg); box-shadow: 0 16px 34px rgba(10, 12, 18, 0.22); } .event-map-flow .react-flow__controls-button { width: 34px; height: 34px; border: 0; border-bottom: 1px solid var(--event-graph-control-border); background: var(--event-graph-control-bg); color: var(--event-graph-control-color); transition: background 160ms ease, color 160ms ease; } .event-map-flow .react-flow__controls-button:last-child { border-bottom: 0; } .event-map-flow .react-flow__controls-button:hover { background: var(--event-graph-control-hover-bg); color: var(--event-graph-control-hover-color); } .event-map-flow .react-flow__controls-button svg { fill: currentColor; }`}</style>
            <div className="mb-6 flex flex-col gap-4 border-b border-slate-200 pb-4 dark:border-zinc-700 md:flex-row md:items-center md:justify-between">
                <div className="text-left">
                    <h2 className="mb-1 text-2xl font-bold text-[#9b8cff]">Event Map</h2>
                    <p className="text-xs text-slate-500 dark:text-zinc-400">
                        Overview files that emit or listen to each event
                    </p>
                </div>
                {isStandalone ? (
                    <button
                        type="button"
                        onClick={() => void handleExitFullscreen()}
                        className="inline-flex h-11 cursor-pointer items-center justify-center rounded-xl border border-red-200 bg-red-50 px-5 text-sm font-bold text-red-700 transition-all hover:bg-red-100 dark:border-red-500/25 dark:bg-red-500/15 dark:text-red-300 dark:hover:bg-red-500/20">
                        Exit Big View
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={() => void handleOpenFullscreen()}
                        className="inline-flex h-11 cursor-pointer items-center justify-center rounded-xl border border-[#7d6df7]/30 bg-[#7d6df7]/10 px-5 text-sm font-bold text-[#6657df] transition-all hover:bg-[#7d6df7]/15 dark:border-[#9b8cff]/30 dark:bg-[#7d6df7]/20 dark:text-[#c9c1ff]">
                        Open Big View
                    </button>
                )}
            </div>

            <div className="space-y-5">
                {status.type && (
                    <div className={`rounded-xl border p-4 text-sm font-medium ${
                        status.type === "success"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                            : "border-red-200 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
                    }`}>
                        {status.message}
                    </div>
                )}

                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_18px_36px_rgba(148,163,184,0.16)] dark:border-white/5 dark:bg-[#2b3140] dark:shadow-[0_18px_36px_rgba(10,12,18,0.28)]">
                    <div className="grid grid-cols-1 gap-3">
                        <div className="flex min-w-0 gap-2">
                            <input
                                type="text"
                                value={sourcePath}
                                readOnly
                                placeholder="Choose source folder"
                                className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-800 placeholder-slate-400 focus:outline-none dark:border-white/5 dark:bg-[#1b2029] dark:text-zinc-100 dark:placeholder-zinc-500"
                            />
                            <button
                                type="button"
                                onClick={handleSelectSource}
                                disabled={isLoading}
                                className="inline-flex h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-600 transition-all hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/5 dark:bg-[#1b2029] dark:text-zinc-300 dark:hover:bg-[#232938]">
                                Choose Source
                            </button>
                            <button
                                type="button"
                                onClick={() => void handleScan()}
                                disabled={isLoading || !sourcePath.trim()}
                                className="h-11 shrink-0 cursor-pointer rounded-xl bg-[#7d6df7] px-6 text-sm font-bold text-white shadow-sm shadow-[#7d6df7]/25 transition-all hover:bg-[#9387ff] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:disabled:bg-zinc-700 dark:disabled:text-zinc-500">
                                Scan Events
                            </button>
                        </div>
                    </div>
                </section>

                {result && (
                    <>
                    <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_18px_36px_rgba(148,163,184,0.16)] dark:border-white/5 dark:bg-[#2b3140] dark:shadow-[0_18px_36px_rgba(10,12,18,0.28)]">
                        <div className="flex flex-col gap-3 text-left md:flex-row md:items-end md:justify-between">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900 dark:text-zinc-100">Source Overview</h3>
                                <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">
                                    {activeComponentCount} active component file(s), {emitComponentCount} emit source(s), {listenerComponentCount} listener source(s)
                                </p>
                            </div>
                            <div className="grid grid-cols-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-left dark:border-white/5 dark:bg-[#1b2029]">
                                {[
                                    ["Events", result.totalEvents],
                                    ["Emit", result.totalEmits],
                                    ["On", result.totalListeners],
                                    ["Files", result.scannedFiles],
                                ].map(([label, value]) => (
                                    <div key={label} className="border-r border-slate-200 px-4 py-2 last:border-r-0 dark:border-white/5">
                                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">{label}</div>
                                        <div className="mt-0.5 font-mono text-lg font-bold text-slate-900 dark:text-zinc-100">{value}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-5">
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-left dark:border-white/5 dark:bg-[#1b2029]">
                                <div className="mb-3 flex items-center justify-between gap-3">
                                    <h4 className="text-sm font-bold text-slate-900 dark:text-zinc-100">Components</h4>
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                                        {componentSummaries.length} total
                                    </span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {componentSummaries.map((summary) => {
                                        const nodeId = `component:${summary.relativePath}`;
                                        const isSelected = selectedOverviewComponentId === nodeId;
                                        return (
                                            <button
                                                key={summary.relativePath}
                                                type="button"
                                                title={summary.relativePath}
                                                onClick={() => handleFocusComponent(summary)}
                                                className={`inline-flex min-h-9 max-w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-bold transition-all ${
                                                    isSelected
                                                        ? "border-cyan-300 bg-gradient-to-r from-cyan-500 via-blue-600 to-violet-600 text-white shadow-md shadow-cyan-500/25"
                                                        : "border-slate-200 bg-white text-slate-700 hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700 dark:border-white/5 dark:bg-[#232938] dark:text-zinc-200 dark:hover:border-cyan-400/40 dark:hover:bg-cyan-500/10 dark:hover:text-cyan-200"
                                                }`}>
                                                <span className="truncate">{summary.componentName}</span>
                                                <span className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] ${
                                                    isSelected
                                                        ? "bg-white/20 text-white"
                                                        : "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-zinc-400"
                                                }`}>
                                                    {summary.emits.length + summary.listeners.length}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-white/5 dark:bg-[#1b2029]">
                                <div className="flex flex-col gap-3 border-b border-slate-200 p-4 text-left dark:border-white/5 md:flex-row md:items-center md:justify-between">
                                    <div>
                                        <h4 className="text-sm font-bold text-slate-900 dark:text-zinc-100">Overall Event Flow</h4>
                                        <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
                                            Green lines: component emits event. Blue lines: component listens to event. Click a component to highlight its links.
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap gap-2 text-[11px] font-bold uppercase tracking-wider">
                                        <span className="rounded-md border border-cyan-300/80 bg-gradient-to-r from-cyan-500 via-blue-600 to-violet-600 px-2.5 py-1 text-white shadow-sm shadow-cyan-500/25">Component</span>
                                        <span className="rounded-md bg-emerald-100 px-2.5 py-1 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">Matched Event</span>
                                        <span className="rounded-md bg-amber-100 px-2.5 py-1 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">Emit Only</span>
                                        <span className="rounded-md bg-red-100 px-2.5 py-1 text-red-700 dark:bg-red-500/15 dark:text-red-300">On Only</span>
                                        {selectedOverviewComponentId && (
                                            <button
                                                type="button"
                                                onClick={() => setSelectedOverviewComponentId("")}
                                                className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-slate-600 transition-colors hover:bg-slate-100 dark:border-white/5 dark:bg-[#232938] dark:text-zinc-300 dark:hover:bg-[#2b3140]">
                                                Clear Highlight
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className={isStandalone ? "h-[760px]" : "h-[560px]"}>
                                    <ReactFlow
                                        className="event-map-flow"
                                        nodes={displayOverviewNodes}
                                        edges={displayOverviewEdges}
                                        fitView
                                        minZoom={0.08}
                                        maxZoom={1.4}
                                        nodesDraggable={false}
                                        nodesConnectable={false}
                                        elementsSelectable={false}
                                        panOnDrag
                                        zoomOnScroll
                                        onInit={(instance) => {
                                            overviewFlowRef.current = instance;
                                        }}
                                        onPaneClick={() => setSelectedOverviewComponentId("")}
                                        onNodeClick={(_event, node) => {
                                            if (node.data?.type === "component") {
                                                const summary = componentSummaries.find((item) => `component:${item.relativePath}` === node.id);
                                                if (summary) handleFocusComponent(summary);
                                            }
                                        }}>
                                        <Background />
                                        <Controls showInteractive={false} />
                                    </ReactFlow>
                                </div>
                            </div>
                        </div>
                    </section>
                    </>
                )}
            </div>
        </div>
    );
}

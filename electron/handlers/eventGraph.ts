import { ipcMain } from "electron";
import fs from "fs";
import path from "path";
import ts from "typescript";

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

interface EventGraphNode {
    id: string;
    label: string;
    filePath: string;
    relativePath: string;
    emitCount: number;
    listenerCount: number;
}

interface EventGraphEdge {
    id: string;
    source: string;
    target: string;
    eventValue: string;
    emitCount: number;
    listenerCount: number;
}

interface EventGraphResult {
    sourcePath: string;
    scannedFiles: number;
    totalEvents: number;
    totalEmits: number;
    totalListeners: number;
    nodes: EventGraphNode[];
    edges: EventGraphEdge[];
    usages: EventUsage[];
    orphanEmits: EventUsage[];
    orphanListeners: EventUsage[];
}

const IGNORED_DIRS = new Set(["node_modules", ".git", "library", "temp", "build", "dist", "release"]);

function walkTsFiles(rootDir: string) {
    const results: string[] = [];
    const stack = [rootDir];

    while (stack.length) {
        const currentDir = stack.pop()!;
        if (!fs.existsSync(currentDir)) continue;

        for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                if (!IGNORED_DIRS.has(entry.name)) stack.push(fullPath);
                continue;
            }

            if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
                results.push(fullPath);
            }
        }
    }

    return results.sort();
}

function normalizePath(filePath: string) {
    return filePath.replace(/\\/g, "/");
}

function getRelativePath(rootDir: string, filePath: string) {
    return normalizePath(path.relative(rootDir, filePath));
}

function getLineAndColumn(sourceFile: ts.SourceFile, node: ts.Node) {
    const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    return {
        line: position.line + 1,
        column: position.character + 1,
    };
}

function getNameText(name: ts.PropertyName | ts.BindingName | undefined) {
    if (!name) return "";
    if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
        return name.text;
    }
    return "";
}

function getFunctionName(node: ts.Node | undefined) {
    if (!node) return "top-level";
    if (ts.isMethodDeclaration(node) || ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) {
        return getNameText(node.name) || "anonymous";
    }
    if (ts.isArrowFunction(node)) {
        const parent = node.parent;
        if (ts.isVariableDeclaration(parent)) return getNameText(parent.name) || "anonymous";
        if (ts.isPropertyAssignment(parent)) return getNameText(parent.name) || "anonymous";
        return "anonymous";
    }
    return "top-level";
}

function getComponentName(sourceFile: ts.SourceFile) {
    let className = "";

    const visit = (node: ts.Node) => {
        if (className) return;
        if (ts.isClassDeclaration(node) && node.name) {
            className = node.name.text;
            return;
        }
        ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return className || path.basename(sourceFile.fileName, ".ts");
}

function isExportedConst(node: ts.VariableStatement) {
    return node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) === true;
}

function collectObjectStringValues(prefix: string, expression: ts.Expression, output: Map<string, string>) {
    if (ts.isStringLiteralLike(expression)) {
        output.set(prefix, expression.text);
        return;
    }

    if (!ts.isObjectLiteralExpression(expression)) {
        return;
    }

    for (const property of expression.properties) {
        if (!ts.isPropertyAssignment(property)) continue;
        const key = getNameText(property.name);
        if (!key) continue;
        collectObjectStringValues(`${prefix}.${key}`, property.initializer, output);
    }
}

function collectExportedConfigValues(filePaths: string[]) {
    const values = new Map<string, string>();

    for (const filePath of filePaths) {
        const content = fs.readFileSync(filePath, "utf8");
        const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);

        sourceFile.statements.forEach((statement) => {
            if (!ts.isVariableStatement(statement) || !isExportedConst(statement)) return;
            statement.declarationList.declarations.forEach((declaration) => {
                if (!declaration.initializer || !ts.isIdentifier(declaration.name)) return;
                collectObjectStringValues(declaration.name.text, declaration.initializer, values);
            });
        });
    }

    return values;
}

function getPropertyAccessPath(expression: ts.Expression): string {
    if (ts.isIdentifier(expression)) return expression.text;
    if (ts.isPropertyAccessExpression(expression)) {
        const left = getPropertyAccessPath(expression.expression);
        return left ? `${left}.${expression.name.text}` : expression.name.text;
    }
    if (ts.isElementAccessExpression(expression)) {
        const left = getPropertyAccessPath(expression.expression);
        const argument = expression.argumentExpression;
        if (left && argument && ts.isStringLiteralLike(argument)) {
            return `${left}.${argument.text}`;
        }
    }
    return "";
}

function resolveEventValue(expression: ts.Expression | undefined, configValues: Map<string, string>, sourceFile: ts.SourceFile) {
    if (!expression) return "";
    if (ts.isStringLiteralLike(expression)) return expression.text;

    const accessPath = getPropertyAccessPath(expression);
    if (accessPath && configValues.has(accessPath)) {
        return configValues.get(accessPath) || "";
    }

    return expression.getText(sourceFile);
}

function getCallerText(expression: ts.Expression, sourceFile: ts.SourceFile) {
    if (ts.isPropertyAccessExpression(expression)) {
        return expression.expression.getText(sourceFile);
    }
    return expression.getText(sourceFile);
}

function scanEventUsages(sourcePath: string, filePaths: string[], configValues: Map<string, string>) {
    const usages: EventUsage[] = [];

    for (const filePath of filePaths) {
        const content = fs.readFileSync(filePath, "utf8");
        const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
        const relativePath = getRelativePath(sourcePath, filePath);
        const componentName = getComponentName(sourceFile);
        const functionStack: ts.Node[] = [];

        const visit = (node: ts.Node) => {
            const isFunctionLike =
                ts.isFunctionDeclaration(node) ||
                ts.isFunctionExpression(node) ||
                ts.isArrowFunction(node) ||
                ts.isMethodDeclaration(node);

            if (isFunctionLike) {
                functionStack.push(node);
            }

            if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
                const methodName = node.expression.name.text;
                const kind: EventUsageKind | null = methodName === "emit"
                    ? "emit"
                    : methodName === "on"
                        ? "on"
                        : null;

                if (kind && node.arguments.length > 0) {
                    const eventExpression = node.arguments[0];
                    const eventValue = resolveEventValue(eventExpression, configValues, sourceFile);
                    if (eventValue) {
                        const location = getLineAndColumn(sourceFile, node);
                        usages.push({
                            id: `${relativePath}:${location.line}:${location.column}:${kind}`,
                            kind,
                            eventValue,
                            eventExpression: eventExpression.getText(sourceFile),
                            filePath,
                            relativePath,
                            componentName,
                            functionName: getFunctionName(functionStack[functionStack.length - 1]),
                            line: location.line,
                            column: location.column,
                            caller: getCallerText(node.expression, sourceFile),
                        });
                    }
                }
            }

            ts.forEachChild(node, visit);

            if (isFunctionLike) {
                functionStack.pop();
            }
        };

        visit(sourceFile);
    }

    return usages;
}

function buildGraph(sourcePath: string, filePaths: string[], usages: EventUsage[]): EventGraphResult {
    const nodes = new Map<string, EventGraphNode>();
    const emittersByEvent = new Map<string, EventUsage[]>();
    const listenersByEvent = new Map<string, EventUsage[]>();

    const ensureNode = (usage: EventUsage) => {
        const nodeId = usage.relativePath;
        const current = nodes.get(nodeId) || {
            id: nodeId,
            label: usage.componentName,
            filePath: usage.filePath,
            relativePath: usage.relativePath,
            emitCount: 0,
            listenerCount: 0,
        };

        if (usage.kind === "emit") current.emitCount += 1;
        if (usage.kind === "on") current.listenerCount += 1;
        nodes.set(nodeId, current);
        return current;
    };

    usages.forEach((usage) => {
        ensureNode(usage);
        const map = usage.kind === "emit" ? emittersByEvent : listenersByEvent;
        const list = map.get(usage.eventValue) || [];
        list.push(usage);
        map.set(usage.eventValue, list);
    });

    const edges = new Map<string, EventGraphEdge>();

    for (const [eventValue, emitters] of emittersByEvent.entries()) {
        const listeners = listenersByEvent.get(eventValue) || [];
        for (const emitter of emitters) {
            for (const listener of listeners) {
                const edgeId = `${emitter.relativePath}->${listener.relativePath}:${eventValue}`;
                const current = edges.get(edgeId) || {
                    id: edgeId,
                    source: emitter.relativePath,
                    target: listener.relativePath,
                    eventValue,
                    emitCount: 0,
                    listenerCount: 0,
                };
                current.emitCount += 1;
                current.listenerCount += 1;
                edges.set(edgeId, current);
            }
        }
    }

    const orphanEmits = usages.filter((usage) => usage.kind === "emit" && !listenersByEvent.has(usage.eventValue));
    const orphanListeners = usages.filter((usage) => usage.kind === "on" && !emittersByEvent.has(usage.eventValue));

    return {
        sourcePath,
        scannedFiles: filePaths.length,
        totalEvents: new Set(usages.map((usage) => usage.eventValue)).size,
        totalEmits: usages.filter((usage) => usage.kind === "emit").length,
        totalListeners: usages.filter((usage) => usage.kind === "on").length,
        nodes: Array.from(nodes.values()).sort((left, right) => left.relativePath.localeCompare(right.relativePath)),
        edges: Array.from(edges.values()).sort((left, right) => left.eventValue.localeCompare(right.eventValue)),
        usages,
        orphanEmits,
        orphanListeners,
    };
}

export function registerEventGraphHandler() {
    ipcMain.handle("event-graph:scan", async (_event, sourcePathInput: string) => {
        const sourcePath = String(sourcePathInput || "").trim();
        if (!sourcePath) {
            throw new Error("Please choose a source folder.");
        }
        if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isDirectory()) {
            throw new Error("Source folder does not exist.");
        }

        const filePaths = walkTsFiles(sourcePath);
        const configValues = collectExportedConfigValues(filePaths);
        const usages = scanEventUsages(sourcePath, filePaths, configValues);
        return buildGraph(sourcePath, filePaths, usages);
    });
}

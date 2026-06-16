import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

const rootDir = process.cwd();
const packageJsonPath = path.join(rootDir, "package.json");
const appPath = path.join(rootDir, "release", "mac-arm64", "CocosTools.app");

if (!fs.existsSync(packageJsonPath)) {
    throw new Error("package.json not found");
}

if (!fs.existsSync(appPath)) {
    throw new Error("Built app not found at release/mac-arm64/CocosTools.app");
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const version = packageJson.version;
const zipPath = path.join(rootDir, "release", `CocosTools-${version}-arm64-mac.zip`);

execFileSync("zip", ["-yr", zipPath, "CocosTools.app"], {
    cwd: path.dirname(appPath),
    stdio: "inherit",
});

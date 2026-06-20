import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

const rootDir = process.cwd();
const packageJsonPath = path.join(rootDir, "package.json");

if (!fs.existsSync(packageJsonPath)) {
    throw new Error("package.json not found");
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const productName = packageJson.build?.productName || packageJson.productName || "One Punch DevKit";
const version = packageJson.version;
const appBundleName = `${productName}.app`;
const appPath = path.join(rootDir, "release", "mac-arm64", appBundleName);

if (!fs.existsSync(appPath)) {
    throw new Error(`Built app not found at release/mac-arm64/${appBundleName}`);
}

const safeProductName = String(productName).replace(/\s+/g, "-");
const zipPath = path.join(rootDir, "release", `${safeProductName}-${version}-arm64-mac.zip`);

execFileSync("zip", ["-yr", zipPath, appBundleName], {
    cwd: path.dirname(appPath),
    stdio: "inherit",
});

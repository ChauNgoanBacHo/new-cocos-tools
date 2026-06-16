import fs from "fs";
import path from "path";

const rootDir = process.cwd();
const releaseDir = path.join(rootDir, "release");
const packageJsonPath = path.join(rootDir, "package.json");

if (!fs.existsSync(releaseDir) || !fs.existsSync(packageJsonPath)) {
    process.exit(0);
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const version = packageJson.version;
const keepPattern = new RegExp(`-${version}-.+\\.zip$`);

for (const name of fs.readdirSync(releaseDir)) {
    const targetPath = path.join(releaseDir, name);
    const stat = fs.lstatSync(targetPath);
    const shouldKeep = stat.isFile() && keepPattern.test(name);

    if (!shouldKeep) {
        fs.rmSync(targetPath, { recursive: true, force: true });
    }
}

#!/usr/bin/env node
import { mkdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const releaseDir = path.resolve("release");
const distDir = path.resolve("dist");

await rm(releaseDir, { recursive: true, force: true });
await rm(distDir, { recursive: true, force: true });
await mkdir(releaseDir, { recursive: true });

run("npm", ["run", "check"]);
run("npm", ["run", "build"]);
run("npm", ["pack", "--pack-destination", releaseDir]);

console.log(`cli-package-dir: ${releaseDir}`);

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: false,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

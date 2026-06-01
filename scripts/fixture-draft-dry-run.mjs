#!/usr/bin/env node
import { rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { writeTestArticlePackage } from "./test-package-fixture.mjs";

const fixtureRoot = path.resolve("fixtures/draft-dry-run");
const packageDir = path.join(fixtureRoot, "package");
const draftOut = path.join(fixtureRoot, "dist-draft-dry-run");

await rm(packageDir, { recursive: true, force: true });
await rm(draftOut, { recursive: true, force: true });
await writeTestArticlePackage(packageDir);
run("tsx", [
  "src/publisher-cli.ts",
  "draft",
  packageDir,
  "--config",
  "wechat-publisher.config.example.json",
  "--dry-run",
  "--submit-preview",
  "--out",
  draftOut,
]);

console.log(JSON.stringify({ status: "ok", packageDir, draftOut }, null, 2));

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: false,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { writeTestArticlePackage } from "./test-package-fixture.mjs";

const tempDir = await mkdtemp(path.join(tmpdir(), "wechat-publisher-smoke-"));

try {
  const packageDir = path.join(tempDir, "package");
  const draftOut = path.join(tempDir, "draft");
  const markdownPath = path.join(tempDir, "article.md");
  await writeTestArticlePackage(packageDir);
  await writeFile(markdownPath, "# 这不是文章包\n", "utf8");

  const renderResult = await runCli(["render", markdownPath, "--out", packageDir]);
  assert(renderResult.code !== 0, "publisher CLI must not expose render command");

  const markdownDraftResult = await runCli([
    "draft",
    markdownPath,
    "--token-mode",
    "local",
    "--app-id",
    "wx_dummy",
    "--dry-run",
  ]);
  assert(markdownDraftResult.code !== 0, "publisher draft must require a rendered package, not Markdown input");

  const packageDraftResult = await runCli([
    "draft",
    packageDir,
    "--token-mode",
    "local",
    "--app-id",
    "wx_dummy",
    "--dry-run",
    "--submit-preview",
    "--out",
    draftOut,
  ]);
  assert(packageDraftResult.code === 0, `publisher draft package expected exit 0, got ${packageDraftResult.code}\n${packageDraftResult.stderr}`);
  const draftReport = JSON.parse(await readFile(path.join(draftOut, "wechat-draft-report.json"), "utf8"));
  assert(draftReport.status === "dry_run", `expected dry_run report, got ${draftReport.status}`);
  await readFile(path.join(draftOut, "wechat-submit.html"), "utf8");

  console.log(JSON.stringify({ status: "ok", packageDir, draftOut }, null, 2));
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

function runCli(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["dist/publisher-cli.js", ...args], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        WECHAT_MP_APP_ID: "",
        WECHAT_MP_APP_SECRET: "",
        WECHAT_PUBLISHER_CENTER_URL: "",
        WECHAT_PUBLISHER_CENTER_API_KEY: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

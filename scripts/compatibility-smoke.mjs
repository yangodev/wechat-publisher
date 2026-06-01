#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const tempDir = await mkdtemp(path.join(tmpdir(), "wechat-publisher-compat-"));

try {
  const articlePath = path.join(tempDir, "article.md");
  const coverPath = path.join(tempDir, "cover.png");
  const outDir = path.join(tempDir, "dist");

  await writeFile(
    coverPath,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
      "base64",
    ),
  );
  await writeFile(
    articlePath,
    `---
title: 兼容性冒烟测试
author: YanGo
digest: 用于验证微信公众号渲染兼容性检查。
cover: ./cover.png
---

# 兼容性冒烟测试

这是一个包含 [外部链接](https://example.com) 的段落。

- 第一项
- 第二项

\`\`\`txt
A -> B -> C
\`\`\`
`,
    "utf8",
  );

  const result = await runCli(["render", articlePath, "--out", outDir]);
  assert(result.code === 0, `render expected exit 0, got ${result.code}\n${result.stderr}`);

  const report = JSON.parse(await readFile(path.join(outDir, "publish-report.json"), "utf8"));
  const articleHtml = await readFile(path.join(outDir, "article.html"), "utf8");

  assert(report.checks.errors.length === 0, "compatibility fixture should not produce errors");
  assert(hasCheck(report.checks.warnings, "wechat.external_link"), "missing external-link compatibility warning");
  assert(hasCheck(report.checks.infos, "wechat.duplicate_title_h1"), "missing duplicate-title H1 compatibility info");
  assert(hasCheck(report.checks.infos, "wechat.native_list"), "missing list compatibility info");
  assert(hasCheck(report.checks.infos, "wechat.compatibility_checked"), "missing compatibility completion info");
  assert(!articleHtml.includes("<style"), "rendered article should not contain style tags");
  assert(articleHtml.includes("#f4faf7"), "code block should use the light code-block background");
  assert(articleHtml.includes("white-space: pre-wrap"), "code block should preserve wrapping for mobile preview");

  console.log(JSON.stringify({ status: "ok", warnings: report.checks.warnings.map((item) => item.code) }, null, 2));
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

function runCli(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["dist/cli.js", ...args], {
      cwd: process.cwd(),
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

function hasCheck(items, code) {
  return items.some((item) => item.code === code);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

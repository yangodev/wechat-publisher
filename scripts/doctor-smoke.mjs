#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const tempDir = await mkdtemp(path.join(tmpdir(), "wechat-publisher-doctor-"));
const secret = "doctor-secret-should-not-leak";

try {
  const localConfigPath = path.join(tempDir, "local-config.json");
  await writeFile(
    localConfigPath,
    JSON.stringify(
      {
        wechat: {
          tokenMode: "local",
          appId: "wx_doctor_test",
          appSecret: secret,
          author: "YanGo",
          original: true,
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  const localResult = await runCli(["doctor", "--config", localConfigPath, "--json"]);
  assert(localResult.code === 0, `local doctor expected exit 0, got ${localResult.code}`);
  assert(!combinedOutput(localResult).includes(secret), "local doctor leaked appSecret");
  const localReport = JSON.parse(localResult.stdout);
  assert(localReport.status === "ready", `local doctor expected ready, got ${localReport.status}`);
  assert(hasCheck(localReport, "token.local.app_id", "pass"), "local doctor did not detect appId");
  assert(hasCheck(localReport, "token.local.app_secret", "pass"), "local doctor did not detect appSecret");

  const centerConfigPath = path.join(tempDir, "center-config.json");
  await writeFile(
    centerConfigPath,
    JSON.stringify(
      {
        wechat: {
          tokenMode: "center",
        },
        center: {
          url: "https://api.example.com",
          account: "acct_test",
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  const centerResult = await runCli(["doctor", "--config", centerConfigPath, "--json"]);
  assert(centerResult.code === 0, `center doctor expected exit 0, got ${centerResult.code}`);
  const centerReport = JSON.parse(centerResult.stdout);
  assert(centerReport.status === "warning", `center doctor expected warning, got ${centerReport.status}`);
  assert(hasCheck(centerReport, "token.center.missing_api_key", "warn"), "center doctor did not warn for missing apiKey");

  const articleResult = await runCli(["doctor", "--article", "fixtures/basic-article/article.md", "--json"]);
  assert(articleResult.code === 0, `article doctor expected exit 0, got ${articleResult.code}`);
  const articleReport = JSON.parse(articleResult.stdout);
  assert(hasCheck(articleReport, "article.render", "pass"), "article doctor did not render article");
  assert(
    hasCheck(articleReport, "render.wechat.duplicate_title_h1", "info"),
    "article doctor did not surface duplicate-title H1 compatibility info",
  );

  console.log(JSON.stringify({ status: "ok", cases: ["local-config", "center-config", "article-render"] }, null, 2));
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

function runCli(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["dist/cli.js", ...args], {
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

function hasCheck(report, code, status) {
  return report.checks.some((check) => check.code === code && check.status === status);
}

function combinedOutput(result) {
  return `${result.stdout}\n${result.stderr}`;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { writeTestArticlePackage } from "./test-package-fixture.mjs";

const cases = [
  {
    name: "expired account",
    responseStatus: 402,
    body: { error: "account_expired", message: "account expired" },
    expectedCode: "center.account_expired",
  },
  {
    name: "rate limited",
    responseStatus: 429,
    body: { error: "rate_limited", message: "request frequency is too high" },
    expectedCode: "center.rate_limited",
  },
  {
    name: "legacy rate-limit response",
    responseStatus: 429,
    body: { error: "quota_exceeded", message: "legacy rate-limit response" },
    expectedCode: "center.rate_limited",
  },
  {
    name: "forbidden account",
    responseStatus: 403,
    body: { error: "forbidden", message: "Bearer should not leak and secret=should-not-leak" },
    expectedCode: "center.forbidden",
    forbiddenText: ["should-not-leak"],
  },
  {
    name: "invalid json",
    responseStatus: 200,
    body: "<html>bad gateway</html>",
    contentType: "text/html",
    expectedCode: "token_center_fetch.invalid_json",
  },
];

const results = [];

for (const testCase of cases) {
  const outDir = await mkdtemp(path.join(tmpdir(), "wechat-publisher-diagnostics-"));
  try {
    await writeTestArticlePackage(outDir, {
      title: "诊断冒烟测试",
      digest: "用于测试中心 token 诊断。",
    });
    await withServer(testCase, async (centerUrl) => {
      const result = await runCli("dist/publisher-cli.js", [
        "draft",
        outDir,
        "--token-mode",
        "center",
        "--center-url",
        centerUrl,
        "--center-api-key",
        "center-secret-test-value",
        "--account",
        "acct_test",
        "--out",
        outDir,
      ]);

      const report = JSON.parse(await readFile(path.join(outDir, "wechat-draft-report.json"), "utf8"));
      const error = report.errors[0];
      const combinedOutput = `${result.stdout}\n${result.stderr}\n${JSON.stringify(report)}`;
      const leaksSecret =
        combinedOutput.includes("center-secret-test-value") ||
        (testCase.forbiddenText ?? []).some((text) => combinedOutput.includes(text));

      if (result.code !== 2) {
        throw new Error(`${testCase.name}: expected exit code 2, got ${result.code}.`);
      }
      if (error?.code !== testCase.expectedCode) {
        throw new Error(`${testCase.name}: expected ${testCase.expectedCode}, got ${error?.code}.`);
      }
      if (!error.message.includes("下一步")) {
        throw new Error(`${testCase.name}: expected actionable next step in message.`);
      }
      if (leaksSecret) {
        throw new Error(`${testCase.name}: secret-like text leaked in output/report.`);
      }

      results.push({
        name: testCase.name,
        code: error.code,
        exitCode: result.code,
        hasNextStep: error.message.includes("下一步"),
      });
    });
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
}

console.log(JSON.stringify(results, null, 2));

async function withServer(testCase, fn) {
  const server = http.createServer((req, res) => {
    if (req.url !== "/v1/wechat/token" || req.method !== "POST") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not_found" }));
      return;
    }

    res.writeHead(testCase.responseStatus, {
      "content-type": testCase.contentType ?? "application/json",
    });
    res.end(typeof testCase.body === "string" ? testCase.body : JSON.stringify(testCase.body));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function runCli(entry, args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [entry, ...args], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        WECHAT_PUBLISHER_CENTER_API_KEY: "",
        WECHAT_MP_APP_SECRET: "",
        WECHAT_MP_APP_ID: "",
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

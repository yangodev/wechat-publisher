#!/usr/bin/env node
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { buildArticle } from "./build.js";
import { loadPublisherConfig } from "./config.js";
import { createDraftFromPackage, printDraftSummary, type TokenMode } from "./draft.js";
import { runDoctor } from "./doctor.js";
import { initPublisherConfig } from "./init-config.js";
import type { BuildOptions, BuildResult } from "./types.js";
import { VERSION } from "./version.js";
import { printVisualQaSummary, runVisualQa } from "./visual-qa.js";

const program = new Command();

program
  .name("wechat-publisher")
  .description("Render Markdown into WeChat-ready HTML preview and article package.")
  .version(VERSION);

program
  .command("init")
  .description("Create a local publisher config file.")
  .requiredOption("--mode <mode>", "token mode: local or center")
  .option("--config <file>", "publisher config JSON file", "wechat-publisher.config.json")
  .option("--app-id <id>", "WeChat official account AppID for local mode")
  .option("--app-secret <secret>", "WeChat official account AppSecret for local mode")
  .option("--account <id>", "center account id for center mode")
  .option("--center-url <url>", "center service URL for center mode")
  .option("--center-api-key <key>", "center service API key for center mode")
  .option("--author <name>", "default WeChat article author")
  .option("--original", "mark drafts as original by default", true)
  .option("--no-original", "do not request original article fields by default")
  .option("--force", "overwrite an existing config file")
  .action(async (options: InitCliOptions) => {
    await runInit(options);
  });

program
  .command("doctor")
  .description("Diagnose local config, render compatibility, and article packages before creating WeChat drafts.")
  .option("--config <file>", "publisher config JSON file")
  .option("--token-mode <mode>", "token mode: local or center")
  .option("--article <file>", "Markdown article path to render-check")
  .option("--package <package-or-dir>", "article-package.json path or rendered output directory to validate")
  .option("--json", "print machine-readable JSON")
  .option("--strict", "exit non-zero on warnings")
  .action(async (options: DoctorCliOptions) => {
    await runDoctor({
      config: options.config,
      tokenMode: options.tokenMode,
      article: options.article,
      packageInput: options.package,
      json: Boolean(options.json),
      strict: Boolean(options.strict),
    });
  });

program
  .command("render")
  .argument("<article>", "Markdown article path")
  .option("-o, --out <dir>", "output directory", "dist")
  .option("--theme <file>", "theme CSS file")
  .option("--metadata <file>", "metadata JSON file")
  .option("--cover <file>", "cover image file")
  .option("--strict", "exit non-zero on warnings")
  .action(async (article: string, options: CliOptions) => {
    await run({
      mode: "render",
      input: article,
      outDir: options.out ?? "dist",
      theme: options.theme,
      metadata: options.metadata,
      cover: options.cover,
      strict: Boolean(options.strict),
      preview: true,
      writeOutputs: true,
    });
  });

program
  .command("package")
  .argument("<article>", "Markdown article path")
  .option("-o, --out <dir>", "output directory", "dist")
  .option("--theme <file>", "theme CSS file")
  .option("--metadata <file>", "metadata JSON file")
  .option("--cover <file>", "cover image file")
  .option("--strict", "exit non-zero on warnings")
  .action(async (article: string, options: CliOptions) => {
    await run({
      mode: "package",
      input: article,
      outDir: options.out ?? "dist",
      theme: options.theme,
      metadata: options.metadata,
      cover: options.cover,
      strict: Boolean(options.strict),
      preview: false,
      writeOutputs: true,
    });
  });

program
  .command("check")
  .argument("<article>", "Markdown article path")
  .option("-o, --out <dir>", "optional directory for publish-report.json")
  .option("--theme <file>", "theme CSS file")
  .option("--metadata <file>", "metadata JSON file")
  .option("--cover <file>", "cover image file")
  .option("--strict", "exit non-zero on warnings")
  .action(async (article: string, options: CliOptions) => {
    await run({
      mode: "check",
      input: article,
      outDir: options.out ?? path.join(os.tmpdir(), `wechat-publisher-${Date.now()}`),
      theme: options.theme,
      metadata: options.metadata,
      cover: options.cover,
      strict: Boolean(options.strict),
      preview: false,
      writeOutputs: Boolean(options.out),
    });
  });

program
  .command("verify")
  .argument("<article>", "Markdown article path")
  .option("-o, --out <dir>", "output directory", "dist")
  .option("--theme <file>", "theme CSS file")
  .option("--metadata <file>", "metadata JSON file")
  .option("--cover <file>", "cover image file")
  .option("--visual-report <file>", "visual QA report file name or path", "visual-report.json")
  .option("--visual-screenshots <dir>", "visual QA screenshot directory name or path", "visual-screenshots")
  .option("--strict", "exit non-zero on warnings")
  .action(async (article: string, options: VerifyCliOptions) => {
    await runVerify({
      mode: "render",
      input: article,
      outDir: options.out ?? "dist",
      theme: options.theme,
      metadata: options.metadata,
      cover: options.cover,
      strict: Boolean(options.strict),
      preview: true,
      writeOutputs: true,
    }, options);
  });

program
  .command("draft")
  .description("Create a WeChat official-account draft from Markdown or an existing article package.")
  .argument("<article>", "Markdown article path")
  .option("--config <file>", "publisher config JSON file")
  .option("-o, --out <dir>", "output directory", "dist")
  .option("--theme <file>", "theme CSS file")
  .option("--metadata <file>", "metadata JSON file")
  .option("--cover <file>", "cover image file")
  .option("--token-mode <mode>", "token mode: local or center")
  .option("--app-id <id>", "WeChat official account AppID")
  .option("--app-secret <secret>", "WeChat official account AppSecret")
  .option("--account <id>", "center account id for --token-mode center")
  .option("--author <name>", "WeChat article author")
  .option("--center-url <url>", "center service URL")
  .option("--center-api-key <key>", "center service API key")
  .option("--original", "mark the draft as original, enabled by default", true)
  .option("--no-original", "do not request original article fields")
  .option("--dry-run", "render and validate draft config without calling WeChat")
  .option("--submit-preview", "write wechat-submit.html and wechat-draft-payload.json before submitting")
  .option("--strict", "stop on render warnings")
  .action(async (input: string, options: DraftCliOptions) => {
    await runDraft(input, options);
  });

program
  .command("draft-package")
  .argument("<package-or-dir>", "article-package.json path or a rendered output directory")
  .description("Create a WeChat official-account draft from an existing article package.")
  .option("--config <file>", "publisher config JSON file")
  .option("--token-mode <mode>", "token mode: local or center")
  .option("--app-id <id>", "WeChat official account AppID")
  .option("--app-secret <secret>", "WeChat official account AppSecret")
  .option("--account <id>", "center account id for --token-mode center")
  .option("--author <name>", "WeChat article author, defaults to WECHAT_MP_AUTHOR or package metadata")
  .option("--center-url <url>", "center service URL")
  .option("--center-api-key <key>", "center service API key")
  .option("--original", "mark the draft as original, enabled by default", true)
  .option("--no-original", "do not request original article fields")
  .option("--dry-run", "validate package and token-mode config without calling WeChat")
  .option("--submit-preview", "write wechat-submit.html and wechat-draft-payload.json before submitting")
  .option("-o, --out <dir>", "directory for wechat-draft-report.json")
  .action(async (input: string, options: DraftCliOptions) => {
    await runDraftPackage(input, options);
  });

program
  .command("publish")
  .argument("<draft-media-id>", "WeChat draft media_id")
  .description("Publish an existing WeChat draft publicly. Reserved for a future explicit-confirmation flow.")
  .option("--confirm", "confirm public publishing")
  .action(async (_draftMediaId: string, _options: { confirm?: boolean }) => {
    console.error("Direct public publishing is not implemented yet. Use `draft` to create a WeChat draft, then publish manually in the WeChat admin.");
    process.exitCode = 2;
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 4;
});

interface CliOptions {
  out?: string;
  theme?: string;
  metadata?: string;
  cover?: string;
  strict?: boolean;
}

interface VerifyCliOptions extends CliOptions {
  visualReport?: string;
  visualScreenshots?: string;
}

interface DraftCliOptions extends CliOptions {
  config?: string;
  tokenMode?: string;
  appId?: string;
  appSecret?: string;
  account?: string;
  author?: string;
  centerUrl?: string;
  centerApiKey?: string;
  original?: boolean;
  dryRun?: boolean;
  submitPreview?: boolean;
}

interface DoctorCliOptions {
  config?: string;
  tokenMode?: string;
  article?: string;
  package?: string;
  json?: boolean;
  strict?: boolean;
}

interface InitCliOptions {
  mode: string;
  config?: string;
  appId?: string;
  appSecret?: string;
  account?: string;
  author?: string;
  centerUrl?: string;
  centerApiKey?: string;
  original?: boolean;
  force?: boolean;
}

async function runInit(options: InitCliOptions): Promise<void> {
  try {
    const result = await initPublisherConfig({
      configPath: options.config,
      mode: options.mode as TokenMode,
      appId: options.appId,
      appSecret: options.appSecret,
      account: options.account,
      author: options.author,
      centerUrl: options.centerUrl,
      centerApiKey: options.centerApiKey,
      original: options.original ?? true,
      force: Boolean(options.force),
    });

    console.log(`config: ${result.configPath}`);
    console.log(`mode: ${result.mode}`);
    console.log(`overwritten: ${result.overwritten}`);
    console.log(`author: ${result.summary.author ?? "(none)"}`);
    console.log(`original: ${result.summary.original}`);
    console.log(`app-id: ${result.summary.hasAppId ? "(configured)" : "(none)"}`);
    console.log(`app-secret: ${result.summary.hasAppSecret ? "(configured)" : "(none)"}`);
    console.log(`center-url: ${result.summary.centerUrl ?? "(none)"}`);
    console.log(`center-account: ${result.summary.account ?? "(none)"}`);
    console.log(`center-api-key: ${result.summary.hasCenterApiKey ? "(configured)" : "(none)"}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = process.exitCode || 1;
  }
}

async function run(options: BuildOptions): Promise<void> {
  try {
    const result = await buildArticle(options);
    printResult(result, options);

    if (result.report.checks.errors.length > 0) {
      process.exitCode = 2;
      return;
    }

    if (options.strict && result.report.checks.warnings.length > 0) {
      process.exitCode = 2;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = process.exitCode || 1;
  }
}

async function runVerify(buildOptions: BuildOptions, cliOptions: VerifyCliOptions): Promise<void> {
  try {
    const result = await buildArticle(buildOptions);
    printResult(result, buildOptions);

    if (result.report.checks.errors.length > 0) {
      process.exitCode = 2;
      return;
    }

    const { report, reportPath } = await runVisualQa({
      distDir: path.resolve(buildOptions.outDir),
      report: cliOptions.visualReport,
      screenshots: cliOptions.visualScreenshots,
    });
    printVisualQaSummary(report, reportPath);

    if (report.checks.errors.length > 0) {
      process.exitCode = 2;
      return;
    }

    if (buildOptions.strict && (result.report.checks.warnings.length > 0 || report.checks.warnings.length > 0)) {
      process.exitCode = 2;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

async function runDraft(input: string, options: DraftCliOptions): Promise<void> {
  try {
    const draftInput = isMarkdownInput(input) ? await renderDraftInput(input, options) : input;
    await draftPackage(draftInput, options);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

async function runDraftPackage(input: string, options: DraftCliOptions): Promise<void> {
  try {
    await draftPackage(input, options);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

async function renderDraftInput(input: string, options: DraftCliOptions): Promise<string> {
  const outDir = path.resolve(options.out ?? "dist");
  const buildOptions: BuildOptions = {
    mode: "render",
    input,
    outDir,
    theme: options.theme,
    metadata: options.metadata,
    cover: options.cover,
    strict: Boolean(options.strict),
    preview: true,
    writeOutputs: true,
  };
  const result = await buildArticle(buildOptions);
  printResult(result, buildOptions);

  if (result.report.checks.errors.length > 0) {
    process.exitCode = 2;
    throw new Error("Render failed; draft was not created.");
  }

  if (options.strict && result.report.checks.warnings.length > 0) {
    process.exitCode = 2;
    throw new Error("Render warnings found in --strict mode; draft was not created.");
  }

  return path.join(outDir, "article-package.json");
}

async function draftPackage(input: string, options: DraftCliOptions): Promise<void> {
  const config = await loadPublisherConfig(options.config);
  const tokenMode = options.tokenMode ?? config.wechat?.tokenMode ?? "local";
  const original = options.original ?? config.wechat?.original ?? true;
  const account = tokenMode === "center" ? options.account ?? config.center?.account : options.account;
  const { report, reportPath } = await createDraftFromPackage({
    input,
    tokenMode: tokenMode as TokenMode,
    appId: options.appId ?? config.wechat?.appId,
    appSecret: options.appSecret ?? config.wechat?.appSecret,
    account,
    author: options.author ?? config.wechat?.author,
    centerUrl: options.centerUrl ?? config.center?.url,
    centerApiKey: options.centerApiKey ?? config.center?.apiKey,
    original,
    dryRun: Boolean(options.dryRun),
    submitPreview: Boolean(options.submitPreview),
    outDir: options.out,
  });

  printDraftSummary(report, reportPath);

  if (report.errors.length > 0) {
    process.exitCode = 2;
  }
}

function isMarkdownInput(input: string): boolean {
  const ext = path.extname(input).toLowerCase();
  return ext === ".md" || ext === ".markdown";
}

function printResult(result: BuildResult, options: BuildOptions): void {
  const report = result.report;
  console.log(`status: ${report.status}`);
  console.log(`title: ${report.article.title || "(missing)"}`);
  console.log(`assets: ${report.assets.length}`);
  console.log(`errors: ${report.checks.errors.length}`);
  console.log(`warnings: ${report.checks.warnings.length}`);

  for (const item of report.checks.errors) {
    console.error(`[error] ${item.code}: ${item.message}${item.path ? ` (${item.path})` : ""}`);
  }

  for (const item of report.checks.warnings) {
    console.warn(`[warning] ${item.code}: ${item.message}${item.path ? ` (${item.path})` : ""}`);
  }

  if (options.writeOutputs) {
    console.log(`out: ${path.resolve(options.outDir)}`);
  }
}

#!/usr/bin/env node
import { Command } from "commander";
import { loadPublisherConfig } from "./config.js";
import { createDraftFromPackage, printDraftSummary, type TokenMode } from "./draft.js";
import { runDoctor } from "./doctor.js";
import { initPublisherConfig } from "./init-config.js";
import { VERSION } from "./version.js";

const program = new Command();

program
  .name("wechat-publisher")
  .description("Create WeChat official-account drafts from rendered article packages.")
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
  .description("Diagnose local publisher config and rendered article packages before creating WeChat drafts.")
  .option("--config <file>", "publisher config JSON file")
  .option("--token-mode <mode>", "token mode: local or center")
  .option("--package <package-or-dir>", "article-package.json path or rendered output directory to validate")
  .option("--json", "print machine-readable JSON")
  .option("--strict", "exit non-zero on warnings")
  .action(async (options: DoctorCliOptions) => {
    await runDoctor({
      config: options.config,
      tokenMode: options.tokenMode,
      packageInput: options.package,
      json: Boolean(options.json),
      strict: Boolean(options.strict),
    });
  });

program
  .command("draft")
  .description("Create a WeChat official-account draft from an existing rendered article package.")
  .argument("<package-or-dir>", "article-package.json path or a rendered output directory")
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

interface DraftCliOptions {
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
  out?: string;
}

interface DoctorCliOptions {
  config?: string;
  tokenMode?: string;
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

async function runDraftPackage(input: string, options: DraftCliOptions): Promise<void> {
  try {
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
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

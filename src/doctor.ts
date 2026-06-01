import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadPublisherConfig, type PublisherConfig } from "./config.js";
import { pathExists } from "./fs-utils.js";
import type { ArticlePackage } from "./article-package.js";
import { VERSION } from "./version.js";

type DoctorStatus = "ready" | "warning" | "blocked";
type DoctorCheckStatus = "pass" | "warn" | "fail" | "info";

export interface DoctorOptions {
  config?: string;
  tokenMode?: string;
  packageInput?: string;
  json?: boolean;
  strict?: boolean;
}

interface DoctorCheck {
  status: DoctorCheckStatus;
  code: string;
  message: string;
  path?: string;
}

interface DoctorReport {
  status: DoctorStatus;
  version: string;
  cwd: string;
  token_mode: string;
  config: {
    path: string | null;
    explicit: boolean;
    loaded: boolean;
  };
  summary: {
    errors: number;
    warnings: number;
    infos: number;
  };
  checks: DoctorCheck[];
}

export async function runDoctor(options: DoctorOptions): Promise<void> {
  const report = await createDoctorReport(options);

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printDoctorReport(report);
  }

  if (report.summary.errors > 0 || (options.strict && report.summary.warnings > 0)) {
    process.exitCode = 2;
  }
}

async function createDoctorReport(options: DoctorOptions): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];
  const configResolution = await resolveConfigPath(options.config);
  let config: PublisherConfig = {};
  let configLoaded = false;

  addCheck(checks, "info", "runtime.version", `wechat-publisher ${VERSION}`);
  addCheck(checks, "info", "runtime.cwd", process.cwd());
  addNodeVersionCheck(checks);

  if (configResolution.error) {
    addCheck(checks, "fail", "config.missing", configResolution.error, configResolution.path ?? undefined);
  } else if (!configResolution.path) {
    addCheck(checks, "warn", "config.not_found", "未找到配置文件。发布草稿前建议运行 `wechat-publisher init`。");
  } else {
    try {
      config = await loadPublisherConfig(configResolution.path);
      configLoaded = true;
      addCheck(checks, "pass", "config.loaded", "已读取发布配置。", configResolution.path);
    } catch (error) {
      addCheck(checks, "fail", "config.invalid", `配置文件读取失败：${errorMessage(error)}`, configResolution.path);
    }
  }

  const tokenMode = options.tokenMode ?? config.wechat?.tokenMode ?? "local";
  addTokenModeChecks(checks, tokenMode, config);

  if (options.packageInput) {
    await addPackageChecks(checks, options.packageInput);
  }

  const errors = checks.filter((check) => check.status === "fail").length;
  const warnings = checks.filter((check) => check.status === "warn").length;
  const infos = checks.filter((check) => check.status === "info").length;

  return {
    status: errors > 0 ? "blocked" : warnings > 0 ? "warning" : "ready",
    version: VERSION,
    cwd: process.cwd(),
    token_mode: tokenMode,
    config: {
      path: configResolution.path,
      explicit: configResolution.explicit,
      loaded: configLoaded,
    },
    summary: {
      errors,
      warnings,
      infos,
    },
    checks,
  };
}

async function resolveConfigPath(configPath?: string): Promise<{
  path: string | null;
  explicit: boolean;
  error?: string;
}> {
  if (configPath) {
    const resolved = path.resolve(configPath);
    if (!(await pathExists(resolved))) {
      return {
        path: resolved,
        explicit: true,
        error: "指定的配置文件不存在。",
      };
    }
    return { path: resolved, explicit: true };
  }

  const candidates = [
    path.resolve("wechat-publisher.config.json"),
    path.resolve(".wechat-publisher.config.json"),
  ];

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return { path: candidate, explicit: false };
    }
  }

  return { path: null, explicit: false };
}

function addNodeVersionCheck(checks: DoctorCheck[]): void {
  const [majorText] = process.versions.node.split(".");
  const major = Number(majorText);
  if (Number.isFinite(major) && major >= 20) {
    addCheck(checks, "pass", "runtime.node", `Node.js ${process.version}`);
    return;
  }

  addCheck(checks, "warn", "runtime.node", `当前 Node.js 为 ${process.version}，建议使用 Node.js 20 或更高版本。`);
}

function addTokenModeChecks(checks: DoctorCheck[], tokenMode: string, config: PublisherConfig): void {
  if (tokenMode !== "local" && tokenMode !== "center") {
    addCheck(checks, "fail", "token.mode_invalid", "tokenMode 只能是 local 或 center。");
    return;
  }

  addCheck(checks, "info", "token.mode", `当前 token 模式：${tokenMode}`);

  if (tokenMode === "local") {
    if (config.wechat?.appId || process.env.WECHAT_MP_APP_ID) {
      addCheck(checks, "pass", "token.local.app_id", "已配置本地模式 AppID。");
    } else {
      addCheck(checks, "warn", "token.local.missing_app_id", "本地模式缺少 AppID。可在配置文件 wechat.appId 或环境变量 WECHAT_MP_APP_ID 中设置。");
    }

    if (config.wechat?.appSecret || process.env.WECHAT_MP_APP_SECRET) {
      addCheck(checks, "pass", "token.local.app_secret", "已配置本地模式 AppSecret。");
    } else {
      addCheck(checks, "warn", "token.local.missing_app_secret", "本地模式缺少 AppSecret。首次获取 token 前需要配置。");
    }

    addCheck(checks, "info", "token.local.ip_allowlist", "本地模式需要把当前机器公网 IP 加入微信公众号后台 IP 白名单。");
    return;
  }

  if (config.center?.url || process.env.WECHAT_PUBLISHER_CENTER_URL) {
    addCheck(checks, "pass", "token.center.url", "已配置中心服务地址。");
  } else {
    addCheck(checks, "warn", "token.center.missing_url", "中心模式缺少 center.url 或 WECHAT_PUBLISHER_CENTER_URL。");
  }

  if (config.center?.apiKey || process.env.WECHAT_PUBLISHER_CENTER_API_KEY) {
    addCheck(checks, "pass", "token.center.api_key", "已配置中心服务 API Key。");
  } else {
    addCheck(checks, "warn", "token.center.missing_api_key", "中心模式缺少 center.apiKey 或 WECHAT_PUBLISHER_CENTER_API_KEY。");
  }

  if (config.center?.account) {
    addCheck(checks, "pass", "token.center.account", "已配置中心服务账号。");
  } else {
    addCheck(checks, "warn", "token.center.missing_account", "中心模式缺少 center.account。");
  }
}

async function addPackageChecks(checks: DoctorCheck[], packageInput: string): Promise<void> {
  const packagePath = await resolvePackagePath(packageInput);
  if (!packagePath) {
    addCheck(checks, "fail", "package.missing", "发布包不存在。", path.resolve(packageInput));
    return;
  }

  try {
    const articlePackage = JSON.parse(await readFile(packagePath, "utf8")) as Partial<ArticlePackage>;
    if (articlePackage.schema_version !== "0.1") {
      addCheck(checks, "fail", "package.schema", "发布包 schema_version 不是 0.1。", packagePath);
    } else {
      addCheck(checks, "pass", "package.schema", "发布包 schema_version 正确。", packagePath);
    }

    if (articlePackage.article?.title) {
      addCheck(checks, "pass", "package.title", "发布包包含标题。");
    } else {
      addCheck(checks, "fail", "package.title_missing", "发布包缺少标题。", packagePath);
    }

    if (articlePackage.content?.content_html) {
      addCheck(checks, "pass", "package.content", "发布包包含正文 HTML。");
    } else {
      addCheck(checks, "fail", "package.content_missing", "发布包缺少正文 HTML。", packagePath);
    }

    if (articlePackage.cover) {
      addCheck(checks, "pass", "package.cover", "发布包包含封面图记录。");
    } else {
      addCheck(checks, "warn", "package.cover_missing", "发布包缺少封面图记录，创建公众号草稿会失败。", packagePath);
    }
  } catch (error) {
    addCheck(checks, "fail", "package.invalid_json", `发布包不是有效 JSON：${errorMessage(error)}`, packagePath);
  }
}

async function resolvePackagePath(input: string): Promise<string | null> {
  const resolved = path.resolve(input);
  if (!(await pathExists(resolved))) {
    return null;
  }

  if (resolved.endsWith(".json")) {
    return resolved;
  }

  const packagePath = path.join(resolved, "article-package.json");
  return (await pathExists(packagePath)) ? packagePath : null;
}

function addCheck(checks: DoctorCheck[], status: DoctorCheckStatus, code: string, message: string, itemPath?: string): void {
  checks.push(itemPath ? { status, code, message, path: itemPath } : { status, code, message });
}

function printDoctorReport(report: DoctorReport): void {
  console.log(`status: ${report.status}`);
  console.log(`version: ${report.version}`);
  console.log(`token-mode: ${report.token_mode}`);
  console.log(`config: ${report.config.path ?? "(not found)"}`);
  console.log(`errors: ${report.summary.errors}`);
  console.log(`warnings: ${report.summary.warnings}`);

  for (const check of report.checks) {
    const line = `[${check.status}] ${check.code}: ${check.message}${check.path ? ` (${check.path})` : ""}`;
    if (check.status === "fail") {
      console.error(line);
    } else if (check.status === "warn") {
      console.warn(line);
    } else {
      console.log(line);
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

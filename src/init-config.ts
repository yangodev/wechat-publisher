import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathExists } from "./fs-utils.js";
import type { PublisherConfig } from "./config.js";
import type { TokenMode } from "./draft.js";

export interface InitConfigOptions {
  configPath?: string;
  mode: TokenMode;
  appId?: string;
  appSecret?: string;
  author?: string;
  original: boolean;
  centerUrl?: string;
  centerApiKey?: string;
  account?: string;
  force: boolean;
}

export interface InitConfigResult {
  configPath: string;
  mode: TokenMode;
  overwritten: boolean;
  summary: {
    author: string | null;
    original: boolean;
    hasAppId: boolean;
    hasAppSecret: boolean;
    centerUrl: string | null;
    account: string | null;
    hasCenterApiKey: boolean;
  };
}

const DEFAULT_CONFIG_PATH = "wechat-publisher.config.json";

export async function initPublisherConfig(options: InitConfigOptions): Promise<InitConfigResult> {
  validateMode(options.mode);
  const configPath = path.resolve(options.configPath ?? DEFAULT_CONFIG_PATH);
  const overwritten = await pathExists(configPath);

  if (overwritten && !options.force) {
    throw new Error(`Config file already exists: ${configPath}. Use --force to overwrite it.`);
  }

  const config = buildConfig(options);
  await mkdir(path.dirname(configPath), { recursive: true });
  await writePrivateJson(configPath, config);

  return {
    configPath,
    mode: options.mode,
    overwritten,
    summary: {
      author: config.wechat?.author ?? null,
      original: config.wechat?.original ?? true,
      hasAppId: Boolean(config.wechat?.appId),
      hasAppSecret: Boolean(config.wechat?.appSecret),
      centerUrl: config.center?.url ?? null,
      account: config.center?.account ?? null,
      hasCenterApiKey: Boolean(config.center?.apiKey),
    },
  };
}

async function writePrivateJson(filePath: string, value: unknown): Promise<void> {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(tempPath, filePath);
}

function buildConfig(options: InitConfigOptions): PublisherConfig {
  const author = options.author ?? process.env.WECHAT_MP_AUTHOR ?? process.env.WECHAT_PUBLISHER_AUTHOR;

  if (options.mode === "local") {
    const appId = options.appId ?? process.env.WECHAT_MP_APP_ID;
    const appSecret = options.appSecret ?? process.env.WECHAT_MP_APP_SECRET;

    if (!appId) {
      throw new Error("--app-id or WECHAT_MP_APP_ID is required for local mode.");
    }
    if (!appSecret) {
      throw new Error("--app-secret or WECHAT_MP_APP_SECRET is required for local mode.");
    }

    return {
      wechat: {
        tokenMode: "local",
        appId,
        appSecret,
        author,
        original: options.original,
      },
    };
  }

  const centerUrl = options.centerUrl ?? process.env.WECHAT_PUBLISHER_CENTER_URL;
  const centerApiKey = options.centerApiKey ?? process.env.WECHAT_PUBLISHER_CENTER_API_KEY;
  const account = options.account ?? process.env.WECHAT_PUBLISHER_CENTER_ACCOUNT;

  if (!centerUrl) {
    throw new Error("--center-url or WECHAT_PUBLISHER_CENTER_URL is required for center mode.");
  }
  if (!centerApiKey) {
    throw new Error("--center-api-key or WECHAT_PUBLISHER_CENTER_API_KEY is required for center mode.");
  }
  if (!account) {
    throw new Error("--account or WECHAT_PUBLISHER_CENTER_ACCOUNT is required for center mode.");
  }

  return {
    wechat: {
      tokenMode: "center",
      author,
      original: options.original,
    },
    center: {
      url: centerUrl,
      apiKey: centerApiKey,
      account,
    },
  };
}

function validateMode(mode: string): asserts mode is TokenMode {
  if (mode !== "local" && mode !== "center") {
    throw new Error("--mode must be local or center.");
  }
}

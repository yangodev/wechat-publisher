import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathExists } from "./fs-utils.js";
import type { TokenMode } from "./draft.js";

export interface PublisherConfig {
  wechat?: {
    tokenMode?: TokenMode;
    appId?: string;
    appSecret?: string;
    author?: string;
    original?: boolean;
  };
  center?: {
    url?: string;
    apiKey?: string;
    account?: string;
  };
}

export async function loadPublisherConfig(configPath?: string): Promise<PublisherConfig> {
  const resolved = configPath ? await resolveExplicitConfig(configPath) : await findDefaultConfig();
  if (!resolved) {
    return {};
  }

  const raw = await readFile(resolved, "utf8");
  const parsed = JSON.parse(raw) as PublisherConfig;
  return parsed;
}

async function resolveExplicitConfig(configPath: string): Promise<string> {
  const resolved = path.resolve(configPath);
  if (!(await pathExists(resolved))) {
    throw new Error(`Config file does not exist: ${resolved}`);
  }
  return resolved;
}

async function findDefaultConfig(): Promise<string | null> {
  const candidates = [
    path.resolve("wechat-publisher.config.json"),
    path.resolve(".wechat-publisher.config.json"),
  ];

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

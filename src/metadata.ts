import { readFile } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import type { ArticleMetadata, BuildOptions } from "./types.js";

export interface LoadedMarkdown {
  raw: string;
  content: string;
  frontmatter: ArticleMetadata;
  metadata: ArticleMetadata;
  merged: Required<Pick<ArticleMetadata, "tags">> & Omit<ArticleMetadata, "tags">;
  metadataPath: string | null;
}

export async function loadMarkdown(options: BuildOptions): Promise<LoadedMarkdown> {
  const raw = await readFile(options.input, "utf8");
  const parsed = matter(raw);
  const frontmatter = normalizeMetadata(parsed.data);
  const metadataPath = options.metadata ? path.resolve(options.metadata) : null;
  const metadata = metadataPath ? normalizeMetadata(JSON.parse(await readFile(metadataPath, "utf8"))) : {};
  const content = convertObsidianImages(parsed.content);
  const inferredTitle = inferTitle(content);

  const merged: LoadedMarkdown["merged"] = {
    ...frontmatter,
    ...metadata,
    title: optionsTitle(options) ?? metadata.title ?? frontmatter.title ?? inferredTitle,
    cover: options.cover ?? metadata.cover ?? frontmatter.cover,
    theme: options.theme ?? metadata.theme ?? frontmatter.theme,
    tags: normalizeTags(metadata.tags ?? frontmatter.tags),
  };

  return {
    raw,
    content,
    frontmatter,
    metadata,
    merged,
    metadataPath,
  };
}

export function normalizeMetadata(value: unknown): ArticleMetadata {
  if (!value || typeof value !== "object") {
    return {};
  }

  const data = value as Record<string, unknown>;
  return {
    title: stringField(data.title) ?? stringField(data.wechat_title),
    author: stringField(data.author),
    digest: stringField(data.digest) ?? stringField(data.summary) ?? stringField(data.wechat_summary),
    cover: stringField(data.cover) ?? stringField(data.wechat_cover),
    theme: stringField(data.theme),
    source_url: stringField(data.source_url),
    tags: normalizeTags(data.tags),
  };
}

export function inferTitle(markdown: string): string | undefined {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim();
}

export function convertObsidianImages(markdown: string): string {
  return markdown.replace(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, imagePath: string, alias?: string) => {
    const alt = alias && !/^\d+(px)?$/i.test(alias.trim()) ? alias.trim() : "";
    return `![${alt}](${imagePath.trim()})`;
  });
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeTags(value: unknown): string[] {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map((tag) => String(tag).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value.split(",").map((tag) => tag.trim()).filter(Boolean);
  }

  return [];
}

function optionsTitle(_options: BuildOptions): string | undefined {
  return undefined;
}

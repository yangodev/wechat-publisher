import path from "node:path";
import type { ArticleMetadata, ArticlePackage, AssetRecord, Checks, CoverRecord } from "./types.js";
import { relativePosix } from "./fs-utils.js";
import { VERSION } from "./version.js";

interface CreatePackageInput {
  inputPath: string;
  inputDir: string;
  outDir: string;
  metadataPath: string | null;
  themePath: string | null;
  metadata: ArticleMetadata;
  articleHtml: string;
  textExcerpt: string;
  wordCount: number;
  contentHash: string;
  cover: CoverRecord | null;
  assets: AssetRecord[];
  checks: Checks;
  includePreview: boolean;
}

export function createArticlePackage(input: CreatePackageInput): ArticlePackage {
  const hashPart = input.contentHash.replace(/^sha256:/, "").slice(0, 10);

  return {
    schema_version: "0.1",
    package_id: `pkg_${dateStamp()}_${hashPart}`,
    created_at: formatLocalIso(new Date()),
    generator: {
      name: "wechat-publisher",
      version: VERSION,
      mode: "local-render",
    },
    source: {
      markdown_path: relativePosix(process.cwd(), input.inputPath),
      metadata_path: input.metadataPath ? relativePosix(process.cwd(), input.metadataPath) : null,
      theme_path: input.themePath ? relativePosix(process.cwd(), input.themePath) : null,
      base_dir: relativePosix(process.cwd(), input.inputDir) || ".",
      content_hash: input.contentHash,
    },
    article: {
      title: input.metadata.title ?? "",
      author: input.metadata.author ?? "",
      digest: input.metadata.digest ?? input.textExcerpt.slice(0, 120),
      source_url: input.metadata.source_url ?? "",
      tags: input.metadata.tags ?? [],
      need_open_comment: false,
      only_fans_can_comment: false,
    },
    theme: {
      name: input.themePath ? path.basename(input.themePath, path.extname(input.themePath)) : "default",
      version: VERSION,
      source_path: input.themePath ? relativePosix(input.inputDir, input.themePath) : null,
      inline: true,
    },
    content: {
      article_html_path: "article.html",
      preview_html_path: input.includePreview ? "preview.html" : null,
      content_html: input.articleHtml,
      text_excerpt: input.textExcerpt,
      word_count: input.wordCount,
    },
    cover: input.cover,
    assets: input.assets,
    checks: input.checks,
    publish_targets: [
      {
        platform: "wechat_mp",
        mode: "draft",
        account_id: null,
        status: "not_started",
      },
    ],
    extensions: {},
  };
}

function dateStamp(): string {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function formatLocalIso(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  const yyyy = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  return `${yyyy}-${month}-${day}T${hour}:${minute}:${second}${sign}${hh}:${mm}`;
}

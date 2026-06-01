import { writeFile } from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";
import { addError, addInfo, addWarning, createChecks, finalizeChecks } from "./checks.js";
import { ensureDir, sha256Text } from "./fs-utils.js";
import { loadMarkdown } from "./metadata.js";
import { renderMarkdown } from "./markdown.js";
import { normalizeArticleHtml } from "./normalize-html.js";
import { processContentImages, processCover } from "./assets.js";
import { inlineTheme, loadTheme } from "./theme.js";
import { checkWechatCompatibility } from "./wechat-compatibility.js";
import { createArticlePackage } from "./package.js";
import { createPublishReport } from "./report.js";
import { renderPreview } from "./preview.js";
import type { BuildOptions, BuildResult } from "./types.js";

export async function buildArticle(rawOptions: BuildOptions): Promise<BuildResult> {
  const input = path.resolve(rawOptions.input);
  const outDir = path.resolve(rawOptions.outDir);
  const inputDir = path.dirname(input);
  const options = { ...rawOptions, input, outDir };
  const checks = createChecks();

  if (options.writeOutputs) {
    await ensureDir(outDir);
    await ensureDir(path.join(outDir, "assets"));
  }

  const loaded = await loadMarkdown(options);
  const metadata = loaded.merged;

  if (!metadata.title) {
    addError(checks, "article.title_missing", "文章标题缺失。");
  }

  const initialHtml = renderMarkdown(loaded.content);
  const normalizedHtml = normalizeArticleHtml(initialHtml);
  const processedAssets = await processContentImages(normalizedHtml, {
    inputDir,
    outDir,
    checks,
    writeAssets: options.writeOutputs && options.mode !== "check",
  });

  const cover = await processCover(metadata.cover, {
    inputDir,
    outDir,
    checks,
    writeAssets: options.writeOutputs && options.mode !== "check",
  });

  const theme = await loadTheme(metadata.theme, inputDir, checks);
  const articleHtml = inlineTheme(processedAssets.html, theme.css);
  const text = extractText(articleHtml);

  if (!text) {
    addError(checks, "article.body_empty", "文章正文为空。");
  }

  if (!metadata.digest) {
    addWarning(checks, "article.digest_missing", "未提供摘要，已用正文摘录作为默认摘要。");
  }

  if (articleHtml.includes(inputDir)) {
    addError(checks, "html.absolute_path", "article.html 中包含本机绝对路径。");
  }

  checkWechatCompatibility(articleHtml, checks, { title: metadata.title });

  addInfo(checks, "render.complete", "Markdown 已渲染为公众号 HTML。");
  finalizeChecks(checks);

  const contentHash = `sha256:${sha256Text(loaded.raw)}`;
  const articlePackage = createArticlePackage({
    inputPath: input,
    inputDir,
    outDir,
    metadataPath: loaded.metadataPath,
    themePath: theme.sourcePath,
    metadata,
    articleHtml,
    textExcerpt: text.slice(0, 180),
    wordCount: countWords(text),
    contentHash,
    cover,
    assets: processedAssets.assets,
    checks,
    includePreview: options.preview,
  });
  const report = createPublishReport(articlePackage, outDir);
  const previewHtml = options.preview ? renderPreview(articleHtml, report) : null;

  if (options.writeOutputs) {
    if (options.mode !== "check") {
      await writeFile(path.join(outDir, "article.html"), articleHtml, "utf8");
      await writeFile(path.join(outDir, "article-package.json"), JSON.stringify(articlePackage, null, 2), "utf8");
    }

    if (options.preview && previewHtml) {
      await writeFile(path.join(outDir, "preview.html"), previewHtml, "utf8");
    }

    await writeFile(path.join(outDir, "publish-report.json"), JSON.stringify(report, null, 2), "utf8");
  }

  return {
    articleHtml,
    previewHtml,
    articlePackage,
    report,
  };
}

function extractText(articleHtml: string): string {
  const $ = cheerio.load(articleHtml);
  return $.text().replace(/\s+/g, " ").trim();
}

function countWords(text: string): number {
  return Array.from(text.replace(/\s+/g, "")).length;
}

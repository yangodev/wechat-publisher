import { copyFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import * as cheerio from "cheerio";
import mime from "mime-types";
import { addError, addInfo, addWarning } from "./checks.js";
import { ensureDir, fileSize, isDataUrl, isRemoteUrl, pathExists, sha256File, toPosixPath } from "./fs-utils.js";
import type { AssetRecord, Checks, CoverRecord } from "./types.js";

const require = createRequire(import.meta.url);
const imageSizeModule = require("image-size") as unknown;
const imageSize =
  typeof imageSizeModule === "function"
    ? imageSizeModule
    : (imageSizeModule as { imageSize?: unknown; default?: unknown }).imageSize ??
      (imageSizeModule as { default?: unknown }).default;

interface ImageDimensions {
  width: number | null;
  height: number | null;
}

interface AssetContext {
  inputDir: string;
  outDir: string;
  checks: Checks;
  writeAssets: boolean;
}

export async function processContentImages(articleHtml: string, context: AssetContext): Promise<{
  html: string;
  assets: AssetRecord[];
}> {
  const $ = cheerio.load(articleHtml, { xmlMode: false }, false);
  const assets: AssetRecord[] = [];
  const images = $("img").toArray();
  let localImageIndex = 0;

  if (context.writeAssets) {
    await ensureDir(path.join(context.outDir, "assets"));
  }

  for (const image of images) {
    const img = $(image);
    const rawSrc = img.attr("src")?.trim();
    const alt = img.attr("alt")?.trim() ?? "";

    if (!rawSrc) {
      addWarning(context.checks, "image.empty_src", "发现没有 src 的图片。");
      continue;
    }

    if (isRemoteUrl(rawSrc)) {
      context.checks.summary.remote_asset_count += 1;
      addWarning(context.checks, "image.remote", "远程图片不会在 v0.1 中上传或复制。", rawSrc);
      wrapImage($, img, alt);
      continue;
    }

    if (isDataUrl(rawSrc)) {
      addWarning(context.checks, "image.data_url", "data URL 图片不会在 v0.1 中复制。");
      wrapImage($, img, alt);
      continue;
    }

    const cleanSrc = cleanImagePath(rawSrc);
    const resolved = await resolveLocalAssetPath(cleanSrc, context.inputDir);
    const sourcePath = resolved.path;

    if (path.isAbsolute(cleanSrc)) {
      context.checks.summary.absolute_path_count += 1;
      addWarning(context.checks, "image.absolute_path", "正文图片使用了本机绝对路径，已复制为发布包相对路径。", cleanSrc);
    } else if (resolved.resolvedFrom !== "input_dir") {
      addInfo(context.checks, "image.vault_relative_path", "正文图片按上级目录相对路径解析。", rawSrc);
    }

    if (!(await pathExists(sourcePath))) {
      context.checks.summary.missing_asset_count += 1;
      addError(context.checks, "image.missing", "正文图片不存在。", cleanSrc);
      continue;
    }

    localImageIndex += 1;
    const ext = normalizeExtension(sourcePath, "png");
    const assetPath = `assets/image-${String(localImageIndex).padStart(3, "0")}.${ext}`;
    const targetPath = path.join(context.outDir, assetPath);

    if (context.writeAssets) {
      await copyFile(sourcePath, targetPath);
    }

    const dimensions = readImageDimensions(sourcePath);
    const sizeBytes = await fileSize(sourcePath);
    const sha256 = await sha256File(sourcePath);
    const record: AssetRecord = {
      asset_id: `asset_${String(localImageIndex).padStart(3, "0")}`,
      usage: "content_image",
      path: toPosixPath(assetPath),
      original_path: rawSrc,
      mime: mime.lookup(sourcePath) || null,
      size_bytes: sizeBytes,
      width: dimensions.width,
      height: dimensions.height,
      alt,
      caption: alt || undefined,
      sha256: sha256 ?? undefined,
      wechat: {
        url: null,
        media_id: null,
      },
    };

    assets.push(record);
    img.attr("src", record.path);
    if (alt) {
      img.attr("alt", alt);
    }
    wrapImage($, img, alt);
  }

  removeEmptyParagraphs($);
  context.checks.summary.asset_count = assets.length;
  addInfo(context.checks, "assets.content_images", `复制正文图片 ${assets.length} 张。`);

  return {
    html: $.root().html() ?? articleHtml,
    assets,
  };
}

export async function processCover(coverPath: string | undefined, context: AssetContext): Promise<CoverRecord | null> {
  if (!coverPath) {
    addWarning(context.checks, "cover.missing", "未提供封面图。");
    return null;
  }

  if (isRemoteUrl(coverPath)) {
    addWarning(context.checks, "cover.remote", "远程封面图不会在 v0.1 中上传或复制。", coverPath);
    return null;
  }

  const cleanPath = cleanImagePath(coverPath);
  const resolved = await resolveLocalAssetPath(cleanPath, context.inputDir);
  const sourcePath = resolved.path;

  if (path.isAbsolute(cleanPath)) {
    context.checks.summary.absolute_path_count += 1;
    addWarning(context.checks, "cover.absolute_path", "封面图使用了本机绝对路径，已复制为发布包相对路径。", cleanPath);
  } else if (resolved.resolvedFrom !== "input_dir") {
    addInfo(context.checks, "cover.vault_relative_path", "封面图按上级目录相对路径解析。", coverPath);
  }

  if (!(await pathExists(sourcePath))) {
    addError(context.checks, "cover.missing_file", "封面图不存在。", cleanPath);
    return null;
  }

  if (context.writeAssets) {
    await ensureDir(path.join(context.outDir, "assets"));
  }

  const ext = normalizeExtension(sourcePath, "png");
  const assetPath = `assets/cover.${ext}`;
  const targetPath = path.join(context.outDir, assetPath);

  if (context.writeAssets) {
    await copyFile(sourcePath, targetPath);
  }

  const dimensions = readImageDimensions(sourcePath);
  const sizeBytes = await fileSize(sourcePath);

  return {
    asset_id: "asset_cover",
    path: toPosixPath(assetPath),
    original_path: coverPath,
    mime: mime.lookup(sourcePath) || null,
    size_bytes: sizeBytes,
    width: dimensions.width,
    height: dimensions.height,
    alt: "封面图",
    wechat: {
      thumb_media_id: null,
      url: null,
    },
  };
}

function wrapImage($: cheerio.CheerioAPI, img: cheerio.Cheerio<any>, caption: string): void {
  const parent = img.parent();
  if (parent.is("figure")) {
    parent.attr("data-wp-role", "image");
    if (caption && parent.find("figcaption").length === 0) {
      parent.append(`<figcaption>${escapeHtml(caption)}</figcaption>`);
    }
    return;
  }

  const figure = $('<figure data-wp-role="image"></figure>');
  if (isImageOnlyParagraph($, parent)) {
    parent.replaceWith(figure);
    figure.append(img);
  } else {
    img.replaceWith(figure);
    figure.append(img);
  }

  if (caption) {
    figure.append(`<figcaption>${escapeHtml(caption)}</figcaption>`);
  }
}

function isImageOnlyParagraph($: cheerio.CheerioAPI, parent: cheerio.Cheerio<any>): boolean {
  if (!parent.is("p") || parent.find("img").length !== 1) {
    return false;
  }

  return parent.contents().toArray().every((node) => {
    if (node.type === "text") {
      return ($(node).text() || "").trim() === "";
    }

    return node.type === "tag" && $(node).is("img");
  });
}

function removeEmptyParagraphs($: cheerio.CheerioAPI): void {
  $("p").each((_index, element) => {
    const paragraph = $(element);
    if (paragraph.text().trim() === "" && paragraph.children().length === 0) {
      paragraph.remove();
    }
  });
}

function cleanImagePath(value: string): string {
  const withoutAnchor = value.split("#")[0] ?? value;
  const withoutQuery = withoutAnchor.split("?")[0] ?? withoutAnchor;
  try {
    return decodeURI(withoutQuery);
  } catch {
    return withoutQuery;
  }
}

async function resolveLocalAssetPath(cleanPath: string, inputDir: string): Promise<{
  path: string;
  resolvedFrom: "absolute" | "input_dir" | "ancestor";
}> {
  if (path.isAbsolute(cleanPath)) {
    return { path: cleanPath, resolvedFrom: "absolute" };
  }

  const inputRelative = path.resolve(inputDir, cleanPath);
  if (await pathExists(inputRelative)) {
    return { path: inputRelative, resolvedFrom: "input_dir" };
  }

  let current = inputDir;
  while (true) {
    const candidate = path.resolve(current, cleanPath);
    if (await pathExists(candidate)) {
      return { path: candidate, resolvedFrom: "ancestor" };
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return { path: inputRelative, resolvedFrom: "input_dir" };
}

function normalizeExtension(filePath: string, fallback: string): string {
  const ext = path.extname(filePath).replace(".", "").toLowerCase();
  return ext || fallback;
}

function readImageDimensions(filePath: string): ImageDimensions {
  if (typeof imageSize !== "function") {
    return { width: null, height: null };
  }

  try {
    const result = imageSize(filePath) as { width?: number; height?: number };
    return {
      width: typeof result.width === "number" ? result.width : null,
      height: typeof result.height === "number" ? result.height : null,
    };
  } catch {
    return { width: null, height: null };
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

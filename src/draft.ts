import crypto from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import {
  createCenterDiagnosticError,
  createHttpDiagnosticError,
  createInvalidJsonDiagnosticError,
  createWechatDiagnosticError,
  diagnoseDraftError,
  sanitizeDiagnosticMessage,
} from "./diagnostics.js";
import type { ArticlePackage, AssetRecord, CheckItem, CoverRecord } from "./types.js";
import { pathExists } from "./fs-utils.js";
import { VERSION } from "./version.js";

export type TokenMode = "local" | "center";

export interface DraftOptions {
  input: string;
  tokenMode: TokenMode;
  account?: string;
  author?: string;
  appId?: string;
  appSecret?: string;
  original: boolean;
  dryRun: boolean;
  submitPreview?: boolean;
  outDir?: string;
  centerUrl?: string;
  centerApiKey?: string;
}

export interface DraftReport {
  status: "success" | "dry_run" | "failed";
  token_mode: TokenMode;
  account_id: string | null;
  package_path: string;
  draft_media_id: string | null;
  content_images: Array<{
    asset_id: string;
    local_path: string;
    wechat_url: string | null;
  }>;
  cover: {
    local_path: string;
    thumb_media_id: string | null;
    url: string | null;
  } | null;
  original: {
    requested: boolean;
    original_article_type: number | null;
    creation_source_type: number | null;
  };
  submit_preview: {
    html_path: string;
    payload_path: string;
  } | null;
  created_at: string;
  dry_run: boolean;
  warnings: CheckItem[];
  errors: CheckItem[];
}

interface DraftContext {
  packagePath: string;
  packageDir: string;
  outDir: string;
  articlePackage: ArticlePackage | null;
  report: DraftReport;
}

interface TokenResult {
  accessToken: string;
  expiresAt: string | null;
  source: TokenMode;
}

interface DraftContent {
  contentHtml: string;
  assetsToUpload: AssetRecord[];
  author: string;
}

type DraftArticlePayload = Record<string, unknown>;

const WECHAT_TOKEN_URL = "https://api.weixin.qq.com/cgi-bin/token";
const WECHAT_UPLOAD_IMG_URL = "https://api.weixin.qq.com/cgi-bin/media/uploadimg";
const WECHAT_ADD_MATERIAL_URL = "https://api.weixin.qq.com/cgi-bin/material/add_material";
const WECHAT_ADD_DRAFT_URL = "https://api.weixin.qq.com/cgi-bin/draft/add";
const TOKEN_CACHE_SAFETY_MS = 5 * 60 * 1000;
const DRY_RUN_THUMB_MEDIA_ID = "DRY_RUN_THUMB_MEDIA_ID";

export async function createDraftFromPackage(options: DraftOptions): Promise<{ report: DraftReport; reportPath: string }> {
  const context = await createDraftContext(options);

  try {
    validateDraftOptions(options, context);

    if (context.articlePackage) {
      await validatePackageForDraft(context);
    }

    const draftContent = context.articlePackage ? prepareDraftContent(context.articlePackage, options) : null;

    if (draftContent) {
      context.report.content_images = draftContent.assetsToUpload.map((asset) => ({
        asset_id: asset.asset_id,
        local_path: asset.path,
        wechat_url: null,
      }));
    }

    if (context.report.errors.length > 0) {
      context.report.status = "failed";
      const reportPath = await writeDraftReport(context);
      return { report: context.report, reportPath };
    }

    if (options.dryRun) {
      if (options.submitPreview && context.articlePackage && draftContent) {
        const payload = createDraftArticlePayload(
          context.articlePackage,
          options,
          draftContent.author,
          draftContent.contentHtml,
          DRY_RUN_THUMB_MEDIA_ID,
        );
        await writeSubmitPreview(context, payload);
      }
      context.report.status = "dry_run";
      const reportPath = await writeDraftReport(context);
      return { report: context.report, reportPath };
    }

    const token = await getAccessToken(options);
    void token;

    if (!context.articlePackage) {
      throw new Error("article-package.json was not loaded.");
    }

    if (!draftContent) {
      throw new Error("Draft content was not prepared.");
    }

    context.report.content_images = [];
    const uploadedImages = await uploadContentImages(draftContent.assetsToUpload, context.packageDir, token.accessToken);
    for (const image of uploadedImages) {
      context.report.content_images.push(image);
    }

    const contentHtml = replaceImageSources(draftContent.contentHtml, uploadedImages, context.report.warnings);
    const cover = await uploadCover(context.articlePackage.cover, context.packageDir, token.accessToken);
    context.report.cover = cover;
    if (!cover.thumb_media_id) {
      throw new Error("cover.upload did not return thumb_media_id.");
    }

    const payload = createDraftArticlePayload(
      context.articlePackage,
      options,
      draftContent.author,
      contentHtml,
      cover.thumb_media_id,
    );
    if (options.submitPreview) {
      await writeSubmitPreview(context, payload);
    }

    const draftMediaId = await addDraft(payload, token.accessToken);
    context.report.draft_media_id = draftMediaId;
    context.report.status = "success";
  } catch (error) {
    context.report.status = "failed";
    context.report.errors.push(diagnoseDraftError(error));
  }

  const reportPath = await writeDraftReport(context);
  return { report: context.report, reportPath };
}

export function printDraftSummary(report: DraftReport, reportPath: string): void {
  console.log(`draft-status: ${report.status}`);
  console.log(`token-mode: ${report.token_mode}`);
  console.log(`account: ${report.account_id ?? "(none)"}`);
  console.log(`content-images: ${report.content_images.length}`);
  console.log(`cover: ${report.cover?.thumb_media_id ?? report.cover?.local_path ?? "(missing)"}`);
  console.log(`draft-media-id: ${report.draft_media_id ?? "(not-created)"}`);
  if (report.submit_preview) {
    console.log(`submit-html: ${report.submit_preview.html_path}`);
    console.log(`submit-payload: ${report.submit_preview.payload_path}`);
  }
  console.log(`errors: ${report.errors.length}`);
  console.log(`warnings: ${report.warnings.length}`);

  for (const item of report.errors) {
    console.error(`[error] ${item.code}: ${item.message}${item.path ? ` (${item.path})` : ""}`);
  }

  for (const item of report.warnings) {
    console.warn(`[warning] ${item.code}: ${item.message}${item.path ? ` (${item.path})` : ""}`);
  }

  console.log(`draft-report: ${reportPath}`);
}

async function createDraftContext(options: DraftOptions): Promise<DraftContext> {
  const packagePath = resolvePackagePath(options.input);
  const packageDir = path.dirname(packagePath);
  const outDir = options.outDir ? path.resolve(options.outDir) : packageDir;
  const report: DraftReport = {
    status: "failed",
    token_mode: options.tokenMode,
    account_id: options.account ?? null,
    package_path: packagePath,
    draft_media_id: null,
    content_images: [],
    cover: null,
    original: {
      requested: options.original,
      original_article_type: options.original ? 1 : null,
      creation_source_type: options.original ? 1 : null,
    },
    submit_preview: null,
    created_at: formatLocalIso(new Date()),
    dry_run: options.dryRun,
    warnings: [],
    errors: [],
  };

  let articlePackage: ArticlePackage | null = null;
  try {
    const raw = await readFile(packagePath, "utf8");
    articlePackage = JSON.parse(raw) as ArticlePackage;
  } catch (error) {
    report.errors.push({
      code: "package.read_failed",
      message: `Cannot read article package: ${sanitizeDiagnosticMessage(error instanceof Error ? error.message : String(error))}`,
      path: packagePath,
    });
  }

  return { packagePath, packageDir, outDir, articlePackage, report };
}

function resolvePackagePath(input: string): string {
  const resolved = path.resolve(input);
  return path.basename(resolved) === "article-package.json" ? resolved : path.join(resolved, "article-package.json");
}

function validateDraftOptions(options: DraftOptions, context: DraftContext): void {
  if (options.tokenMode !== "local" && options.tokenMode !== "center") {
    context.report.errors.push({
      code: "token_mode.invalid",
      message: "Token mode must be local or center.",
    });
  }

  if (options.tokenMode === "local") {
    if (!(options.appId ?? process.env.WECHAT_MP_APP_ID)) {
      context.report.errors.push({
        code: "token.local.missing_app_id",
        message: "WECHAT_MP_APP_ID, config wechat.appId, or --app-id is required for --token-mode local.",
      });
    }
  }

  if (options.tokenMode === "center") {
    if (!options.account) {
      context.report.errors.push({
        code: "token.center.missing_account",
        message: "--account is required for --token-mode center.",
      });
    }
    if (!(options.centerUrl ?? process.env.WECHAT_PUBLISHER_CENTER_URL)) {
      context.report.errors.push({
        code: "token.center.missing_url",
        message: "WECHAT_PUBLISHER_CENTER_URL or --center-url is required for --token-mode center.",
      });
    }
    if (!(options.centerApiKey ?? process.env.WECHAT_PUBLISHER_CENTER_API_KEY)) {
      context.report.errors.push({
        code: "token.center.missing_api_key",
        message: "WECHAT_PUBLISHER_CENTER_API_KEY or --center-api-key is required for --token-mode center.",
      });
    }
  }
}

async function validatePackageForDraft(context: DraftContext): Promise<void> {
  const articlePackage = context.articlePackage;
  if (!articlePackage) {
    return;
  }

  if (articlePackage.schema_version !== "0.1") {
    context.report.errors.push({
      code: "package.schema.unsupported",
      message: `Unsupported schema_version: ${String(articlePackage.schema_version)}`,
      path: context.packagePath,
    });
  }

  if (articlePackage.checks.errors.length > 0) {
    for (const item of articlePackage.checks.errors) {
      context.report.errors.push({
        code: `package.${item.code}`,
        message: item.message,
        path: item.path,
      });
    }
  }

  if (!articlePackage.article.title.trim()) {
    context.report.errors.push({
      code: "article.missing_title",
      message: "Article title is required for WeChat drafts.",
    });
  }

  if (!articlePackage.content.content_html.trim()) {
    context.report.errors.push({
      code: "article.missing_content",
      message: "content_html is required for WeChat drafts.",
    });
  }

  if (!articlePackage.cover) {
    context.report.errors.push({
      code: "cover.missing",
      message: "Cover image is required because WeChat drafts need thumb_media_id.",
    });
  } else {
    await validateLocalImage(context, articlePackage.cover, "cover");
    context.report.cover = {
      local_path: articlePackage.cover.path,
      thumb_media_id: null,
      url: null,
    };
  }

  for (const asset of contentImageAssets(articlePackage.assets)) {
    await validateLocalImage(context, asset, "content_image");
  }
}

async function validateLocalImage(
  context: DraftContext,
  image: Pick<AssetRecord | CoverRecord, "path" | "mime">,
  usage: "cover" | "content_image",
): Promise<void> {
  const localPath = path.resolve(context.packageDir, image.path);
  if (!(await pathExists(localPath))) {
    context.report.errors.push({
      code: `${usage}.missing_file`,
      message: "Image file does not exist in the article package.",
      path: image.path,
    });
    return;
  }

  if (image.mime === "image/svg+xml") {
    context.report.errors.push({
      code: `${usage}.unsupported_svg`,
      message: "SVG images are not supported for WeChat API upload. Use PNG or JPEG.",
      path: image.path,
    });
  }
}

function contentImageAssets(assets: AssetRecord[]): AssetRecord[] {
  return assets.filter((asset) => asset.usage === "content_image");
}

function prepareDraftContent(articlePackage: ArticlePackage, options: DraftOptions): DraftContent {
  const $ = cheerio.load(articlePackage.content.content_html, {}, false);
  removeDuplicateTitle($, articlePackage.article.title);
  removeLeadingCoverImage($, articlePackage);
  normalizeCodeBlocksForDraft($);
  cleanListWhitespace($);

  const imageSrcs = new Set<string>();
  $("img").each((_, element) => {
    const src = $(element).attr("src");
    if (src) {
      imageSrcs.add(normalizeSrc(src));
    }
  });

  return {
    contentHtml: $.html(),
    assetsToUpload: contentImageAssets(articlePackage.assets).filter((asset) => imageSrcs.has(normalizeSrc(asset.path))),
    author: resolveDraftAuthor(articlePackage, options),
  };
}

function removeDuplicateTitle($: cheerio.CheerioAPI, title: string): void {
  const expected = normalizeText(title);
  if (!expected) {
    return;
  }

  const firstH1 = $("h1").first();
  if (firstH1.length > 0 && normalizeText(firstH1.text()) === expected) {
    firstH1.remove();
  }
}

function normalizeCodeBlocksForDraft($: cheerio.CheerioAPI): void {
  $("pre").each((_, element) => {
    const pre = $(element);
    const code = pre.find("code").first();
    pre.attr(
      "style",
      [
        "margin: 24px 0",
        "padding: 16px",
        "border: 1px solid #d7e5df",
        "border-radius: 8px",
        "background: #f4faf7",
        "color: #24302d",
        "line-height: 1.8",
        "overflow-x: auto",
      ].join("; "),
    );
    code.attr(
      "style",
      [
        "padding: 0",
        "background: transparent",
        "color: " + "inherit",
        "font-family: Menlo, Monaco, Consolas, 'Courier New', monospace",
        "font-size: 0.92em",
        "white-space: pre-wrap",
        "overflow-wrap: anywhere",
      ].join("; "),
    );
  });
}

function cleanListWhitespace($: cheerio.CheerioAPI): void {
  $("ul,ol").each((_, element) => {
    const list = $(element);
    list.contents().each((_, child) => {
      if (child.type === "text" && normalizeText($(child).text()) === "") {
        $(child).remove();
      }
    });
  });
}

function removeLeadingCoverImage($: cheerio.CheerioAPI, articlePackage: ArticlePackage): void {
  if (!articlePackage.cover) {
    return;
  }

  const section = $("[data-wp-role='article']").first();
  const children = section.length > 0 ? section.children().toArray() : $.root().children().toArray();

  for (const child of children) {
    const node = $(child);
    if (isIgnorableLeadingNode(node)) {
      continue;
    }

    const image = node.is("img") ? node : node.find("img").first();
    const src = image.attr("src");
    if (src && isCoverImageSource(src, articlePackage)) {
      node.remove();
    }
    return;
  }
}

function isIgnorableLeadingNode(node: cheerio.Cheerio<AnyNode>): boolean {
  if (node.is("style,script")) {
    return true;
  }
  return normalizeText(node.text()) === "" && node.find("img").length === 0;
}

function isCoverImageSource(src: string, articlePackage: ArticlePackage): boolean {
  const normalizedSrc = normalizeSrc(src);
  const cover = articlePackage.cover;
  if (!cover) {
    return false;
  }

  if (normalizedSrc === normalizeSrc(cover.path) || normalizedSrc === normalizeSrc(cover.original_path)) {
    return true;
  }

  return contentImageAssets(articlePackage.assets).some((asset) => {
    if (normalizedSrc !== normalizeSrc(asset.path)) {
      return false;
    }
    return normalizeSrc(asset.original_path) === normalizeSrc(cover.original_path);
  });
}

function resolveDraftAuthor(articlePackage: ArticlePackage, options: DraftOptions): string {
  return options.author ?? process.env.WECHAT_MP_AUTHOR ?? process.env.WECHAT_PUBLISHER_AUTHOR ?? articlePackage.article.author;
}

async function getAccessToken(options: DraftOptions): Promise<TokenResult> {
  if (options.tokenMode === "local") {
    return getLocalAccessToken(options);
  }
  return getCenterAccessToken(options);
}

async function getLocalAccessToken(options: DraftOptions): Promise<TokenResult> {
  const appId = options.appId ?? process.env.WECHAT_MP_APP_ID;
  if (!appId) {
    throw new Error("WECHAT_MP_APP_ID is required.");
  }

  const cached = await readLocalTokenCache(appId);
  if (cached) {
    return {
      accessToken: cached.access_token,
      expiresAt: new Date(cached.expires_at).toISOString(),
      source: "local",
    };
  }

  const appSecret = options.appSecret ?? process.env.WECHAT_MP_APP_SECRET;
  if (!appSecret) {
    throw new Error("WECHAT_MP_APP_SECRET, config wechat.appSecret, or --app-secret is required when no cached access_token is available.");
  }

  const url = new URL(WECHAT_TOKEN_URL);
  url.searchParams.set("grant_type", "client_credential");
  url.searchParams.set("appid", appId);
  url.searchParams.set("secret", appSecret);

  const data = await requestJson<{ access_token?: string; expires_in?: number; errcode?: number; errmsg?: string }>(
    "token.local.fetch",
    url,
  );

  if (!data.access_token) {
    throw createWechatDiagnosticError("token.local.fetch", data.errcode, data.errmsg);
  }

  const expiresAt = Date.now() + Math.max((data.expires_in ?? 7200) * 1000 - TOKEN_CACHE_SAFETY_MS, 60 * 1000);
  await writeLocalTokenCache(appId, {
    access_token: data.access_token,
    expires_at: expiresAt,
  });

  return {
    accessToken: data.access_token,
    expiresAt: new Date(expiresAt).toISOString(),
    source: "local",
  };
}

async function getCenterAccessToken(options: DraftOptions): Promise<TokenResult> {
  const centerUrl = options.centerUrl ?? process.env.WECHAT_PUBLISHER_CENTER_URL;
  const apiKey = options.centerApiKey ?? process.env.WECHAT_PUBLISHER_CENTER_API_KEY;
  if (!centerUrl || !apiKey || !options.account) {
    throw new Error("WECHAT_PUBLISHER_CENTER_URL, WECHAT_PUBLISHER_CENTER_API_KEY, and --account are required.");
  }

  const url = new URL("/v1/wechat/token", centerUrl);
  const data = await requestJson<{
    account_id?: string;
    access_token?: string;
    expires_at?: string;
    token_type?: string;
    error?: string;
    message?: string;
  }>("token.center.fetch", url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      account_id: options.account,
      client: {
        name: "wechat-publisher",
        version: VERSION,
      },
    }),
  });

  if (!data.access_token) {
    throw createCenterDiagnosticError(data.error, data.message);
  }

  return {
    accessToken: data.access_token,
    expiresAt: data.expires_at ?? null,
    source: "center",
  };
}

async function uploadContentImages(
  assets: AssetRecord[],
  packageDir: string,
  accessToken: string,
): Promise<DraftReport["content_images"]> {
  const uploaded: DraftReport["content_images"] = [];

  for (const asset of contentImageAssets(assets)) {
    const localPath = path.resolve(packageDir, asset.path);
    const url = new URL(WECHAT_UPLOAD_IMG_URL);
    url.searchParams.set("access_token", accessToken);
    const data = await uploadWechatMedia<{ url?: string; errcode?: number; errmsg?: string }>(
      "content_image.upload",
      url,
      localPath,
      asset.mime,
    );

    if (!data.url) {
      throw createWechatDiagnosticError("content_image.upload", data.errcode, data.errmsg, asset.path);
    }

    uploaded.push({
      asset_id: asset.asset_id,
      local_path: asset.path,
      wechat_url: data.url,
    });
  }

  return uploaded;
}

function replaceImageSources(
  contentHtml: string,
  uploadedImages: DraftReport["content_images"],
  warnings: CheckItem[],
): string {
  const $ = cheerio.load(contentHtml, {}, false);
  const byPath = new Map(uploadedImages.map((image) => [normalizeSrc(image.local_path), image.wechat_url]));
  const seen = new Set<string>();

  $("img").each((_, element) => {
    const src = $(element).attr("src");
    if (!src) {
      return;
    }
    const normalized = normalizeSrc(src);
    const wechatUrl = byPath.get(normalized);
    if (wechatUrl) {
      $(element).attr("src", wechatUrl);
      seen.add(normalized);
    }
  });

  for (const image of uploadedImages) {
    const normalized = normalizeSrc(image.local_path);
    if (!seen.has(normalized)) {
      warnings.push({
        code: "content_image.not_referenced",
        message: "Uploaded image was not referenced by content_html.",
        path: image.local_path,
      });
    }
  }

  return $.html();
}

async function uploadCover(
  cover: CoverRecord | null,
  packageDir: string,
  accessToken: string,
): Promise<NonNullable<DraftReport["cover"]>> {
  if (!cover) {
    throw new Error("Cover image is required.");
  }

  const localPath = path.resolve(packageDir, cover.path);
  const url = new URL(WECHAT_ADD_MATERIAL_URL);
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("type", "image");
  const data = await uploadWechatMedia<{ media_id?: string; url?: string; errcode?: number; errmsg?: string }>(
    "cover.upload",
    url,
    localPath,
    cover.mime,
  );

  if (!data.media_id) {
    throw createWechatDiagnosticError("cover.upload", data.errcode, data.errmsg, cover.path);
  }

  return {
    local_path: cover.path,
    thumb_media_id: data.media_id,
    url: data.url ?? null,
  };
}

async function addDraft(
  payload: DraftArticlePayload,
  accessToken: string,
): Promise<string> {
  const url = new URL(WECHAT_ADD_DRAFT_URL);
  url.searchParams.set("access_token", accessToken);
  const data = await requestJson<{ media_id?: string; errcode?: number; errmsg?: string }>("draft.add", url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(createDraftRequestBody(payload)),
  });

  if (!data.media_id) {
    throw createWechatDiagnosticError("draft.add", data.errcode, data.errmsg);
  }

  return data.media_id;
}

function createDraftArticlePayload(
  articlePackage: ArticlePackage,
  options: DraftOptions,
  author: string,
  contentHtml: string,
  thumbMediaId: string,
): DraftArticlePayload {
  const payload: DraftArticlePayload = {
    title: articlePackage.article.title,
    author,
    digest: articlePackage.article.digest,
    content: contentHtml,
    content_source_url: articlePackage.article.source_url,
    thumb_media_id: thumbMediaId,
    need_open_comment: articlePackage.article.need_open_comment ? 1 : 0,
    only_fans_can_comment: articlePackage.article.only_fans_can_comment ? 1 : 0,
  };

  if (options.original) {
    payload.article_type = "original";
    payload.original_article_type = 1;
    payload.creation_source_type = 1;
  }

  return payload;
}

function createDraftRequestBody(payload: DraftArticlePayload): { articles: DraftArticlePayload[] } {
  return {
    articles: [payload],
  };
}

async function uploadWechatMedia<T>(
  stage: string,
  url: URL,
  filePath: string,
  mime: string | null,
): Promise<T> {
  const buffer = await readFile(filePath);
  const blob = new Blob([new Uint8Array(buffer)], {
    type: mime ?? "application/octet-stream",
  });
  const form = new FormData();
  form.append("media", blob, path.basename(filePath));
  return requestJson<T>(stage, url, {
    method: "POST",
    body: form,
  });
}

async function requestJson<T>(stage: string, url: URL, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const text = await response.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw createInvalidJsonDiagnosticError(stage);
  }

  if (!response.ok) {
    throw createHttpDiagnosticError(stage, response.status, data);
  }

  const maybeWechatError = data as { errcode?: number; errmsg?: string };
  if (typeof maybeWechatError.errcode === "number" && maybeWechatError.errcode !== 0) {
    throw createWechatDiagnosticError(stage, maybeWechatError.errcode, maybeWechatError.errmsg);
  }

  return data as T;
}

async function writeDraftReport(context: DraftContext): Promise<string> {
  await mkdir(context.outDir, { recursive: true });
  const reportPath = path.join(context.outDir, "wechat-draft-report.json");
  await writeFile(reportPath, `${JSON.stringify(context.report, null, 2)}\n`, "utf8");
  return reportPath;
}

async function writeSubmitPreview(context: DraftContext, payload: DraftArticlePayload): Promise<void> {
  await mkdir(context.outDir, { recursive: true });
  const htmlPath = path.join(context.outDir, "wechat-submit.html");
  const payloadPath = path.join(context.outDir, "wechat-draft-payload.json");
  const contentHtml = typeof payload.content === "string" ? payload.content : "";

  await writeFile(htmlPath, renderSubmitPreviewHtml(context, contentHtml), "utf8");
  await writeFile(payloadPath, `${JSON.stringify(createDraftRequestBody(payload), null, 2)}\n`, "utf8");

  context.report.submit_preview = {
    html_path: htmlPath,
    payload_path: payloadPath,
  };
}

function renderSubmitPreviewHtml(context: DraftContext, contentHtml: string): string {
  const title = context.articlePackage?.article.title ?? "WeChat Submit Preview";
  const previewHtml = makeLocalImagesRenderable(contentHtml, context.packageDir);

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} - WeChat Submit Preview</title>
  <style>
    body {
      margin: 0;
      background: #f5f7f6;
      color: #21312d;
      font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
    }
    main {
      width: min(677px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 48px 0 72px;
      background: #ffffff;
    }
    img {
      max-width: 100%;
      height: auto;
    }
  </style>
</head>
<body>
  <main>
${previewHtml}
  </main>
</body>
</html>
`;
}

function makeLocalImagesRenderable(contentHtml: string, packageDir: string): string {
  const $ = cheerio.load(contentHtml, {}, false);
  $("img").each((_, element) => {
    const image = $(element);
    const src = image.attr("src");
    if (!src || isExternalLikeSrc(src)) {
      return;
    }
    image.attr("src", pathToFileURL(path.resolve(packageDir, src)).href);
  });
  return $.html();
}

function isExternalLikeSrc(src: string): boolean {
  return /^(?:https?:|data:|file:|\/\/)/i.test(src);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface CachedToken {
  access_token: string;
  expires_at: number;
}

interface TokenCacheFile {
  tokens: Record<string, CachedToken>;
}

async function readLocalTokenCache(appId: string): Promise<CachedToken | null> {
  const cache = await readTokenCacheFile();
  const token = cache.tokens[tokenCacheKey(appId)];
  if (!token || token.expires_at <= Date.now()) {
    return null;
  }
  return token;
}

async function writeLocalTokenCache(appId: string, token: CachedToken): Promise<void> {
  const cachePath = localTokenCachePath();
  await mkdir(path.dirname(cachePath), { recursive: true });
  const cache = await readTokenCacheFile();
  cache.tokens[tokenCacheKey(appId)] = token;
  await writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, { mode: 0o600 });
  await chmod(cachePath, 0o600);
}

async function readTokenCacheFile(): Promise<TokenCacheFile> {
  try {
    const raw = await readFile(localTokenCachePath(), "utf8");
    const parsed = JSON.parse(raw) as TokenCacheFile;
    return parsed.tokens ? parsed : { tokens: {} };
  } catch {
    return { tokens: {} };
  }
}

function localTokenCachePath(): string {
  return path.join(os.homedir(), ".cache", "wechat-publisher", "wechat-token-cache.json");
}

function tokenCacheKey(appId: string): string {
  return crypto.createHash("sha256").update(appId).digest("hex").slice(0, 24);
}

function normalizeSrc(value: string): string {
  try {
    return decodeURI(value).replace(/\\/g, "/").replace(/^\.\//, "");
  } catch {
    return value.replace(/\\/g, "/").replace(/^\.\//, "");
  }
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
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

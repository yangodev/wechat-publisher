import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);

export async function writeTestArticlePackage(outDir, options = {}) {
  const assetsDir = path.join(outDir, "assets");
  const coverPath = path.join(assetsDir, "cover.png");
  await mkdir(assetsDir, { recursive: true });
  await writeFile(coverPath, onePixelPng);

  const title = options.title ?? "草稿 dry-run 测试";
  const contentHtml = options.contentHtml ?? `<p>这是一篇使用 PNG 封面的测试文章。</p><p><img src="assets/cover.png" alt="流程图"></p>`;
  const articlePackage = {
    schema_version: "0.1",
    package_id: "pkg_test_0000000000",
    created_at: "2026-06-01T00:00:00+08:00",
    generator: {
      name: "wechat-renderer",
      version: "0.4.0",
      mode: "local-render",
    },
    source: {
      markdown_path: "article.md",
      metadata_path: null,
      theme_path: null,
      base_dir: ".",
      content_hash: "sha256:test",
    },
    article: {
      title,
      author: options.author ?? "YanGo",
      digest: options.digest ?? "用于验证文章包可以进入微信公众号草稿流程。",
      source_url: "",
      tags: [],
      need_open_comment: false,
      only_fans_can_comment: false,
    },
    theme: {
      name: "test",
      version: "0.4.0",
      source_path: null,
      inline: true,
    },
    content: {
      article_html_path: "article.html",
      preview_html_path: null,
      content_html: contentHtml,
      text_excerpt: "这是一篇使用 PNG 封面的测试文章。",
      word_count: 24,
    },
    cover: {
      asset_id: "cover",
      path: "assets/cover.png",
      original_path: "assets/cover.png",
      mime: "image/png",
      size_bytes: onePixelPng.length,
      width: 1,
      height: 1,
      alt: title,
      wechat: {
        thumb_media_id: null,
        url: null,
      },
    },
    assets: [
      {
        asset_id: "image-001",
        usage: "content_image",
        path: "assets/cover.png",
        original_path: "assets/cover.png",
        mime: "image/png",
        size_bytes: onePixelPng.length,
        width: 1,
        height: 1,
        alt: "流程图",
        wechat: {
          url: null,
          media_id: null,
        },
      },
    ],
    checks: {
      status: "ready",
      errors: [],
      warnings: [],
      infos: [],
      summary: {
        asset_count: 1,
        missing_asset_count: 0,
        remote_asset_count: 0,
        absolute_path_count: 0,
      },
    },
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

  await writeFile(path.join(outDir, "article.html"), contentHtml, "utf8");
  await writeFile(path.join(outDir, "article-package.json"), `${JSON.stringify(articlePackage, null, 2)}\n`, "utf8");
}

import type { ArticlePackage, PublishReport } from "./types.js";

export function createPublishReport(articlePackage: ArticlePackage, outDir: string): PublishReport {
  return {
    status: articlePackage.checks.status,
    input: {
      markdown_path: articlePackage.source.markdown_path,
      metadata_path: articlePackage.source.metadata_path,
      theme_path: articlePackage.source.theme_path,
      cover_path: articlePackage.cover?.original_path ?? null,
    },
    output: {
      out_dir: outDir,
      article_html_path: "article.html",
      preview_html_path: articlePackage.content.preview_html_path,
      article_package_path: "article-package.json",
      publish_report_path: "publish-report.json",
      assets_dir: "assets",
    },
    article: articlePackage.article,
    theme: articlePackage.theme,
    cover: articlePackage.cover,
    assets: articlePackage.assets,
    checks: articlePackage.checks,
    ready_for_v02: articlePackage.checks.status !== "blocked" && articlePackage.checks.status !== "failed",
  };
}

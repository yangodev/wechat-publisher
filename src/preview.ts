import type { PublishReport } from "./types.js";

export function renderPreview(articleHtml: string, report: PublishReport): string {
  const statusColor = report.status === "ready" ? "#178f72" : report.status === "warning" ? "#b7791f" : "#b42318";
  const reportJson = escapeHtml(JSON.stringify(report.checks, null, 2));

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" href="data:,">
  <title>${escapeHtml(report.article.title || "WeChat Preview")}</title>
  <style>
    body {
      margin: 0;
      background: #f6f8f7;
      color: #24302d;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .preview-shell {
      max-width: 760px;
      margin: 0 auto;
      padding: 40px 18px 72px;
      background: #ffffff;
      min-height: 100vh;
      box-sizing: border-box;
    }
    .preview-meta {
      margin: 0 auto 28px;
      max-width: 680px;
      color: #6c7f79;
      font-size: 13px;
      line-height: 1.6;
    }
    .preview-status {
      display: inline-block;
      margin-bottom: 10px;
      padding: 2px 8px;
      border: 1px solid ${statusColor};
      border-radius: 999px;
      color: ${statusColor};
      font-size: 12px;
    }
    details {
      max-width: 680px;
      margin: 42px auto 0;
      color: #4d625c;
      font-size: 13px;
    }
    pre.preview-report {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      padding: 14px;
      background: #f0f5f3;
      border-radius: 8px;
    }
  </style>
</head>
<body>
  <main class="preview-shell">
    <section class="preview-meta">
      <span class="preview-status">${escapeHtml(report.status)}</span>
      <div>title: ${escapeHtml(report.article.title || "")}</div>
      <div>assets: ${report.assets.length}, errors: ${report.checks.errors.length}, warnings: ${report.checks.warnings.length}</div>
    </section>
    ${articleHtml}
    <details>
      <summary>publish-report</summary>
      <pre class="preview-report">${reportJson}</pre>
    </details>
  </main>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

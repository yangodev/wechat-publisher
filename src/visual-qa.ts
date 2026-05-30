import http from "node:http";
import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser } from "playwright";

export interface VisualQaOptions {
  distDir: string;
  report?: string;
  screenshots?: string;
  rootDir?: string;
}

export interface VisualQaCheckItem {
  code: string;
  message: string;
}

export interface VisualQaViewport {
  name: string;
  width: number;
  height: number;
}

export interface VisualQaReport {
  status: "passed" | "warning" | "failed";
  generated_at: string;
  input: {
    dist_dir: string;
    preview_html_path: string;
    preview_url: string;
  };
  screenshots: Record<string, string>;
  checks: {
    errors: VisualQaCheckItem[];
    warnings: VisualQaCheckItem[];
    infos: VisualQaCheckItem[];
  };
  viewports: Record<string, ViewportMetrics>;
}

interface ViewportMetrics {
  title: string;
  innerWidth: number;
  documentWidth: number;
  bodyWidth: number;
  bodyHeight: number;
  imageCount: number;
  failedImages: ImageMetric[];
  globalHorizontalOverflow: boolean;
  overflows: OverflowMetric[];
  blockingOverflows: OverflowMetric[];
}

interface ImageMetric {
  src: string;
  complete: boolean;
  naturalWidth: number;
  naturalHeight: number;
  displayWidth: number;
  displayHeight: number;
}

interface OverflowMetric {
  tag: string;
  text: string;
  scrollWidth: number;
  clientWidth: number;
  rectWidth: number;
  overflowX: string;
  acceptable: boolean;
}

interface StaticServer {
  url: string;
  close: () => Promise<void>;
}

const DEFAULT_VIEWPORTS: VisualQaViewport[] = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

export async function runVisualQa(options: VisualQaOptions): Promise<{
  report: VisualQaReport;
  reportPath: string;
}> {
  const rootDir = options.rootDir ?? process.cwd();
  const distDir = path.resolve(rootDir, options.distDir);
  const reportPath = resolveInside(distDir, options.report ?? "visual-report.json");
  const screenshotDir = resolveInside(distDir, options.screenshots ?? "visual-screenshots");
  const previewPath = path.join(distDir, "preview.html");

  await assertFile(previewPath, "preview.html");
  await mkdir(screenshotDir, { recursive: true });

  const server = await startStaticServer(distDir);
  const browser = await chromium.launch({ headless: true });
  const report: VisualQaReport = {
    status: "passed",
    generated_at: new Date().toISOString(),
    input: {
      dist_dir: relativePath(rootDir, distDir),
      preview_html_path: relativePath(rootDir, previewPath),
      preview_url: `${server.url}/preview.html`,
    },
    screenshots: {},
    checks: {
      errors: [],
      warnings: [],
      infos: [],
    },
    viewports: {},
  };

  try {
    for (const viewport of DEFAULT_VIEWPORTS) {
      const result = await inspectViewport(browser, server.url, viewport, screenshotDir, rootDir);
      report.screenshots[viewport.name] = relativePath(rootDir, result.screenshotPath);
      report.viewports[viewport.name] = result.metrics;
      report.checks.errors.push(...result.errors);
      report.checks.warnings.push(...result.warnings);
      report.checks.infos.push(...result.infos);
    }
  } finally {
    await browser.close();
    await server.close();
  }

  if (report.checks.errors.length > 0) {
    report.status = "failed";
  } else if (report.checks.warnings.length > 0) {
    report.status = "warning";
  }

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  return { report, reportPath };
}

export function printVisualQaSummary(report: VisualQaReport, reportPath: string, rootDir = process.cwd()): void {
  console.log(`visual: ${report.status}`);
  console.log(`visual-report: ${relativePath(rootDir, reportPath)}`);
  for (const [name, viewport] of Object.entries(report.viewports)) {
    console.log(
      `${name}: width=${viewport.innerWidth}, images=${viewport.imageCount}, globalOverflow=${viewport.globalHorizontalOverflow}, blockingOverflows=${viewport.blockingOverflows.length}`,
    );
  }
  console.log(`visual-errors: ${report.checks.errors.length}`);
  console.log(`visual-warnings: ${report.checks.warnings.length}`);
}

async function inspectViewport(
  browser: Browser,
  baseUrl: string,
  viewport: VisualQaViewport,
  outputDir: string,
  rootDir: string,
): Promise<{
  screenshotPath: string;
  metrics: ViewportMetrics;
  errors: VisualQaCheckItem[];
  warnings: VisualQaCheckItem[];
  infos: VisualQaCheckItem[];
}> {
  const page = await browser.newPage({
    viewport: {
      width: viewport.width,
      height: viewport.height,
    },
  });
  const consoleErrors: string[] = [];
  const consoleWarnings: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  const httpErrors: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
    if (message.type() === "warning") {
      consoleWarnings.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });
  page.on("requestfailed", (request) => {
    failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ""}`.trim());
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      httpErrors.push(`${response.status()} ${response.url()}`);
    }
  });

  await page.goto(`${baseUrl}/preview.html`, { waitUntil: "networkidle" });
  const screenshotPath = path.join(outputDir, `${viewport.name}.png`);
  await page.screenshot({
    path: screenshotPath,
    fullPage: true,
    scale: "css",
    type: "png",
  });

  const metrics = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll("body *"));
    const rawOverflows = all
      .map((el) => {
        const style = window.getComputedStyle(el);
        const overflow = el.scrollWidth > el.clientWidth + 2;
        const rect = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 90),
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          rectWidth: Math.round(rect.width),
          overflowX: style.overflowX,
          acceptable:
            overflow &&
            ["pre", "code", "table"].includes(el.tagName.toLowerCase()) &&
            ["auto", "scroll"].includes(style.overflowX),
        };
      })
      .filter((item) => item.scrollWidth > item.clientWidth + 2);

    const images = Array.from(document.querySelectorAll("img")).map((img) => {
      const rect = img.getBoundingClientRect();
      return {
        src: img.getAttribute("src") || "",
        complete: img.complete,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        displayWidth: Math.round(rect.width),
        displayHeight: Math.round(rect.height),
      };
    });

    return {
      title: document.title,
      innerWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      bodyHeight: document.body.scrollHeight,
      imageCount: images.length,
      failedImages: images.filter((img) => !img.complete || img.naturalWidth === 0),
      globalHorizontalOverflow:
        document.documentElement.scrollWidth > window.innerWidth + 2 ||
        document.body.scrollWidth > window.innerWidth + 2,
      overflows: rawOverflows.slice(0, 50),
      blockingOverflows: rawOverflows.filter((item) => !item.acceptable).slice(0, 50),
    };
  });

  await page.close();

  const errors: VisualQaCheckItem[] = [];
  const warnings: VisualQaCheckItem[] = [];
  const infos: VisualQaCheckItem[] = [];

  if (consoleErrors.length > 0) {
    errors.push(...consoleErrors.map((message) => item(`${viewport.name}.console_error`, message)));
  }

  if (pageErrors.length > 0) {
    errors.push(...pageErrors.map((message) => item(`${viewport.name}.page_error`, message)));
  }

  if (failedRequests.length > 0) {
    errors.push(...failedRequests.map((message) => item(`${viewport.name}.request_failed`, message)));
  }

  if (httpErrors.length > 0) {
    errors.push(...httpErrors.map((message) => item(`${viewport.name}.http_error`, message)));
  }

  if (metrics.failedImages.length > 0) {
    errors.push(item(`${viewport.name}.image_failed`, `图片加载失败 ${metrics.failedImages.length} 张。`));
  }

  if (metrics.globalHorizontalOverflow) {
    errors.push(item(`${viewport.name}.global_horizontal_overflow`, "页面存在整页横向溢出。"));
  }

  if (metrics.blockingOverflows.length > 0) {
    errors.push(item(`${viewport.name}.blocking_overflow`, `发现 ${metrics.blockingOverflows.length} 个不可接受的元素横向溢出。`));
  }

  if (consoleWarnings.length > 0) {
    warnings.push(...consoleWarnings.map((message) => item(`${viewport.name}.console_warning`, message)));
  }

  const acceptableOverflowCount = metrics.overflows.length - metrics.blockingOverflows.length;
  if (acceptableOverflowCount > 0) {
    infos.push(item(`${viewport.name}.scrollable_overflow`, `${acceptableOverflowCount} 个代码块或表格有局部横向滚动。`));
  }

  infos.push(item(`${viewport.name}.screenshot`, `截图已保存到 ${relativePath(rootDir, screenshotPath)}。`));

  return {
    screenshotPath,
    metrics,
    errors,
    warnings,
    infos,
  };
}

async function assertFile(filePath: string, label: string): Promise<void> {
  try {
    const info = await stat(filePath);
    if (!info.isFile()) {
      throw new Error(`${label} is not a file: ${filePath}`);
    }
  } catch (error) {
    throw new Error(`找不到 ${label}：${filePath}\n请先运行 render 或 verify 命令生成预览。`, { cause: error });
  }
}

function startStaticServer(baseDir: string): Promise<StaticServer> {
  const normalizedBaseDir = path.resolve(baseDir);
  const server = http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    const decodedPath = decodeURIComponent(requestUrl.pathname);
    const relative = decodedPath === "/" ? "preview.html" : decodedPath.slice(1);
    const filePath = path.resolve(normalizedBaseDir, relative);

    if (isOutsideDir(normalizedBaseDir, filePath)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    try {
      const info = await stat(filePath);
      if (!info.isFile()) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }
      response.writeHead(200, {
        "content-type": contentType(filePath),
      });
      createReadStream(filePath).pipe(response);
    } catch {
      response.writeHead(404);
      response.end("Not found");
    }
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("无法启动本地预览服务器。"));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        close: () =>
          new Promise((closeResolve, closeReject) => {
            server.close((error) => (error ? closeReject(error) : closeResolve()));
          }),
      });
    });
  });
}

function contentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") {
    return "text/html; charset=utf-8";
  }
  if (ext === ".json") {
    return "application/json; charset=utf-8";
  }
  if (ext === ".css") {
    return "text/css; charset=utf-8";
  }
  if (ext === ".svg") {
    return "image/svg+xml";
  }
  if (ext === ".png") {
    return "image/png";
  }
  if (ext === ".jpg" || ext === ".jpeg") {
    return "image/jpeg";
  }
  if (ext === ".webp") {
    return "image/webp";
  }
  return "application/octet-stream";
}

function item(code: string, message: string): VisualQaCheckItem {
  return { code, message };
}

function relativePath(rootDir: string, filePath: string): string {
  return path.relative(rootDir, filePath).split(path.sep).join("/");
}

function resolveInside(baseDir: string, value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(baseDir, value);
}

function isOutsideDir(baseDir: string, filePath: string): boolean {
  const relative = path.relative(baseDir, filePath);
  return relative.startsWith("..") || path.isAbsolute(relative);
}

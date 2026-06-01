import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { addError, addInfo, addWarning } from "./checks.js";
import type { Checks } from "./types.js";

interface CompatibilityOptions {
  title?: string;
}

export function checkWechatCompatibility(articleHtml: string, checks: Checks, options: CompatibilityOptions = {}): void {
  const $ = cheerio.load(articleHtml, { xmlMode: false }, false);

  const h1s = $("h1");
  const firstH1 = h1s.first();
  const firstH1MatchesTitle =
    firstH1.length > 0 && normalizeText(options.title) !== "" && normalizeText(firstH1.text()) === normalizeText(options.title);
  if (firstH1MatchesTitle) {
    addInfo(checks, "wechat.duplicate_title_h1", "正文首个 H1 与标题相同，提交草稿时会自动移除，避免标题重复。");
  }

  const h1CountAfterDraftCleanup = h1s.length - (firstH1MatchesTitle ? 1 : 0);
  if (h1CountAfterDraftCleanup > 0) {
    addWarning(checks, "wechat.h1_in_body", "正文中包含非标题 H1。公众号已有独立标题字段，建议正文从 H2 开始。");
  }

  const externalLinkCount = $("a[href^='http://'], a[href^='https://']").length;
  if (externalLinkCount > 0) {
    addWarning(checks, "wechat.external_link", "正文包含外部链接。微信公众号正文链接可能受限制，发布前建议确认跳转或改成文末参考。");
  }

  const listCount = $("ul,ol").length;
  if (listCount > 0) {
    addInfo(checks, "wechat.native_list", "正文包含原生列表。已保留语义列表，如微信编辑器缩进异常再改为普通段落。");
  }

  const tableCount = $("table").length;
  if (tableCount > 0) {
    addInfo(checks, "wechat.table", "正文包含表格。发布前建议在微信后台预览移动端效果。");
  }

  $("script").each((_, element) => {
    addError(checks, "wechat.script_tag", "正文 HTML 中包含 script 标签，微信公众号不支持。", snippetPath($, element));
  });

  $("style").each((_, element) => {
    addError(checks, "wechat.style_tag", "正文 HTML 中包含 style 标签，发布前必须转成行内样式。", snippetPath($, element));
  });

  $("img").each((_, element) => {
    const src = $(element).attr("src")?.trim();
    if (!src) {
      return;
    }
    if (/^file:\/\//i.test(src)) {
      addError(checks, "wechat.image_file_url", "正文图片仍然是 file:// 地址，微信无法上传。", src);
    }
  });

  $("pre").each((_, element) => {
    const pre = $(element);
    const code = pre.find("code").first();
    const style = `${pre.attr("style") ?? ""}; ${code.attr("style") ?? ""}`;
    if (!/white-space\s*:\s*pre-wrap/i.test(style) && !/overflow-wrap\s*:\s*anywhere/i.test(style)) {
      addInfo(checks, "wechat.code_wrap", "代码块建议使用自动换行样式，避免移动端横向滚动。");
    }
  });

  addInfo(checks, "wechat.compatibility_checked", "已完成公众号兼容性检查。");
}

function snippetPath($: cheerio.CheerioAPI, element: AnyNode): string {
  const html = $.html(element).replace(/\s+/g, " ").trim();
  return html.length > 120 ? `${html.slice(0, 117)}...` : html;
}

function normalizeText(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

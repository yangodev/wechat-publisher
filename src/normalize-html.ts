import * as cheerio from "cheerio";

export function normalizeArticleHtml(articleHtml: string): string {
  const $ = cheerio.load(articleHtml, { xmlMode: false }, false);

  const root = $('section[data-wp-role="article"]').first();
  if (root.length === 0) {
    $.root().wrapInner('<section data-wp-role="article"></section>');
  }

  $("pre").attr("data-wp-role", "code-block");
  $("blockquote").attr("data-wp-role", "quote");
  $("table").attr("data-wp-role", "table");

  $("a").each((_index, element) => {
    const link = $(element);
    const href = link.attr("href");
    if (href && /^https?:\/\//i.test(href)) {
      link.attr("target", "_blank");
      link.attr("rel", "noopener noreferrer");
    }
  });

  return $.root().html() ?? articleHtml;
}

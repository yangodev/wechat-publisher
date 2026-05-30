import MarkdownIt from "markdown-it";

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: false,
  breaks: false,
});

export function renderMarkdown(content: string): string {
  const body = markdown.render(content);
  return `<section data-wp-role="article">${body}</section>`;
}

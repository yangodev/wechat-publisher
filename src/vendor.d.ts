declare module "juice" {
  interface InlineOptions {
    applyStyleTags?: boolean;
    removeStyleTags?: boolean;
    preserveImportant?: boolean;
  }

  const juice: {
    inlineContent(html: string, css: string, options?: InlineOptions): string;
  };

  export default juice;
}

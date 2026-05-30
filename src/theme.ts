import { readFile } from "node:fs/promises";
import path from "node:path";
import juice from "juice";
import postcss from "postcss";
import { DEFAULT_THEME_CSS, DEFAULT_THEME_NAME } from "./default-theme.js";
import { addError, addInfo } from "./checks.js";
import type { Checks } from "./types.js";

export interface LoadedTheme {
  name: string;
  sourcePath: string | null;
  css: string;
}

export async function loadTheme(themePath: string | undefined, baseDir: string, checks: Checks): Promise<LoadedTheme> {
  if (!themePath) {
    addInfo(checks, "theme.default", "使用默认主题。");
    return {
      name: DEFAULT_THEME_NAME,
      sourcePath: null,
      css: DEFAULT_THEME_CSS,
    };
  }

  const resolved = path.isAbsolute(themePath) ? themePath : path.resolve(baseDir, themePath);
  try {
    const css = await readFile(resolved, "utf8");
    postcss.parse(css, { from: resolved });
    return {
      name: path.basename(resolved, path.extname(resolved)),
      sourcePath: resolved,
      css: `${DEFAULT_THEME_CSS}\n${css}`,
    };
  } catch (error) {
    addError(checks, "theme.invalid", `主题 CSS 无法读取或解析：${errorMessage(error)}`, resolved);
    return {
      name: DEFAULT_THEME_NAME,
      sourcePath: resolved,
      css: DEFAULT_THEME_CSS,
    };
  }
}

export function inlineTheme(articleHtml: string, css: string): string {
  return juice.inlineContent(articleHtml, css, {
    applyStyleTags: true,
    removeStyleTags: true,
    preserveImportant: true,
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

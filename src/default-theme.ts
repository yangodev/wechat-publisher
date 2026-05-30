export const DEFAULT_THEME_NAME = "default";

export const DEFAULT_THEME_CSS = `
section[data-wp-role="article"] {
  max-width: 680px;
  margin: 0 auto;
  color: #24302d;
  font-size: 17px;
  line-height: 1.9;
  letter-spacing: 0;
  word-break: break-word;
}

section[data-wp-role="article"] h1 {
  margin: 0 0 28px;
  padding-bottom: 14px;
  border-bottom: 1px solid #d7e5df;
  color: #1f2f2b;
  font-size: 28px;
  line-height: 1.35;
  font-weight: 700;
}

section[data-wp-role="article"] h2 {
  margin: 42px 0 18px;
  color: #1f2f2b;
  font-size: 23px;
  line-height: 1.45;
  font-weight: 700;
}

section[data-wp-role="article"] h3 {
  margin: 30px 0 14px;
  color: #263834;
  font-size: 19px;
  line-height: 1.55;
  font-weight: 700;
}

section[data-wp-role="article"] p {
  margin: 18px 0;
}

section[data-wp-role="article"] strong {
  color: #178f72;
  font-weight: 700;
}

section[data-wp-role="article"] a {
  color: #178f72;
  text-decoration: none;
  border-bottom: 1px solid rgba(23, 143, 114, 0.35);
}

section[data-wp-role="article"] blockquote {
  margin: 26px 0;
  padding: 16px 18px;
  border-left: 4px solid #26a98b;
  background: #f4faf7;
  color: #36514b;
}

section[data-wp-role="article"] blockquote p {
  margin: 0;
}

section[data-wp-role="article"] ul,
section[data-wp-role="article"] ol {
  margin: 18px 0;
  padding-left: 1.5em;
}

section[data-wp-role="article"] li {
  margin: 8px 0;
}

section[data-wp-role="article"] code {
  padding: 2px 5px;
  border-radius: 4px;
  background: #edf5f1;
  color: #173d34;
  font-family: Menlo, Monaco, Consolas, "Courier New", monospace;
  font-size: 0.92em;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

section[data-wp-role="article"] pre {
  margin: 24px 0;
  padding: 16px;
  border: 1px solid #d7e5df;
  border-radius: 8px;
  background: #f4faf7;
  color: #24302d;
  line-height: 1.8;
  overflow-x: auto;
}

section[data-wp-role="article"] pre code {
  padding: 0;
  background: transparent;
  color: inherit;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

section[data-wp-role="article"] figure {
  margin: 28px 0;
}

section[data-wp-role="article"] img {
  display: block;
  width: 100%;
  max-width: 100%;
  height: auto;
  border-radius: 8px;
}

section[data-wp-role="article"] figcaption {
  margin-top: 8px;
  color: #6c7f79;
  font-size: 13px;
  line-height: 1.6;
  text-align: center;
}

section[data-wp-role="article"] table {
  display: block;
  width: 100%;
  margin: 24px 0;
  border-collapse: collapse;
  overflow-x: auto;
}

section[data-wp-role="article"] th,
section[data-wp-role="article"] td {
  padding: 10px 12px;
  border: 1px solid #d7e5df;
  text-align: left;
  vertical-align: top;
}

section[data-wp-role="article"] th {
  background: #f4faf7;
  font-weight: 700;
}
`;

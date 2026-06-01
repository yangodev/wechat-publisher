export interface CheckItem {
  code: string;
  message: string;
  path?: string;
}

export interface Checks {
  status: "ready" | "warning" | "blocked" | "failed";
  errors: CheckItem[];
  warnings: CheckItem[];
  infos: CheckItem[];
  summary: {
    asset_count: number;
    missing_asset_count: number;
    remote_asset_count: number;
    absolute_path_count: number;
  };
}

export interface AssetRecord {
  asset_id: string;
  usage: "cover" | "content_image" | "inline_svg" | "video" | "audio" | "unknown";
  path: string;
  original_path: string;
  mime: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  alt?: string;
  caption?: string;
  sha256?: string;
  wechat: {
    url: string | null;
    media_id: string | null;
  };
}

export interface CoverRecord {
  asset_id: string;
  path: string;
  original_path: string;
  mime: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  alt: string;
  wechat: {
    thumb_media_id: string | null;
    url: string | null;
  };
}

export interface ArticlePackage {
  schema_version: "0.1";
  package_id: string;
  created_at: string;
  generator: {
    name: "wechat-renderer" | "wechat-publisher";
    version: string;
    mode: "local-render";
  };
  source: {
    markdown_path: string;
    metadata_path: string | null;
    theme_path: string | null;
    base_dir: string;
    content_hash: string;
  };
  article: {
    title: string;
    author: string;
    digest: string;
    source_url: string;
    tags: string[];
    need_open_comment: boolean;
    only_fans_can_comment: boolean;
  };
  theme: {
    name: string;
    version: string;
    source_path: string | null;
    inline: boolean;
  };
  content: {
    article_html_path: string;
    preview_html_path: string | null;
    content_html: string;
    text_excerpt: string;
    word_count: number;
  };
  cover: CoverRecord | null;
  assets: AssetRecord[];
  checks: Checks;
  publish_targets: Array<{
    platform: "wechat_mp";
    mode: "draft";
    account_id: string | null;
    status: "not_started";
  }>;
  extensions: Record<string, unknown>;
}

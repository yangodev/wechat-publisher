import type { CheckItem } from "./types.js";

interface DiagnosticInput {
  code: string;
  message: string;
}

interface CenterErrorPayload {
  error?: string;
  message?: string;
  errmsg?: string;
}

export class DiagnosticError extends Error {
  readonly diagnosticCode: string;

  constructor(input: DiagnosticInput) {
    super(input.message);
    this.name = "DiagnosticError";
    this.diagnosticCode = input.code;
  }
}

export function diagnoseDraftError(error: unknown): CheckItem {
  if (error instanceof DiagnosticError) {
    return {
      code: error.diagnosticCode,
      message: error.message,
    };
  }

  return {
    code: "draft.failed",
    message: sanitizeDiagnosticMessage(error instanceof Error ? error.message : String(error)),
  };
}

export function createWechatDiagnosticError(
  stage: string,
  errcode?: number,
  errmsg?: string,
  target?: string,
): DiagnosticError {
  const suffix = target ? ` 目标：${target}。` : "";
  const raw = formatRawWechatError(errcode, errmsg);

  if (errcode === 40164) {
    return new DiagnosticError({
      code: "wechat.ip_allowlist",
      message: `原因：当前请求 IP 不在微信公众号 IP 白名单。${raw}${suffix}下一步：把当前公网 IP 加到公众号后台的 IP 白名单；如果使用 center 模式，请确认中心服务固定 IP 已加入白名单。`,
    });
  }

  if (errcode === 40013) {
    return new DiagnosticError({
      code: "wechat.invalid_app_id",
      message: `原因：微信公众号 AppID 无效。${raw}${suffix}下一步：检查本地配置里的 AppID 是否来自同一个公众号。`,
    });
  }

  if (errcode === 40125) {
    return new DiagnosticError({
      code: "wechat.invalid_app_secret",
      message: `原因：微信公众号 AppSecret 无效。${raw}${suffix}下一步：重新复制公众号后台的 AppSecret；如果使用 center 模式，请更新中心服务账号配置。`,
    });
  }

  if (errcode === 40001) {
    return new DiagnosticError({
      code: "wechat.invalid_credential",
      message: `原因：微信 access_token 无效或已过期，也可能是 AppSecret 不匹配。${raw}${suffix}下一步：重试一次；如果仍失败，检查 AppID/AppSecret 或重新生成中心 token。`,
    });
  }

  if (errcode === 48001) {
    return new DiagnosticError({
      code: "wechat.api_unauthorized",
      message: `原因：当前公众号没有调用该微信接口的权限。${raw}${suffix}下一步：确认公众号类型、认证状态和接口权限是否支持素材上传和草稿箱 API。`,
    });
  }

  if (errcode === 45009) {
    return new DiagnosticError({
      code: "wechat.rate_limited",
      message: `原因：微信接口调用次数达到上限。${raw}${suffix}下一步：稍后重试，或减少重复草稿/素材上传。`,
    });
  }

  return new DiagnosticError({
    code: `wechat.${normalizeStage(stage)}_failed`,
    message: `${stageLabel(stage)}失败。${raw}${suffix}下一步：查看微信 errcode/errmsg；如果无法判断，先用 --submit-preview 检查提交内容，再重试。`,
  });
}

export function createCenterDiagnosticError(error?: string, message?: string): DiagnosticError {
  const detail = sanitizeDiagnosticMessage(message ?? error ?? "Center token response did not include access_token.");

  if (error === "account_expired") {
    return new DiagnosticError({
      code: "center.account_expired",
      message: `原因：Center 账号不可用或已过期。详情：${detail} 下一步：检查 Center 账号状态，或切换到 local 模式并配置自己的 AppID/AppSecret 与 IP 白名单。`,
    });
  }

  if (error === "account_disabled") {
    return new DiagnosticError({
      code: "center.account_disabled",
      message: `原因：Center 账号已被禁用。详情：${detail} 下一步：联系服务提供方恢复账号，或切换到 local 模式。`,
    });
  }

  if (error === "quota_exceeded" || error === "rate_limited") {
    return new DiagnosticError({
      code: "center.rate_limited",
      message: `原因：Center 服务触发使用频率或风控限制。详情：${detail} 下一步：稍后重试；如果持续出现，联系服务提供方检查账号状态，或临时切换到 local 模式。`,
    });
  }

  if (error === "unauthorized") {
    return new DiagnosticError({
      code: "center.unauthorized",
      message: `原因：Center API key 缺失或不正确。详情：${detail} 下一步：检查配置文件中的 center.apiKey，必要时重新生成 API key。`,
    });
  }

  if (error === "forbidden") {
    return new DiagnosticError({
      code: "center.forbidden",
      message: `原因：Center API key 无权访问当前 account_id。详情：${detail} 下一步：检查 center.account 是否与该 API key 属于同一个账号。`,
    });
  }

  if (error === "invalid_request") {
    return new DiagnosticError({
      code: "center.invalid_request",
      message: `原因：Center 请求参数不完整或格式错误。详情：${detail} 下一步：检查 center.account、center.url 和客户端版本。`,
    });
  }

  return new DiagnosticError({
    code: "center.token_failed",
    message: `原因：Center token 服务没有返回可用 access_token。详情：${detail} 下一步：检查 Center 服务状态、账号状态和 API key。`,
  });
}

export function createHttpDiagnosticError(stage: string, status: number, payload: unknown): DiagnosticError {
  const centerPayload = payload as CenterErrorPayload;

  if (stage === "token.center.fetch") {
    if (status === 404) {
      return new DiagnosticError({
        code: "center.not_found",
        message: "原因：Center 服务地址不正确，/v1/wechat/token 不存在。下一步：检查 center.url 是否填成了正确的服务根地址，例如 https://api.yango.dev。",
      });
    }

    if (status >= 500) {
      return new DiagnosticError({
        code: "center.unavailable",
        message: `原因：Center 服务暂时不可用，HTTP ${status}。下一步：稍后重试，或检查中心服务部署状态。`,
      });
    }

    if (centerPayload?.error) {
      return createCenterDiagnosticError(centerPayload.error, centerPayload.message ?? centerPayload.errmsg);
    }
  }

  return new DiagnosticError({
    code: `${normalizeStage(stage)}.http_${status}`,
    message: `${stageLabel(stage)}失败，HTTP ${status}。下一步：检查网络、服务地址和账号权限。`,
  });
}

export function createInvalidJsonDiagnosticError(stage: string): DiagnosticError {
  return new DiagnosticError({
    code: `${normalizeStage(stage)}.invalid_json`,
    message: `${stageLabel(stage)}失败：接口返回的不是合法 JSON。下一步：检查服务地址是否填错，或确认反向代理没有返回 HTML 错误页。`,
  });
}

export function sanitizeDiagnosticMessage(value: string): string {
  return value
    .replace(/access_token=[^&\s]+/gi, "access_token=[redacted]")
    .replace(/secret=[^&\s]+/gi, "secret=[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]");
}

function formatRawWechatError(errcode?: number, errmsg?: string): string {
  if (typeof errcode === "number" || errmsg) {
    return `微信返回：${errcode ?? "unknown"} ${sanitizeDiagnosticMessage(errmsg ?? "")}。`;
  }
  return "微信返回格式异常。";
}

function normalizeStage(stage: string): string {
  return stage.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toLowerCase();
}

function stageLabel(stage: string): string {
  switch (stage) {
    case "token.local.fetch":
      return "获取本地微信 token";
    case "token.center.fetch":
      return "获取 Center token";
    case "content_image.upload":
      return "上传正文图片";
    case "cover.upload":
      return "上传封面图";
    case "draft.add":
      return "创建微信草稿";
    default:
      return stage;
  }
}

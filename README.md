# WeChat Publisher

WeChat Publisher 是一个本地 CLI，用来把 Markdown 文章渲染成适合微信公众号草稿箱的 HTML，生成本地预览，打包图片素材，并创建微信公众号草稿。

## 范围

v0.1 是本地渲染与打包：

- 将 Markdown 渲染为 `preview.html` 和 `article.html`
- 将本地素材复制到 `dist/assets`
- 生成 `article-package.json`
- 生成 `publish-report.json`
- 输出错误和警告

v0.1 不调用微信 API，不登录，不上传素材，不保存 token，也不依赖中心服务。

v0.2 增加微信公众号草稿箱发布能力，并支持两种 token 模式：

- `local`：使用用户自己的 `WECHAT_MP_APP_ID` 和 `WECHAT_MP_APP_SECRET`。token 获取、图片上传和草稿创建都在本地完成。
- `center`：从中心服务获取短期 token。图片上传和草稿创建仍然在本地完成。

在这个设计里，中心服务只提供 token，不代理文章上传、图片上传或草稿创建。文章 HTML、图片、封面和本地路径默认都留在用户电脑上。

更多设计说明：

- `docs/quickstart.md`：外部用户 10 分钟跑通指南
- `docs/v0.2-draft-api-token-modes.md`：草稿箱发布与 token 模式设计
- `docs/distribution.md`：开源 Skill 与 CLI 包分发方式

## 分发方式

CLI 源码仓库：

```txt
github.com/yangodev/wechat-publisher
```

Codex Skill 适配器单独放在：

```txt
github.com/yangodev/skills
```

Skill 很轻，只告诉 Codex 如何使用 CLI，不包含 CLI 的完整实现。

从 npm 安装 CLI：

```bash
npm install -g @yangodev/wechat-publisher
wechat-publisher --help
```

第一次使用可以先按 `docs/quickstart.md` 跑通本地检查和草稿提交预览。

本地测试发包：

```bash
npm run pack:cli
```

在用户机器上安装生成的本地包：

```bash
npm install -g ./release/yangodev-wechat-publisher-0.3.0.tgz
wechat-publisher --help
```

## 本地配置

个人使用时，账号配置放在本机私有配置文件中。推荐用 `init` 初始化。

本地 AppID/AppSecret 配置：

```bash
npm run dev -- init \
  --mode local \
  --app-id wx_your_app_id \
  --app-secret your_app_secret \
  --author "作者名称"
```

中心 token 配置：

```bash
npm run dev -- init \
  --mode center \
  --center-url https://api.yango.dev \
  --account acct_xxx \
  --center-api-key your_center_api_key \
  --author "作者名称"
```

`init` 会写入 `wechat-publisher.config.json`，终端只打印脱敏后的摘要。需要覆盖已有配置时，加 `--force`。

也可以手动复制示例配置：

```bash
cp wechat-publisher.config.example.json wechat-publisher.config.json
```

`wechat-publisher.config.json` 已被 git 忽略，可以保存只属于本机的密钥：

```json
{
  "wechat": {
    "tokenMode": "local",
    "appId": "wx_your_app_id",
    "appSecret": "your_app_secret",
    "author": "作者名称",
    "original": true
  }
}
```

命令行参数和环境变量仍然可以覆盖配置文件。

## 常用命令

```bash
npm install
npm run build
npm run check
npm run pack:cli
npm run smoke:diagnostics
npm run visual:install
npm run dev -- init --mode local --app-id wx_xxx --app-secret secret --author "作者名称"
npm run dev -- render fixtures/basic-article/article.md --out fixtures/basic-article/dist
npm run dev -- check fixtures/basic-article/article.md
npm run dev -- package fixtures/basic-article/article.md --out fixtures/basic-article/dist
npm run dev -- verify fixtures/basic-article/article.md --out fixtures/basic-article/dist-verify
npm run dev -- draft fixtures/basic-article/article.md --out fixtures/basic-article/dist-draft --dry-run
npm run dev -- draft fixtures/basic-article/article.md --out fixtures/basic-article/dist-draft --token-mode local --dry-run
npm run fixture:visual
```

构建后可以直接运行编译产物：

```bash
node dist/cli.js render fixtures/basic-article/article.md --out fixtures/basic-article/dist
```

## 输出文件

`render` 会写入：

- `preview.html`
- `article.html`
- `article-package.json`
- `publish-report.json`
- `assets/`

用浏览器打开 `preview.html` 做视觉检查。`article.html` 是后续交给微信编辑器或 API 的正文片段，故意不包含完整 HTML 外壳。

`package` 会写入同样的打包素材，但不生成 `preview.html`。

`check` 会校验输入内容；如果发现阻塞错误，退出码为 `2`。

`verify` 会运行完整的本地发布前检查：

```bash
npm run dev -- verify fixtures/basic-article/article.md --out fixtures/basic-article/dist-verify
```

它会渲染文章，写入正常的打包输出，打开 Chromium 检查 `preview.html`，截取桌面端和移动端截图，并生成 `visual-report.json`。

## 创建草稿

正常的一条命令草稿流程：

```bash
npm run dev -- draft article.md --out dist
```

这个命令会创建微信公众号草稿，不会公开发表文章。

`draft article.md` 的流程是：

```txt
渲染 -> 打包校验 -> 创建草稿
```

如果只想检查提交给微信的 HTML 和 payload，不实际调用微信，可以使用：

```bash
npm run dev -- draft article.md --out dist --dry-run --submit-preview
```

它会写入正常渲染输出和草稿相关输出：

- `preview.html`
- `article.html`
- `article-package.json`
- `publish-report.json`
- `wechat-submit.html`
- `wechat-draft-payload.json`
- `wechat-draft-report.json`

`draft` 也可以读取已有的 `article-package.json` 或已渲染输出目录。它支持两种 token 模式：

```bash
WECHAT_MP_APP_ID=xxx WECHAT_MP_APP_SECRET=xxx \
  WECHAT_MP_AUTHOR="作者名称" \
  npm run dev -- draft dist/article-package.json --token-mode local

WECHAT_PUBLISHER_CENTER_URL=https://api.example.com WECHAT_PUBLISHER_CENTER_API_KEY=xxx \
  npm run dev -- draft dist/article-package.json --token-mode center --account acct_xxx --author "作者名称"
```

使用 `--dry-run` 可以在不调用微信的情况下校验文章包和 token 模式配置：

```bash
WECHAT_MP_APP_ID=dummy WECHAT_MP_APP_SECRET=dummy \
  npm run dev -- draft fixtures/basic-article/article.md --out fixtures/basic-article/dist-draft --token-mode local --dry-run
```

如果要查看最终提交内容，加 `--submit-preview`：

```bash
npm run dev -- draft fixtures/basic-article/article.md --out fixtures/basic-article/dist-draft --dry-run --submit-preview
```

这会写入：

- `wechat-submit.html`
- `wechat-draft-payload.json`
- `wechat-draft-report.json`

`draft` 会生成 `wechat-draft-report.json`。无论使用哪种 token 模式，图片上传和草稿创建都在本地完成；中心服务只返回短期 token。

如果已经有 `wechat-publisher.config.json`，常用命令就是：

```bash
npm run dev -- draft article.md --out dist
```

`publish` 预留给未来的公开发表流程，用来显式确认并发表已有微信草稿。v0.3 还未实现。

提交到微信前，`draft` 会把标题和封面当作微信草稿字段处理：

- 移除正文中与文章标题相同的第一个 H1
- 移除正文顶部与配置封面相同的图片
- 将代码块统一为浅色样式
- 清理列表空白，避免微信编辑器出现空项目符号
- 作者来自 `--author`、`WECHAT_MP_AUTHOR`、`WECHAT_PUBLISHER_AUTHOR` 或文章包元数据
- 默认请求原创字段；如需关闭，使用 `--no-original`

## 草稿诊断

`draft` 会把可操作的失败原因写入 `wechat-draft-report.json`，并在终端打印同样安全的摘要。诊断信息包含原因和下一步，不会把 AppSecret、中心 API key 或 `access_token` 写入报告。

常见诊断码：

- `wechat.ip_allowlist`：调用方 IP 不在微信公众号 IP 白名单。
- `wechat.invalid_app_id`：配置的 AppID 无效，或不属于目标公众号。
- `wechat.invalid_app_secret`：配置的 AppSecret 无效。
- `wechat.invalid_credential`：token 无效或已过期；先重试，再检查 AppID/AppSecret 或中心 token 生成。
- `wechat.api_unauthorized`：公众号没有所需微信 API 权限。
- `center.account_expired`：中心账号不可用或已过期。
- `center.account_disabled`：中心账号已被禁用。
- `center.unauthorized`：中心 API key 缺失或错误。
- `center.forbidden`：API key 不属于请求的中心账号。
- `center.not_found`：中心服务 URL 配置错误。
- `center.unavailable`：中心服务暂时不可用。
- `center.rate_limited`：触发频率或风控限制。

## 视觉检查

对任意渲染输出目录运行视觉检查：

```bash
npm run visual:qa -- fixtures/basic-article/dist
```

它会用 Chromium 打开 `preview.html`，截取桌面端和移动端截图，检查控制台错误、图片加载、整页横向溢出和明显元素溢出。输出文件：

- `visual-report.json`
- `visual-screenshots/desktop.png`
- `visual-screenshots/mobile.png`

## 许可证

本项目源码使用 MIT License，见 `LICENSE`。

YanGo、`yangodev` 名称及相关品牌资产不在 MIT License 授权范围内，见 `TRADEMARKS.md`。

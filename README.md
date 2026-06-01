# WeChat Publisher

WeChat Publisher 是一个本地 CLI，用来从已渲染的 `article-package.json` 创建微信公众号草稿。

它只做发布侧工作，不解析 Markdown，不渲染 HTML，不生成预览页。Markdown 渲染请使用独立仓库 `github.com/yangodev/wechat-renderer`。

## 能力边界

`wechat-publisher` 负责：

- 初始化本地发布配置
- 诊断微信公众号 token 模式配置
- 读取 `article-package.json` 或包含该文件的目录
- 上传正文图片和封面图到微信
- 创建微信公众号草稿
- 输出 `wechat-draft-report.json`

`wechat-publisher` 不负责：

- Markdown 渲染
- 文章配图生成
- 本地视觉预览
- 公开群发
- 浏览器登录自动化
- Cookie 或 session 保存

## 安装

```bash
npm install -g @yangodev/wechat-publisher
wechat-publisher --help
```

通常和 renderer 一起使用：

```bash
npm install -g @yangodev/wechat-renderer @yangodev/wechat-publisher
wechat-renderer render article.md --out dist
wechat-publisher draft dist
```

## 配置

本地 AppID/AppSecret 模式：

```bash
wechat-publisher init \
  --mode local \
  --app-id wx_your_app_id \
  --app-secret your_app_secret \
  --author "作者名称"
```

中心 token 模式：

```bash
wechat-publisher init \
  --mode center \
  --center-url https://api.yango.dev \
  --account acct_xxx \
  --center-api-key your_center_api_key \
  --author "作者名称"
```

配置会写入当前目录的 `wechat-publisher.config.json`。这个文件只应该保存在本机，不要提交到 Git 仓库。

## 创建草稿

```bash
wechat-publisher doctor --package dist
wechat-publisher draft dist
```

如果只想检查提交给微信的 HTML 和 payload，不实际调用微信：

```bash
wechat-publisher draft dist --dry-run --submit-preview
```

`draft` 会写入：

- `wechat-submit.html`
- `wechat-draft-payload.json`
- `wechat-draft-report.json`

## 本地开发

```bash
npm install
npm run check
npm run build
npm run smoke:publisher
npm run smoke:doctor
npm run smoke:diagnostics
npm run fixture:draft:dry-run
```

构建后直接运行：

```bash
node dist/publisher-cli.js draft fixtures/draft-dry-run/package --dry-run --submit-preview
```

## Token 模式

- `local`：使用用户自己的 `WECHAT_MP_APP_ID` 和 `WECHAT_MP_APP_SECRET`。token 获取、图片上传和草稿创建都在本地完成。
- `center`：从中心服务获取短期 token。图片上传和草稿创建仍然在本地完成。

中心服务只提供 token，不代理文章上传、图片上传或草稿创建。文章 HTML、图片、封面和本地路径默认都留在用户电脑上。

## 许可证

本项目源码使用 MIT License，见 `LICENSE`。

YanGo、`yangodev` 名称及相关品牌资产不在 MIT License 授权范围内，见 `TRADEMARKS.md`。

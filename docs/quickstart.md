# 10 分钟跑通 WeChat Publisher

这份指南面向第一次使用 `@yangodev/wechat-publisher` 的用户。目标是从已渲染的文章包创建微信公众号草稿提交预览。

## 1. 安装 CLI

```bash
npm install -g @yangodev/wechat-publisher
wechat-publisher --version
wechat-publisher --help
```

如果你还没有文章包，先安装 renderer：

```bash
npm install -g @yangodev/wechat-renderer
wechat-renderer render article.md --out dist
```

## 2. 准备文章包

`wechat-publisher` 的输入必须是：

- `article-package.json`
- 或包含 `article-package.json` 的目录

它不接受 Markdown 文件。Markdown 到文章包的转换由 `@yangodev/wechat-renderer` 完成。

## 3. 本地诊断

```bash
wechat-publisher doctor --package dist
```

还没配置真实公众号时，它可能提示配置文件不存在，不影响 dry-run。

## 4. 生成草稿提交预览

`--dry-run` 不会调用微信接口，但会按草稿提交前的规则生成 HTML 和 payload。

```bash
WECHAT_MP_APP_ID=dummy WECHAT_MP_APP_SECRET=dummy \
  wechat-publisher draft dist --dry-run --submit-preview
```

成功后会生成：

- `wechat-submit.html`：提交微信前的正文预览
- `wechat-draft-payload.json`：草稿 payload 预览
- `wechat-draft-report.json`：草稿流程报告

## 5. 配置真实微信公众号草稿箱

如果要创建真实微信公众号草稿，需要先在公众号后台拿到 AppID 和 AppSecret，并把本机公网 IP 加入微信公众号 IP 白名单。

初始化本地配置：

```bash
wechat-publisher init \
  --mode local \
  --app-id wx_your_app_id \
  --app-secret your_app_secret \
  --author "作者名称"
```

创建草稿：

```bash
wechat-publisher draft dist
```

这个命令只创建微信公众号草稿，不会公开发表文章。

## 6. 使用中心 token 模式

```bash
wechat-publisher init \
  --mode center \
  --center-url https://api.example.com \
  --account acct_xxx \
  --center-api-key your_center_api_key \
  --author "作者名称"
```

`center` 模式只从中心服务获取短期 token。图片上传和草稿创建仍然在本机完成。

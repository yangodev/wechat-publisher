# 10 分钟跑通

这份指南面向第一次使用 `wechat-publisher` 的用户。目标是先在本地跑通渲染、检查和草稿提交预览，再按需配置真实微信公众号草稿箱。

## 1. 安装 CLI

需要本机已经安装 Node.js 和 npm。

```bash
npm install -g @yangodev/wechat-publisher
wechat-publisher --version
wechat-publisher --help
```

## 2. 准备一篇测试文章

新建一个空目录，然后写入测试文章和占位封面：

```bash
mkdir wechat-publisher-demo
cd wechat-publisher-demo
mkdir -p assets
```

生成一个本地 PNG 占位封面：

```bash
node -e "require('fs').writeFileSync('assets/cover.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l9m7ZQAAAABJRU5ErkJggg==','base64'))"
```

写入 `article.md`：

````bash
cat > article.md <<'EOF'
---
title: 新 AI 工具值不值得进工作流，看这 6 个问题
digest: 工具不是收藏品，而是让下一次工作更容易的节点。
author: YanGo
cover: ./assets/cover.png
---

# 新 AI 工具值不值得进工作流，看这 6 个问题

不要看它多火，先看它能不能成为稳定节点。

## 先问 6 个问题

一个工具值得进入工作流，至少要满足下面几件事中的两件：

- 减少重复劳动
- 降低出错率
- 让产出更稳定
- 让资料更容易归档
- 让反馈更容易回写
- 能被下一次任务复用

```txt
输入 -> 处理 -> 输出 -> 复盘
```
EOF
````

这张占位封面只用于本地跑通流程。正式草稿请换成自己的 PNG 或 JPEG 封面。

## 3. 本地检查

```bash
wechat-publisher check article.md
```

正常情况下会看到：

```txt
status: ready
errors: 0
warnings: 0
```

## 4. 生成草稿提交预览

`--dry-run` 不会调用微信接口，但会按草稿提交前的规则生成 HTML 和 payload。

```bash
WECHAT_MP_APP_ID=dummy WECHAT_MP_APP_SECRET=dummy \
  wechat-publisher draft article.md --out dist --dry-run --submit-preview
```

成功后会生成：

- `dist/preview.html`：本地预览
- `dist/article.html`：微信公众号正文 HTML 片段
- `dist/article-package.json`：文章包
- `dist/publish-report.json`：本地检查报告
- `dist/wechat-submit.html`：提交微信前的正文预览
- `dist/wechat-draft-payload.json`：草稿 payload 预览
- `dist/wechat-draft-report.json`：草稿流程报告

可以直接用浏览器打开：

```bash
open dist/preview.html
open dist/wechat-submit.html
```

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

配置会写入当前目录的 `wechat-publisher.config.json`。这个文件只应该保存在本机，不要提交到 Git 仓库。

创建草稿：

```bash
wechat-publisher draft article.md --out dist
```

这个命令只创建微信公众号草稿，不会公开发表文章。

## 6. 使用中心 token 模式

如果你已经有可用的中心 token 服务，也可以初始化为 `center` 模式：

```bash
wechat-publisher init \
  --mode center \
  --center-url https://api.example.com \
  --account acct_xxx \
  --center-api-key your_center_api_key \
  --author "作者名称"
```

`center` 模式只从中心服务获取短期 token。图片上传和草稿创建仍然在本机完成。

## 7. 可选：安装 Codex Skill

Skill 不是 CLI 本体，只负责告诉 Codex 如何调用 `wechat-publisher`。

在你的项目目录里执行：

```bash
git clone https://github.com/yangodev/skills.git /tmp/yangodev-skills
mkdir -p .codex/skills
cp -R /tmp/yangodev-skills/skills/wechat-publisher .codex/skills/
```

然后在 Codex 中让它使用 `wechat-publisher` Skill 处理文章发布检查或草稿生成。

## 常见问题

- `cover.missing`：文章没有配置封面。微信草稿需要封面图。
- `cover.unsupported_svg`：微信草稿 API 不支持 SVG 封面，请改用 PNG 或 JPEG。
- `wechat.ip_allowlist`：本机公网 IP 没有加入微信公众号 IP 白名单。
- `wechat.invalid_app_secret`：AppSecret 不正确，或和 AppID 不匹配。
- `center.unauthorized`：中心 API key 缺失或错误。
- `center.rate_limited`：请求触发频率限制。

诊断报告不会写入 AppSecret、中心 API key 或 `access_token`。

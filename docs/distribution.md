# 分发说明

## 决策

WeChat 发布链路拆成两个源码仓库：

- Renderer 仓库：`github.com/yangodev/wechat-renderer`
- Publisher 仓库：`github.com/yangodev/wechat-publisher`
- Skill 仓库：`github.com/yangodev/skills`，轻量适配器位于 `skills/wechat-publisher/`

`wechat-renderer` 负责 Markdown 到 HTML 预览包。

`wechat-publisher` 负责 HTML 预览包到微信公众号草稿。

两个仓库通过 `article-package.json` 衔接，不共享运行时代码。

## 构建本地安装包

```bash
npm run pack:cli
```

该命令会运行类型检查、清理并构建 `dist/`，然后把安装包写到 `release/`，例如：

```txt
release/yangodev-wechat-publisher-0.4.0.tgz
```

## 发布前检查

```bash
npm run check
npm run build
npm run smoke:publisher
npm run smoke:doctor
npm run smoke:diagnostics
npm run fixture:draft:dry-run
npm run pack:cli
```

然后在干净目录测试安装包：

```bash
npm install -g ./release/yangodev-wechat-publisher-0.4.0.tgz
wechat-publisher --version
wechat-publisher --help
```

## npm 发布

npm 发布由 tag 触发。推送 `v*` tag 后，GitHub Actions 会运行检查、构建和发布侧冒烟测试，并带 provenance 发布到 npm：

```bash
git tag v0.4.0
git push origin v0.4.0
```

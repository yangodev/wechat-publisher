# 分发说明

## 决策

WeChat Publisher 分成两部分分发：

- CLI 仓库：`github.com/yangodev/wechat-publisher`
- Skill 仓库：`github.com/yangodev/skills`，轻量适配器位于 `skills/wechat-publisher/`
- npm 包：`@yangodev/wechat-publisher`

Skill 不内嵌完整 CLI 实现。它假设用户已经安装 CLI，然后调用 `wechat-publisher`。

## CLI 包

构建本地安装包：

```bash
npm run pack:cli
```

该命令会运行类型检查、构建 `dist/`，并把安装包写到 `release/`，例如：

```txt
release/yangodev-wechat-publisher-0.3.1.tgz
```

在用户机器上安装公开包：

```bash
npm install -g @yangodev/wechat-publisher
wechat-publisher --help
```

发布前测试本地包：

```bash
npm install -g ./release/yangodev-wechat-publisher-0.3.1.tgz
wechat-publisher --help
```

安装包包含：

- 编译后的 CLI：`dist/`
- 公开文档：`docs/`
- `LICENSE`
- `TRADEMARKS.md`
- 配置示例
- README 和 package 元数据

安装包不能包含：

- `node_modules/`
- `wechat-publisher.config.json`
- 真实 AppSecret、中心 API key、access_token、Cookie 或草稿 payload
- 生成后的 fixture 输出

## 开源 Skill 仓库

开放的 Skill 放在独立的 `yangodev/skills` 仓库：

```txt
skills/wechat-publisher/
```

推荐用户把 Skill 复制到项目本地：

```bash
mkdir -p .codex/skills
cp -R skills/wechat-publisher .codex/skills/
```

这个 Skill 可以在 GitHub 仓库中公开，也可以复制到任何支持 Codex Skill 的项目中。它只负责包装和指导 CLI 使用。

## 发布检查

分享 CLI 包之前运行：

```bash
npm run check
npm run build
npm run smoke:doctor
npm run smoke:compatibility
npm run smoke:diagnostics
npm run pack:cli
```

然后在干净目录测试安装包：

```bash
npm install -g ./release/yangodev-wechat-publisher-0.3.1.tgz
wechat-publisher --version
wechat-publisher --help
```

## npm 发布

npm 发布由 tag 触发。推送 `v*` tag 后，GitHub Actions 会运行检查、构建、doctor/兼容性/诊断冒烟测试，并带 provenance 发布到 npm：

```bash
git tag v0.3.1
git push origin v0.3.1
```

# 老菜鸟的博客

线上地址：https://old-rookie.pages.dev

在 Obsidian 里写文章，用自带的「博客发布」插件一键发布。网站用 Astro 生成，部署在 Cloudflare Pages，图片存放在 Cloudflare R2。

写作和发布的完整说明见 [docs/写作指南.md](docs/写作指南.md)。

## 目录

```text
src/
  content/blog/      已发布的文章（由插件从 Obsidian 写入，不要手改）
  content/pages/     首页介绍、关于页
  config/site.json   站点设置（由插件的「站点设置」写入）
  components/ layouts/ pages/ styles/   网站模板和样式
  lib/               Markdown 处理（Obsidian 换行规则等）
integrations/
  obsidian-blog-publisher/   Obsidian 插件源码（src/），main.js 是构建产物
  display-font.mjs           构建时裁剪标题字体（霞鹜文楷子集）
  r2-image-host.mjs          /media/* 图片代理
functions/           Cloudflare Pages Functions
scripts/             发布、同步、图床、部署脚本（插件在后台调用）
tests/               自动测试
docs/                写作指南
public/              原样发布的静态文件（_headers 缓存规则等）
```

## 常用命令

```bash
npm ci                      # 安装依赖
npm run dev                 # 本地预览 http://localhost:4321
npm test                    # 运行测试
npm run build               # 构建到 dist/
npm run plugin:build        # 重新打包 Obsidian 插件
npm run obsidian:setup -- "/知识库路径"   # 安装/更新插件到 Obsidian
npm run cloudflare:login    # Cloudflare 授权过期时重新登录
npm run deploy              # 用仓库现有内容重新部署
```

本机配置 `.blog-deploy.json`、`.blog-media.json` 不进 Git。

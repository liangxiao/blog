# 给编码助手的约定

- 先读 README.md 了解目录；写作和发布流程见 docs/写作指南.md。
- `src/content/blog/`、`src/content/pages/`、`src/config/site.json` 由 Obsidian 插件写入，不要直接改；样式和模板改动放在 components / layouts / styles。
- 插件源码在 `integrations/obsidian-blog-publisher/src/`，改完运行 `npm run plugin:build` 生成 main.js，一起提交。
- 改动后运行 `npm test` 和 `npm run build`，都通过再提交。
- 在功能分支上工作，提交 PR；得到作者明确同意后才合并。发布要求仓库停在 main。
- 本地开发服务器用后台模式：`astro dev --background`，用 `astro dev stop` 停止。
- 中文界面文字保持简洁、口语化。

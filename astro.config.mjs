// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	// 上线后改成你的真实网址（RSS 和 sitemap 会用到）
	site: 'https://example.com',
	integrations: [mdx(), sitemap()],
	// 关闭本地预览时页面底部的 Astro 开发工具条
	devToolbar: { enabled: false },
	markdown: {
		// 代码块高亮（Shiki），浅色/深色主题自动跟随系统
		shikiConfig: {
			themes: { light: 'github-light', dark: 'github-dark' },
			wrap: true,
		},
	},
});

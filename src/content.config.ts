import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const blog = defineCollection({
	// 文章放在 src/content/blog/ 目录下，支持 .md 和 .mdx
	loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
	// 文章开头 frontmatter 的字段规则
	schema: ({ image }) =>
		z.object({
			title: z.string(), // 标题（必填）
			description: z.string(), // 一句话简介（必填）
			pubDate: z.coerce.date(), // 发布日期（必填），如 2026-10-20
			updatedDate: z.coerce.date().optional(), // 更新日期（可选）
			heroImage: z.optional(image()), // 封面图（可选）
			tags: z.array(z.string()).default([]), // 标签（可选）
			draft: z.boolean().default(false), // 草稿：true 时不会发布
		}),
});

export const collections = { blog };

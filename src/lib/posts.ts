import { getCollection } from 'astro:content';

/** RSS 始终只包含已发布文章。 */
export async function getPublishedPosts() {
 const posts = await getCollection('blog', ({ data }) => !data.draft);
 return posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

/** 草稿仅在本地开发预览中出现，生产构建不生成草稿路由。 */
export async function getVisiblePosts() {
 const posts = await getCollection('blog', ({ data }) => import.meta.env.DEV || !data.draft);
 return posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

/**
 * 估算阅读时长（分钟）：中文约 400 字/分钟，英文约 200 词/分钟；代码块和图片链接不计入。
 */
export function readingMinutes(markdown = '') {
 const text = markdown
  .replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, ' ')
  .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/[#>*_`~|-]/g, ' ');
 const cjk = (text.match(/[㐀-鿿豈-﫿]/g) || []).length;
 const words = (text.replace(/[㐀-鿿豈-﫿]/g, ' ').match(/[A-Za-z0-9]+/g) || []).length;
 return Math.max(1, Math.round(cjk / 400 + words / 200));
}

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

import { getCollection } from 'astro:content';

/** 获取所有已发布文章（排除草稿），按日期从新到旧排序 */
export async function getPublishedPosts() {
	const posts = await getCollection('blog', ({ data }) => !data.draft);
	return posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

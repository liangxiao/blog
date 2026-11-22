import rss from '@astrojs/rss';
import { SITE_DESCRIPTION, SITE_TITLE, site } from '../consts';
import { getPublishedPosts } from '../lib/posts';

// 输出全文：RSS 阅读器里可以直接读完整文章。正文图片已是图床上的绝对地址。
export async function GET(context) {
	const posts = await getPublishedPosts();
	const absolute = (html) => html.replace(/(src|href)="\/(?!\/)/g, `$1="${new URL('/', context.site).href}`);
	return rss({
		title: SITE_TITLE,
		description: SITE_DESCRIPTION,
		site: context.site,
		customData: `<language>${site.language}</language>`,
		items: posts.map((post) => ({
			title: post.data.title,
			description: post.data.description,
			pubDate: post.data.pubDate,
			link: `/blog/${post.id}/`,
			categories: post.data.tags,
			...(post.rendered?.html ? { content: absolute(post.rendered.html) } : {}),
		})),
	});
}

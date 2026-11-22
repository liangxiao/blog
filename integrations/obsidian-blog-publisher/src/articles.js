// Article discovery, publication status and the pre-publish checklist.
const path = require('path');
const fs = require('fs');

const BLOG_DIR = 'blog';
const RESERVED = new Set(['站点设置', '首页介绍', '关于', '使用说明', '站点管理使用说明']);
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const isArticle = file => Boolean(file && file.extension === 'md' && file.path.startsWith(`${BLOG_DIR}/`) && !file.path.startsWith(`${BLOG_DIR}/assets/`) && !RESERVED.has(file.basename));

function frontmatter(app, file) { return app.metadataCache.getFileCache(file)?.frontmatter || {}; }

// Combines the note's properties, whether the repo already has the post, and the last sync report.
function articleInfo(plugin, file) {
  const fm = frontmatter(plugin.app, file);
  const slug = typeof fm.slug === 'string' ? fm.slug : '';
  const repo = plugin.config.repoPath;
  const published = Boolean(slug && repo && fs.existsSync(path.join(repo, 'src/content/blog', `${slug}.md`)));
  const change = plugin.syncReport?.changes?.find(c => c.id === `article:${slug}` || c.file === file.path);
  let status;
  if (change?.status === 'conflict') status = { id: 'conflict', label: '有冲突' };
  else if (change?.status === 'remote') status = { id: 'remote', label: '仓库有新版' };
  else if (!published) status = { id: 'draft', label: '未发布' };
  else if (change?.status === 'local') status = { id: 'pending', label: '有修改未发布' };
  else status = { id: 'published', label: '已发布' };
  return {
    file, slug, published, status,
    title: typeof fm.title === 'string' && fm.title.trim() ? fm.title.trim() : file.basename,
    description: typeof fm.description === 'string' ? fm.description : '',
    pubDate: fm.pubDate ? String(fm.pubDate) : '',
    tags: Array.isArray(fm.blogTags) ? fm.blogTags : Array.isArray(fm.tags) ? fm.tags : [],
    cover: typeof fm.heroImage === 'string' ? fm.heroImage.trim() : '',
    url: plugin.siteUrl && slug ? new URL(`blog/${encodeURIComponent(slug)}/`, plugin.siteUrl).href : null,
  };
}

function listArticles(plugin) {
  return plugin.app.vault.getMarkdownFiles().filter(isArticle).map(f => articleInfo(plugin, f))
    .sort((a, b) => b.file.stat.mtime - a.file.stat.mtime);
}

// Resolves an image reference from frontmatter/body to something an <img> can display.
function imageUrl(app, raw, sourcePath) {
  const target = String(raw || '').trim().replace(/^!?\[\[|\]\]$/g, '').split('|')[0];
  if (!target) return null;
  if (/^https?:\/\//i.test(target)) return target;
  const file = app.metadataCache.getFirstLinkpathDest(target, sourcePath) || app.vault.getAbstractFileByPath(target);
  return file && 'extension' in file ? app.vault.getResourcePath(file) : null;
}

// Fast, local checks that mirror the server-side rules in scripts/obsidian.mjs#prepare.
// `level: 'error'` blocks publishing, 'warn' is advisory.
function checklist(app, info) {
  const fm = frontmatter(app, info.file);
  const items = [];
  const add = (ok, label, detail, level = 'error', field = null) => items.push({ ok, label, detail, level, field });
  add(typeof fm.title === 'string' && fm.title.trim().length > 0, '标题', fm.title ? '' : '还没有标题', 'error', 'title');
  add(typeof fm.description === 'string' && fm.description.trim().length > 0, '摘要', '显示在文章列表和分享卡片中', 'error', 'description');
  add(typeof fm.slug === 'string' && SLUG.test(fm.slug), '网址', fm.slug ? (SLUG.test(fm.slug) ? `/blog/${fm.slug}/` : '只能用小写字母、数字和短横线') : '还没有设置', 'error', 'slug');
  add(Boolean(fm.pubDate) && !Number.isNaN(Date.parse(String(fm.pubDate))), '发布日期', fm.pubDate ? String(fm.pubDate) : '还没有日期', 'error', 'pubDate');
  add(Boolean(info.cover), '封面', info.cover ? '' : '没有封面，将使用默认封面', 'warn', 'heroImage');
  const cache = app.metadataCache.getFileCache(info.file);
  const images = (cache?.embeds || []).filter(e => /\.(png|jpe?g|webp|gif|avif|svg)$/i.test(e.link.split('|')[0]));
  const missing = images.filter(e => !app.metadataCache.getFirstLinkpathDest(e.link.split('|')[0].split('#')[0], info.file.path));
  const noteLinks = (cache?.links || []).filter(l => l.original.startsWith('[['));
  const noteEmbeds = (cache?.embeds || []).filter(e => !images.includes(e));
  add(missing.length === 0, `图片 ${images.length} 张`, missing.length ? `找不到：${missing.map(m => m.link).join('、')}` : '', 'error');
  add(noteLinks.length === 0 && noteEmbeds.length === 0, '私人笔记链接', noteLinks.length + noteEmbeds.length ? `正文有 ${noteLinks.length + noteEmbeds.length} 处 [[双链]]，发布前需改成普通文字或公开链接` : '', 'error');
  return items;
}

// Suggests a URL slug: ASCII words from the title, otherwise the date.
function suggestSlug(title, existing = new Set()) {
  const ascii = title.normalize('NFKD').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').trim().split(/[\s-]+/).filter(Boolean).slice(0, 8).join('-');
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  let base = ascii.length >= 3 ? ascii : `post-${date}`;
  let slug = base, n = 2;
  while (existing.has(slug)) slug = `${base}-${n++}`;
  return slug;
}

function existingSlugs(plugin) {
  const slugs = new Set(listArticles(plugin).map(a => a.slug).filter(Boolean));
  try { for (const name of fs.readdirSync(path.join(plugin.config.repoPath, 'src/content/blog'))) slugs.add(name.replace(/\.mdx?$/, '')); } catch { /* repo unavailable */ }
  return slugs;
}

module.exports = { BLOG_DIR, RESERVED, SLUG, isArticle, articleInfo, listArticles, checklist, imageUrl, suggestSlug, existingSlugs, frontmatter };

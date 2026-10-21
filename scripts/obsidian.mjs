import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function run(bin, args, cwd = root, capture = false) {
 const r = spawnSync(bin, args, { cwd, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' });
 if (r.error || r.status !== 0) throw new Error(r.error?.message || r.stderr || `${bin} 执行失败（${r.status}）`);
 return capture ? r.stdout.trim() : '';
}
function within(base, file) { const rel = path.relative(base, file); return rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel); }
function allFiles(dir) {
 return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.name.startsWith('.') ? [] : e.isDirectory() ? allFiles(path.join(dir, e.name)) : e.isFile() ? [path.join(dir, e.name)] : []);
}
export function prepare(vault, source, options = {}) {
 vault = fs.realpathSync(vault); source = fs.realpathSync(source);
 if (!within(path.join(vault, 'blog'), source) || !source.endsWith('.md')) throw new Error('只允许发布当前知识库 blog 文件夹中的 Markdown 文章。');
 const original = fs.readFileSync(source, 'utf8');
 const match = original.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
 if (!match && !options.page) throw new Error('请先使用「博客：新建文章」创建带文章属性的文件。');
 const doc = parseDocument(match?.[1] || '');
 if (doc.errors.length) throw new Error(doc.errors[0].message);
 const slug = options.slug || doc.get('slug');
 if (typeof slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('请填写 slug：英文小写、数字和短横线，发布后保持不变。');
 if (!options.page) for (const k of ['title', 'description']) if (typeof doc.get(k) !== 'string' || !doc.get(k).trim()) throw new Error(`请填写文章属性 ${k}。`);
 if (!options.page && (!doc.get('pubDate') || Number.isNaN(Date.parse(String(doc.get('pubDate')))))) throw new Error('请填写有效的 pubDate 日期。');
 const assets = new Map();
 let index;
 function resolveAsset(raw) {
  let target = decodeURIComponent(raw.trim().replace(/^<|>$/g, ''));
  if (/^https?:\/\//i.test(target)) return target;
  target = target.split('#')[0];
  const direct = [path.resolve(path.dirname(source), target), path.resolve(vault, target)];
  let found = direct.find(f => within(vault, f) && fs.existsSync(f) && fs.statSync(f).isFile());
  if (!found) {
   index ??= allFiles(vault);
   const matches = index.filter(f => path.relative(vault, f) === target || path.basename(f) === target);
   if (matches.length !== 1) throw new Error(`图片不存在或重名，请使用完整相对路径：${target}`);
   found = matches[0];
  }
  found = fs.realpathSync(found);
  if (!within(vault, found)) throw new Error(`图片不能指向知识库外：${target}`);
  const ext = path.extname(found).toLowerCase();
  if (!['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.svg'].includes(ext)) throw new Error(`只同步图片，不发布笔记嵌入或其他附件：${target}`);
  const data = fs.readFileSync(found);
  const name = crypto.createHash('sha256').update(data).digest('hex').slice(0, 20) + ext;
  const relative = options.page ? `public/site/${name}` : `src/assets/blog/${slug}/${name}`;
  assets.set(relative, data);
  return options.page ? `/site/${name}` : `../../assets/blog/${slug}/${name}`;
 }
 // Protect fenced and inline code so examples remain untouched.
 const saved = [];
 let body = original.slice(match?.[0].length || 0).replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, s => `\u0000CODE${saved.push(s)-1}\u0000`).replace(/`[^`\n]+`/g, s => `\u0000CODE${saved.push(s)-1}\u0000`);
 body = body.replace(/!\[\[([^\]]+)\]\]/g, (_, value) => {
  const [target, label] = value.split('|');
  const alt = label && !/^\d+(x\d+)?$/.test(label) ? label : path.basename(target, path.extname(target));
  return `![${alt.replace(/[\[\]]/g, '')}](${resolveAsset(target)})`;
 });
 body = body.replace(/!\[([^\]]*)\]\((<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\)/g, (full, alt, target) => {
  if (assets.has(`public${target}`) || [...assets.keys()].some(f => target === '../../' + f.slice(4))) return full;
  return `![${alt}](${resolveAsset(target)})`;
 });
 // Reference-style images have ambiguous shared definitions; fail rather than silently omit them.
 if (/!\[[^\]]*\]\s*\[[^\]]*\]/.test(body)) throw new Error('请将引用式图片改为 ![说明](路径) 或 ![[图片名]] 后发布。');
 if (/\[\[[^\]]+\]\]/.test(body)) throw new Error('正文有指向私人笔记的双链。请改成普通文字或公开链接；不会自动发布被链接的笔记。');
 body = body.replace(/\u0000CODE(\d+)\u0000/g, (_, n) => saved[Number(n)]);
 const output = options.page ? { title: options.title || '页面', description: options.description || '页面内容' } : {};
 if (!options.page) for (const k of ['title','description','pubDate','updatedDate','tags']) if (doc.has(k)) output[k] = doc.get(k);
 if (!options.page && doc.get('heroImage')) output.heroImage = resolveAsset(String(doc.get('heroImage')));
 // Only blog metadata is exported; private source/status/etc. properties stay in Obsidian.
 const build = (draft) => {
  const out = parseDocument('');
  for (const [key, value] of Object.entries(output)) out.set(key, value);
  if (!options.page) out.set('draft', draft);
  return `---\n${out.toString()}---\n${body}`;
 };
 return { slug, source, original, doc, bodyOriginal: original.slice(match?.[0].length || 0), assets, build, resolveAsset };
}
function writeArticle(plan, dest, draft) {
 const article = `src/content/blog/${plan.slug}.md`;
 fs.mkdirSync(path.dirname(path.join(dest, article)), { recursive: true });
 fs.writeFileSync(path.join(dest, article), plan.build(draft));
 for (const [file, data] of plan.assets) { fs.mkdirSync(path.dirname(path.join(dest, file)), { recursive: true }); fs.writeFileSync(path.join(dest, file), data); }
 return [article, ...plan.assets.keys()];
}
async function main() {
 const [action, vault, source] = process.argv.slice(2);
 if (!['preview','publish','check'].includes(action) || !vault || !source) throw new Error('用法：node scripts/obsidian.mjs preview|publish|check VAULT ARTICLE');
 const plan = prepare(vault, source);
 console.log(`文章：${plan.doc.get('title')}\n网址：/blog/${plan.slug}/\n引用图片：${plan.assets.size} 张`);
 if (action === 'check') return;
 if (action === 'preview') {
  const dest = path.join(root, '.writing-preview');
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(path.join(root,'src'), path.join(dest,'src'), { recursive: true });
  fs.cpSync(path.join(root,'public'), path.join(dest,'public'), { recursive: true });
  for (const name of ['astro.config.mjs','tsconfig.json','package.json']) fs.copyFileSync(path.join(root,name),path.join(dest,name));
  if (!fs.existsSync(path.join(dest,'node_modules'))) fs.symlinkSync(path.join(root,'node_modules'),path.join(dest,'node_modules'),'dir');
  writeArticle(plan, dest, true);
  run('npx',['astro','dev','--background','--host','127.0.0.1','--port','4322'],dest);
  run('open',[`http://127.0.0.1:4322/blog/${plan.slug}/`]);
  return;
 }
 if (run('git',['branch','--show-current'],root,true) !== 'main') throw new Error('发布仓库必须在 main 分支。');
 if (run('git',['status','--porcelain'],root,true)) throw new Error('博客仓库存在未提交的修改，请先处理后再发布。预览不会修改正式仓库。');
 run('git',['fetch','origin','main']);
 if (run('git',['rev-list','--count','HEAD..origin/main'],root,true) !== '0') throw new Error('远程有新提交，请先同步博客仓库后重试。');
 // Refuse to send unrelated unpublished implementation commits.
 const ahead = run('git',['log','--format=%s','origin/main..HEAD'],root,true);
 if (ahead && ahead.split('\n').some(line => line !== `content: publish ${plan.slug}`)) throw new Error('写作工具代码尚未合并到 main。请先合并功能分支，再发布文章。');
 const article = `src/content/blog/${plan.slug}.md`;
 const old = fs.existsSync(path.join(root, article)) ? fs.readFileSync(path.join(root, article)) : null;
 const existingAssets = new Set([...plan.assets.keys()].filter(f => fs.existsSync(path.join(root,f))));
 let committed = false;
 let staged = false;
 try {
  const changed = writeArticle(plan, root, false);
  run('npm',['run','build']);
  staged = true;
  run('git',['add','--',...changed]);
  if (run('git',['diff','--cached','--name-only'],root,true)) {
   run('git',['commit','-m',`content: publish ${plan.slug}`]);
   committed = true;
  }
  run('git',['push','origin','HEAD:main']);
  if (fs.readFileSync(source,'utf8') === plan.original) {
   plan.doc.set('draft',false);
   fs.writeFileSync(source,`---\n${plan.doc.toString()}---\n${plan.bodyOriginal}`);
  }
  console.log('已推送 GitHub；请等待 Cloudflare 构建。网站上线状态尚未确认。');
 } finally {
  if (!committed) {
   if (staged) run('git',['reset','--',article,...plan.assets.keys()]);
   if (old) fs.writeFileSync(path.join(root,article),old); else fs.rmSync(path.join(root,article),{force:true});
   for (const f of plan.assets.keys()) if (!existingAssets.has(f)) fs.rmSync(path.join(root,f),{force:true});
  }
 }
}
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
 main().catch(e => { console.error(e.message); process.exitCode = 1; });
}

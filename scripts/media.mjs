import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const types = {'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.avif':'image/avif','.svg':'image/svg+xml'};
export function readMediaConfig(base = root) {
 const file = path.join(base, '.blog-media.json');
 if (!fs.existsSync(file)) return null;
 const config = JSON.parse(fs.readFileSync(file, 'utf8'));
 if (config.enabled === false) return null;
 if (config.enabled !== true || !/^[a-f0-9]{32}$/.test(config.accountId || '') || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(config.bucket || '')) throw new Error('图床配置不完整：请填写账号 ID、R2 bucket，并设置 enabled。');
 let url; try { url = new URL(config.publicBaseUrl); } catch {}
 if (!url || url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.hostname.endsWith('.r2.cloudflarestorage.com')) throw new Error('图床需要公开 HTTPS 访问地址，不能使用 R2 的 S3 管理端点。');
 return {...config, publicBaseUrl:url.href.replace(/\/$/,'')};
}
export function mediaAssets(assets, config) {
 const replacements = new Map(), uploads = new Map();
 for (const [file, data] of assets) {
  const ext = path.extname(file).toLowerCase();
  if (!types[ext] || data.length > 20 * 1024 * 1024) throw new Error('图床仅支持不超过 20MB 的图片。');
  const hash = crypto.createHash('sha256').update(data).digest('hex');
  const key = `blog/${hash}${ext}`;
  const url = `${config.publicBaseUrl}/${key}`;
  const reference = file.startsWith('public/') ? `/${file.slice(7)}` : `../../${file.slice(4)}`;
  replacements.set(reference, url);
  uploads.set(key, {key, url, data, contentType:types[ext]});
 }
 const rewrite = text => {
  // Rewriting is restricted to exported Markdown image destinations and metadata.
  for (const [from,to] of replacements) text = text.split(from).join(to);
  return text;
 };
 return {uploads, rewrite};
}
async function matchesPublicImage(asset, fetcher) {
 const response = await fetcher(asset.url, {signal:AbortSignal.timeout(15000)});
 if (response.status === 404) return false;
 if (!response.ok) throw new Error(`图床公开访问失败（HTTP ${response.status}），请检查公开地址和访问权限。`);
 const bytes = Buffer.from(await response.arrayBuffer());
 return bytes.equals(asset.data);
}
export async function uploadMedia(uploads, config, {fetcher=fetch, put} = {}) {
 const upload = put || (asset => {
  const result = spawnSync(process.execPath, [path.join(root,'node_modules/wrangler/bin/wrangler.js'),'r2','object','put',`${config.bucket}/${asset.key}`,'--remote','--pipe','--content-type',asset.contentType,'--cache-control','public, max-age=31536000, immutable'], {cwd:root,input:asset.data,encoding:'utf8',env:{...process.env,CLOUDFLARE_ACCOUNT_ID:config.accountId,WRANGLER_SEND_METRICS:'false'},maxBuffer:2*1024*1024});
  if(result.error || result.status !== 0) throw new Error('图片上传失败。请先在本机运行 npm run media:login 完成 Cloudflare 授权，再重试发布。');
 });
 for (const asset of uploads.values()) {
  if (await matchesPublicImage(asset,fetcher)) { console.log(`图床已存在：${asset.key}`); continue; }
  await upload(asset);
  let verified = false;
  for(let attempt=0;attempt<3;attempt++) {
   if(attempt) await new Promise(resolve=>setTimeout(resolve,1000));
   if(await matchesPublicImage(asset,fetcher)) {verified=true;break;}
  }
  if(!verified) throw new Error('图片已上传，但公开地址的内容校验失败，文章尚未推送。请检查图床域名后重试。');
  console.log(`图床已上传并验证：${asset.key}`);
 }
}
export function articleMedia(plan, config) {
 if (!config) return {plan, uploads:new Map()};
 const media = mediaAssets(plan.assets,config);
 return {plan:{...plan,assets:new Map(),build:draft=>media.rewrite(plan.build(draft))},uploads:media.uploads};
}
export function siteMedia(plan, config) {
 if (!config) return {plan,uploads:new Map()};
 const assets = new Map([...plan.entries].filter(([file])=>file.startsWith('public/site/')));
 const media = mediaAssets(assets,config);
 const entries = new Map([...plan.entries].filter(([file])=>!assets.has(file)).map(([file,data])=>[file,Buffer.from(media.rewrite(data.toString()))]));
 return {plan:{...plan,entries},uploads:media.uploads};
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
 const action=process.argv[2];
 try {
  if(action==='login') {
   const result=spawnSync(process.execPath,[path.join(root,'node_modules/wrangler/bin/wrangler.js'),'login','--scopes','account:read','user:read','workers:write'],{cwd:root,stdio:'inherit',env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
   if(result.status!==0)throw new Error('Cloudflare 授权尚未完成，请重试。');
  } else if(action==='status') {
   const config=readMediaConfig();
   if(!config)console.log('当前图片随博客发布，由 Cloudflare Pages 托管；R2 尚未启用。');
   else {
    console.log(`R2 bucket：${config.bucket}\n公开地址：${config.publicBaseUrl}\n图片会在发布时上传，预览使用本地副本。`);
    const result=spawnSync(process.execPath,[path.join(root,'node_modules/wrangler/bin/wrangler.js'),'r2','bucket','info',config.bucket],{cwd:root,stdio:'inherit',env:{...process.env,CLOUDFLARE_ACCOUNT_ID:config.accountId,WRANGLER_SEND_METRICS:'false'}});
    if(result.status!==0)throw new Error('无法访问 R2 bucket，请检查开通状态和 Cloudflare 授权。');
   }
  } else throw new Error('用法：node scripts/media.mjs login|status');
 } catch(error) {console.error(error.message);process.exitCode=1;}
}

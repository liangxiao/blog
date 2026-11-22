import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { BlogError, codes, isNetworkError } from './errors.mjs';
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
export async function optimizeAssets(assets) {
 const result=new Map();
 for(const [file,data] of assets){
  const ext=path.extname(file).toLowerCase();
  if(!types[ext]||data.length>20*1024*1024)throw new Error('图床仅支持不超过 20MB 的图片。');
  if(!['.png','.jpg','.jpeg','.webp','.avif'].includes(ext)){result.set(file,data);continue;}
  const sharp=(await import('sharp')).default;
  const metadata=await sharp(data,{animated:true}).metadata();
  if((metadata.pages||1)>1){result.set(file,data);continue;}
  const optimized=await sharp(data).rotate().resize({width:2000,withoutEnlargement:true}).webp({quality:88}).toBuffer();
  result.set(file,optimized.length<data.length?{data:optimized,extension:'.webp'}:data);
 }
 return result;
}
export function mediaAssets(assets, config) {
 const replacements = new Map(), uploads = new Map();
 for (const [file, value] of assets) {
  const data=Buffer.isBuffer(value)?value:value.data;
  const ext=Buffer.isBuffer(value)?path.extname(file).toLowerCase():value.extension;
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
const wrangler = path.join(root,'node_modules/wrangler/bin/wrangler.js');
const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));
// Keys are SHA-256 of the bytes, so "the key exists" already proves "the content matches".
// Returns true / false, or null when the public endpoint could not be reached.
export async function publicImageStatus(asset, fetcher=fetch, {timeout=20000}={}) {
 try {
  const response = await fetcher(asset.url, {method:'HEAD', signal:AbortSignal.timeout(timeout)});
  if (response.status === 404) return false;
  if (response.ok) return true;
  if (response.status >= 500) return null;
  throw new BlogError(`图床公开访问失败（HTTP ${response.status}），请检查公开地址和访问权限。`, codes.IMAGE);
 } catch (error) {
  if (error instanceof BlogError) throw error;
  if (isNetworkError(error)) return null;
  throw error;
 }
}
function wranglerPut(asset, config) {
 const result = spawnSync(process.execPath,[wrangler,'r2','object','put',`${config.bucket}/${asset.key}`,'--remote','--pipe','--content-type',asset.contentType,'--cache-control','public, max-age=31536000, immutable'],{cwd:root,input:asset.data,encoding:'utf8',timeout:120000,env:{...process.env,CLOUDFLARE_ACCOUNT_ID:config.accountId,WRANGLER_SEND_METRICS:'false'},maxBuffer:8*1024*1024});
 if (!result.error && result.status === 0) return;
 const output = `${result.stderr||''}\n${result.stdout||''}`;
 if (/Not logged in|auth token|Authentication error|\[code: 10000\]|login/i.test(output)) throw new BlogError('Cloudflare 授权已过期，请重新登录 Cloudflare 后再发布。', codes.AUTH_CLOUDFLARE);
 if (result.error?.code === 'ETIMEDOUT' || isNetworkError({message:output})) throw new BlogError('上传图片时网络超时，请检查网络或代理后重试。', codes.NETWORK);
 const detail = output.split('\n').map(l=>l.trim()).filter(l=>/ERROR|✘/.test(l)).join(' ').replace(/\u001b\[[0-9;]*m/g,'').slice(0,300);
 throw new BlogError(`图片上传失败${detail?`：${detail}`:''}`, codes.IMAGE);
}
export async function uploadMedia(uploads, config, {fetcher=fetch, put, report=()=>{}, retries=2, wait=1500} = {}) {
 const upload = put || (asset => wranglerPut(asset, config));
 const total = uploads.size; let index = 0, uploaded = 0, skipped = 0, unverified = 0;
 for (const asset of uploads.values()) {
  index++;
  report({current:index,total,key:asset.key});
  if (await publicImageStatus(asset,fetcher) === true) { skipped++; console.log(`[${index}/${total}] 图床已存在：${asset.key}`); continue; }
  for (let attempt=0;;attempt++) {
   try { await upload(asset); break; }
   catch (error) {
    if (error.code === codes.AUTH_CLOUDFLARE || attempt >= retries) throw error;
    console.log(`[${index}/${total}] 上传未完成（${error.message}），${attempt+1} 秒后重试…`);
    await sleep(wait*(attempt+1));
   }
  }
  uploaded++;
  let status = null;
  for (let attempt=0;attempt<3;attempt++) {
   if (attempt) await sleep(wait);
   status = await publicImageStatus(asset,fetcher);
   if (status === true) break;
  }
  if (status === false) throw new BlogError('图片已上传，但公开地址仍返回 404，文章尚未推送。请检查图床域名配置后重试。', codes.IMAGE);
  if (status === null) { unverified++; console.log(`[${index}/${total}] 已上传（Cloudflare 已确认），公开地址暂时连不上，跳过访问校验：${asset.key}`); }
  else console.log(`[${index}/${total}] 已上传并验证：${asset.key}`);
 }
 if (total) console.log(`图片处理完成：新上传 ${uploaded} 张，已存在 ${skipped} 张${unverified?`，${unverified} 张未能从本机访问校验`:''}。`);
 return {total,uploaded,skipped,unverified};
}
export function articleMedia(plan, config, assets=plan.assets) {
 if (!config) return {plan, uploads:new Map()};
 const media = mediaAssets(assets,config);
 return {plan:{...plan,assets:new Map(),build:draft=>media.rewrite(plan.build(draft))},uploads:media.uploads};
}
export function siteMedia(plan, config, preparedAssets) {
 if (!config) return {plan,uploads:new Map()};
 const assets = new Map([...plan.entries].filter(([file])=>file.startsWith('public/site/')));
 const media = mediaAssets(preparedAssets||assets,config);
 const entries = new Map([...plan.entries].filter(([file])=>!assets.has(file)).map(([file,data])=>[file,Buffer.from(media.rewrite(data.toString()))]));
 return {plan:{...plan,entries},uploads:media.uploads};
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
 const action=process.argv[2];
 try {
  if(action==='login') {
   const result=spawnSync(process.execPath,[path.join(root,'node_modules/wrangler/bin/wrangler.js'),'login','--scopes','account:read','user:read','workers:write','pages:write'],{cwd:root,stdio:'inherit',env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
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

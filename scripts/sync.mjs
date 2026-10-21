import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {parseDocument, stringify} from 'yaml';
import {prepare, root} from './obsidian.mjs';
import {prepareSite, fields} from './site.mjs';
import {articleMedia, siteMedia, readMediaConfig, optimizeAssets} from './media.mjs';
import store from '../integrations/obsidian-blog-publisher/site-store.cjs';
import {fetchViaAPI,preferAPI} from './github-transport.mjs';

const directory=vault=>path.dirname(store.storagePath(vault));
const stateFile=vault=>path.join(directory(vault),'sync-state.json');
const stable=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const canonical=value=>value==null?null:typeof value==='string'?value.replace(/\r\n/g,'\n').trim():stable(value);
const hash=value=>value==null?null:crypto.createHash('sha256').update(Buffer.isBuffer(value)?value:canonical(value)).digest('hex');
const inside=(base,file)=>{const r=path.relative(base,file);return r!== '..'&&!r.startsWith(`..${path.sep}`)&&!path.isAbsolute(r);};
function writeJSON(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(`${file}.tmp`,JSON.stringify(value,null,2)+'\n');fs.renameSync(`${file}.tmp`,file);}
export function readState(vault){
 if(!fs.existsSync(stateFile(vault)))return {version:1,entries:{}};
 const s=JSON.parse(fs.readFileSync(stateFile(vault),'utf8'));
 if(s.version!==1||!s.entries||typeof s.entries!=='object'||Array.isArray(s.entries))throw new Error('同步记录已损坏，请先从备份恢复；不会自动覆盖。');return s;
}
function git(base,args,binary=false,optional=false){
 const network=['fetch','push'].includes(args[0]);
 if(network&&preferAPI(base)){fetchViaAPI(base);return '';}
 const command=network?['-c','http.version=HTTP/1.1','-c','http.lowSpeedLimit=1000','-c','http.lowSpeedTime=20',...args]:args;
 const r=spawnSync('git',command,{cwd:base,encoding:binary?null:'utf8',timeout:30000,maxBuffer:24*1024*1024});
 if(r.error||r.status!==0){if(optional)return null;if(args[0]==='fetch'){fetchViaAPI(base);return '';}if(r.error?.code==='ETIMEDOUT')throw new Error('连接 GitHub 超时，请检查网络后重试。本地内容已保留。');throw new Error(r.error?.message||String(r.stderr).trim()||'Git 操作失败');}
 return binary?r.stdout:r.stdout.trim();
}
const blob=(base,ref,file,optional=false)=>git(base,['show',`${ref}:${file}`],true,optional);
async function projection(vault,key,build){
 const file=path.join(directory(vault),'projection-cache.json');let cache={};
 try{cache=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}
 if(Object.hasOwn(cache,key))return cache[key];const value=await build();cache[key]=value;
 const entries=Object.entries(cache).slice(-40);writeJSON(file,Object.fromEntries(entries));return value;
}
function repositoryAssets(base,ref,kind,value,remotePath){
 if(value==null)return [];
 const targets=[];
 if(kind==='field')targets.push(String(value));
 else{
  const content=kind==='article'?markdown(value):{body:value};
  if(content.doc?.get('heroImage'))targets.push(String(content.doc.get('heroImage')));
  const body=content.body.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm,'').replace(/`[^`\n]+`/g,'');
  for(const match of body.matchAll(/!\[[^\]]*\]\((<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\)/g))targets.push(match[1]);
 }
 return targets.filter(v=>!/^https?:\/\//i.test(v)).map(target=>{
  const decoded=decodeURIComponent(target.replace(/^<|>$/g,''));
  const file=decoded.startsWith('/')?`public${decoded}`:path.posix.normalize(path.posix.join(path.posix.dirname(remotePath),decoded));
  return [file,git(base,['rev-parse','--verify',`${ref}:${file}`],false,true)];
 });
}
function markdown(text){
 const m=text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/),doc=parseDocument(m?.[1]||'');
 if(doc.errors.length)throw new Error(doc.errors[0].message);
 return {doc,body:text.slice(m?.[0].length||0)};
}
function articleCanonical(text){if(text==null)return null;const {doc,body}=markdown(text);return stable({meta:doc.toJS(),body:canonical(body)});}
function files(dir){if(!fs.existsSync(dir))return [];return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.name.startsWith('.')||e.name==='assets'?[]:e.isDirectory()?files(path.join(dir,e.name)):e.isFile()&&e.name.endsWith('.md')?[path.join(dir,e.name)]:[]);}
function targetPath(vault,relative){
 const base=fs.realpathSync(vault),dest=path.resolve(base,relative);
 if(!inside(path.join(base,'blog'),dest))throw new Error('同步目标必须位于知识库的 blog 文件夹。');
 let existing=dest;while(!fs.existsSync(existing))existing=path.dirname(existing);
 if(!inside(path.join(base,'blog'),fs.realpathSync(existing))||fs.lstatSync(existing).isSymbolicLink())throw new Error('同步目标不能是符号链接或指向文章目录外。');
 return dest;
}
export async function withSyncLock(vault,action){
 const dir=directory(vault);fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,'operation.lock');
 if(fs.existsSync(file)){
  let pid;try{pid=JSON.parse(fs.readFileSync(file,'utf8')).pid;}catch{throw new Error('博客操作锁异常，请检查 operation.lock。');}
  try{process.kill(pid,0);throw new Error('另一个同步或发布正在进行，请稍后重试。');}catch(e){if(e.code!=='ESRCH')throw e;fs.unlinkSync(file);}
 }
 const fd=fs.openSync(file,'wx');fs.writeFileSync(fd,JSON.stringify({pid:process.pid}));fs.closeSync(fd);
 try{return await action();}finally{fs.rmSync(file,{force:true});}
}
async function inspect(vault,{base=root,fetchRemote=false,ref,scope}={}){
 vault=fs.realpathSync(vault);
 if(fetchRemote)git(base,['fetch','origin','main']);
 const head=git(base,['rev-parse','HEAD']);
 const remote=git(base,['rev-parse','--verify','origin/main^{commit}'],false,true)||head;
 const branch=git(base,['branch','--show-current']),dirty=Boolean(git(base,['status','--porcelain']));
 const counts=git(base,['rev-list','--left-right','--count',`${head}...${remote}`]).split(/\s+/).map(Number);
 ref=ref||(counts[1]===0?head:remote);
 const state=readState(vault),units=[],issues=[];
 const tree=git(base,['ls-tree','-r','--name-only',ref,'--','src/content/blog','src/config/site.json','src/content/pages']).split('\n');
 const media=readMediaConfig(base);
 if(!scope||scope==='site'){
  const remoteConfig=blob(base,ref,'src/config/site.json',true);
  let config={};if(remoteConfig)config=JSON.parse(remoteConfig.toString());
  const unknown=Object.keys(config).filter(k=>!fields.some(f=>f.key===k));
  if(unknown.length)issues.push({scope:'site',message:`仓库包含插件尚不支持的站点字段：${unknown.join('、')}，请先升级插件。`});
  let draft=null,plan=null,projected=null;
  try{
   draft=fs.existsSync(store.storagePath(vault))?store.readSite(vault):null;
   plan=prepareSite(vault);
   const assets=new Map([...plan.entries].filter(([f])=>f.startsWith('public/site/')));
   const signature=hash({entries:[...plan.entries].map(([f,d])=>[f,hash(d)]),media});
   projected=await projection(vault,signature,async()=>{const p=siteMedia(plan,media,media?await optimizeAssets(assets):assets).plan;return {entries:[...p.entries].filter(([f])=>!f.startsWith('public/site/')).map(([f,d])=>[f,d.toString()]),assets:[...p.entries].filter(([f])=>f.startsWith('public/site/')).map(([f,d])=>[f,hash(d)])};});
   projected.entries=new Map(projected.entries);
  }catch(e){issues.push({scope:'site',message:e.message,field:e.field});}
  if(plan||draft){
   const output=projected?JSON.parse(projected.entries.get('src/config/site.json').toString()):{};
   const exportedAssetsMatch=projected?.assets.every(([file,h])=>hash(blob(base,ref,file,true))===h);
   for(const f of fields){
    const local=draft?draft.values[f.label]??f.default:plan.site[f.key];
    const repo=remoteConfig?config[f.key]??f.default:null;
    units.push({id:`site:${f.key}`,label:f.label,kind:'field',key:f.key,local,repo,fingerprint:f.type==='image'?plan?.site[f.key]:null,assetField:f.type==='image',assetsMatch:exportedAssetsMatch,projected:projected?output[f.key]:undefined,remotePath:'src/config/site.json'});
   }
   for(const key of ['home','about']){
    const remotePath=`src/content/pages/${key}.md`,data=blob(base,ref,remotePath,true);
    units.push({id:`site:${key}`,label:key==='home'?'首页介绍':'关于页正文',kind:'page',key,local:draft?draft[key]:store.markdownBody(plan.entries.get(remotePath).toString()),repo:data?store.markdownBody(data.toString()):null,fingerprint:plan?store.markdownBody(plan.entries.get(remotePath).toString()):null,assetsMatch:exportedAssetsMatch,projected:projected?store.markdownBody(projected.entries.get(remotePath).toString()):undefined,remotePath});
   }
  }
 }
 if(!scope||scope.startsWith('article:')){
  const localBySlug=new Map();
  for(const file of files(path.join(vault,'blog'))){
   if(['站点设置.md','首页介绍.md','关于.md','使用说明.md','站点管理使用说明.md'].includes(path.basename(file)))continue;
   const text=fs.readFileSync(file,'utf8');let slug;
   try{slug=markdown(text).doc.get('slug');}catch(e){issues.push({file:path.relative(vault,file),message:e.message});continue;}
   if(typeof slug!=='string'||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))continue;
   if(scope&&scope!==`article:${slug}`)continue;
   if(localBySlug.has(slug))throw new Error(`有多篇笔记使用相同 slug：${slug}，请先改正。`);
   localBySlug.set(slug,{file,text});
  }
  const repoSlugs=new Map();
  for(const file of tree.filter(f=>f.startsWith('src/content/blog/'))){
   if(!/^src\/content\/blog\/[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(file)){
    if(!scope)issues.push({file,message:'嵌套目录、MDX 或特殊文件名暂不自动导入，请手动处理。'});continue;
   }
   repoSlugs.set(path.basename(file,'.md'),file);
  }
  for(const slug of new Set([...localBySlug.keys(),...repoSlugs.keys(),...Object.keys(state.entries).filter(k=>k.startsWith('article:')).map(k=>k.slice(8))])){
   if(scope&&scope!==`article:${slug}`)continue;
   const local=localBySlug.get(slug),remotePath=repoSlugs.get(slug)||`src/content/blog/${slug}.md`;
   const repo=blob(base,ref,remotePath,true)?.toString()??null;
   let projected,fingerprint,assetsMatch=true;
   if(local)try{
    const p=prepare(vault,local.file);fingerprint=p.build(false);
    const signature=hash({content:fingerprint,assets:[...p.assets].map(([f,d])=>[f,hash(d)]),media});
    const result=await projection(vault,signature,async()=>{const m=articleMedia(p,media,media?await optimizeAssets(p.assets):p.assets);return {text:m.plan.build(false),assets:[...m.plan.assets].map(([f,d])=>[f,hash(d)])};});
    projected=result.text;assetsMatch=result.assets.every(([file,h])=>hash(blob(base,ref,file,true))===h);
   }catch(e){issues.push({scope:`article:${slug}`,file:path.relative(vault,local.file),message:e.message});}
   const localPath=local?path.relative(vault,local.file):state.entries[`article:${slug}`]?.localPath||`blog/${slug}.md`;
   units.push({id:`article:${slug}`,label:slug,kind:'article',slug,local:local?.text??null,repo,projected,fingerprint,assetsMatch,localPath,remotePath});
  }
 }
 for(const u of units){
  const normalize=u.kind==='article'?articleCanonical:canonical;
  u.localHash=u.local===null?null:hash({source:canonical(u.local),images:u.fingerprint??null});
  u.repoHash=u.repo===null?null:hash({content:normalize(u.repo),assets:u.kind!=='field'||u.assetField?repositoryAssets(base,ref,u.kind,u.repo,u.remotePath):[]});
  const old=state.entries[u.id];
  if(u.local===null&&u.repo===null){u.status='synced';continue;}
  const equivalent=u.projected!==undefined&&u.assetsMatch!==false&&normalize(u.projected)===normalize(u.repo);
  if(equivalent){u.status='synced';continue;}
  if(!old){u.status=u.local===null?'remote':u.repo===null?'local':'conflict';continue;}
  const changedLocal=u.localHash!==old.local||old.pendingLocal===true,changedRepo=u.repoHash!==old.repo;
  u.status=changedLocal?(changedRepo?'conflict':'local'):(changedRepo?'remote':'synced');
  // Deletions are always explicit choices; the source is retained until reviewed.
  if(u.repo===null&&old.repo!==null&&u.local!==null&&changedRepo)u.status='conflict';
  if(u.local===null&&old.local!==null&&u.repo!==null)u.status='conflict';
 }
 const token=hash({ref,head,units:units.map(u=>[u.id,u.localHash,u.repoHash]),state:hash(state.entries)});
 return {vault,base,ref,head,remote,branch,dirty,ahead:counts[0],behind:counts[1],state,units,issues,token};
}
function report(scan){
 const {units,state}=scan,counts={local:0,remote:0,conflict:0,synced:0};for(const u of units)counts[u.status]++;
 return {ok:true,checkedAt:new Date().toISOString(),remoteCheckedAt:state.lastRemoteCheckedAt||null,token:scan.token,branch:scan.branch,dirty:scan.dirty,ahead:scan.ahead,behind:scan.behind,remote:scan.remote,counts,issues:scan.issues,lastPublished:state.lastPublished||null,
  changes:units.filter(u=>u.status!=='synced').map(u=>({id:u.id,label:u.label,status:u.status,file:u.localPath||u.remotePath})),
  conflicts:units.filter(u=>u.status==='conflict').map(u=>({id:u.id,label:u.label,local:u.local,repo:u.repo,reason:!state.entries[u.id]?'首次同步，没有可用的共同版本':u.repo===null?'仓库中已删除':u.local===null?'本地笔记已移除':'本地和仓库都发生了修改'}))};
}
function acceptEquivalent(scan){
 for(const u of scan.units)if(u.status==='synced')scan.state.entries[u.id]={local:u.localHash,repo:u.repoHash,...(u.localPath?{localPath:u.localPath}:{})};
}
export async function checkSync(vault,options={}){
 return withSyncLock(vault,async()=>{
  const scan=await inspect(vault,options);acceptEquivalent(scan);
  const result=report(scan);scan.state.lastCheckedAt=result.checkedAt;scan.state.lastRemoteSha=scan.remote;
  if(options.fetchRemote)scan.state.lastRemoteCheckedAt=result.checkedAt;
  writeJSON(stateFile(vault),scan.state);writeJSON(path.join(directory(vault),'sync-status.json'),result);
  // The review token includes the newly established common versions.
  const stable=await inspect(vault,{...options,fetchRemote:false});const stableResult=report(stable);writeJSON(path.join(directory(vault),'sync-status.json'),stableResult);return stableResult;
 });
}
function importImage(scan,value,remotePath,writes){
 if(!value||/^https?:\/\//i.test(value)||value==='/favicon.svg')return value;
 const decoded=decodeURIComponent(value.replace(/^<|>$/g,''));
 if(/[?#]/.test(decoded))throw new Error(`暂不自动导入带查询参数的本地图片：${value}`);
 const file=decoded.startsWith('/')?`public${decoded}`:path.posix.normalize(path.posix.join(path.posix.dirname(remotePath),decoded));
 if(!/^(public|src\/assets)\//.test(file)||file.includes('..')||!/^\.(png|jpe?g|webp|gif|avif|svg)$/i.test(path.extname(file)))throw new Error(`仓库图片路径不支持自动导入：${value}`);
 const mode=git(scan.base,['ls-tree',scan.ref,'--',file]);if(!mode.startsWith('100644 ')&&!mode.startsWith('100755 '))throw new Error(`仓库图片不存在或是符号链接：${value}`);
 const data=blob(scan.base,scan.ref,file);if(data.length>20*1024*1024)throw new Error('导入图片不能超过 20MB。');
 const relative=`blog/assets/imported/${hash(data).slice(0,20)}${path.extname(file).toLowerCase()}`;
 targetPath(scan.vault,relative);writes.set(relative,data);return relative;
}
function imageReplacements(local,projected){
 const tokens=text=>text.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm,'').replace(/`[^`\n]+`/g,'').match(/!\[\[[^\]]+\]\]|!\[[^\]]*\]\((?:<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\)/g)||[];
 const source=tokens(local),output=tokens(projected);return source.length===output.length?new Map(output.map((image,i)=>[image,source[i]])):new Map();
}
function importMarkdown(scan,text,remotePath,writes,replacements=new Map()){
 const protectedText=[];
 let result=text.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm,s=>`\0P${protectedText.push(s)-1}\0`).replace(/`[^`\n]+`/g,s=>`\0P${protectedText.push(s)-1}\0`);
 if(/!\[[^\]]*\]\s*\[[^\]]*\]/.test(result))throw new Error('仓库正文包含引用式图片，请先改为普通 Markdown 图片。');
 result=result.replace(/!\[([^\]]*)\]\((<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\)/g,(full,alt,target)=>replacements.get(full)||`![${alt}](${importImage(scan,target,remotePath,writes)})`);
 return result.replace(/\0P(\d+)\0/g,(_,n)=>protectedText[Number(n)]);
}
function importedArticle(scan,u,writes){
 const remote=markdown(u.repo),local=u.local?markdown(u.local):null,doc=local?.doc||parseDocument('');
 const projected=u.projected?markdown(u.projected):null;
 const preserveHero=local&&projected&&u.assetsMatch&&canonical(projected.doc.get('heroImage'))===canonical(remote.doc.get('heroImage'));
 for(const key of ['title','description','pubDate','updatedDate','tags','heroImage']){
  if(key==='heroImage'&&preserveHero&&local.doc.has(key))continue;
  if(remote.doc.has(key))doc.set(key,key==='heroImage'?importImage(scan,String(remote.doc.get(key)),u.remotePath,writes):remote.doc.get(key));else doc.delete(key);
 }
 const publicTags=remote.doc.toJS()?.tags;
 if(Array.isArray(publicTags)&&publicTags.some(tag=>typeof tag==='string'&&/\s/.test(tag))){
  doc.set('blogTags',publicTags);doc.set('tags',publicTags.map(tag=>typeof tag==='string'?tag.replace(/\s+/g,'-'):tag));
 }else doc.delete('blogTags');
 doc.set('slug',u.slug);doc.set('draft',false);
 const sameBody=local&&projected&&u.assetsMatch&&canonical(projected.body)===canonical(remote.body);
 const replacements=local&&projected&&u.assetsMatch?imageReplacements(local.body,projected.body):new Map();
 return `---\n${doc.toString()}---\n${sameBody?local.body:importMarkdown(scan,remote.body,u.remotePath,writes,replacements)}`;
}
export async function synchronize(vault,{base=root,token,choices={}}={}){
 return withSyncLock(vault,async()=>{
  const scan=await inspect(vault,{base,fetchRemote:true});
  if(scan.branch!=='main'||scan.dirty)throw new Error('同步需要干净的 main 分支，请先处理仓库中的代码修改。');
  if(scan.ahead&&scan.behind)throw new Error('本地和远程提交已分叉，请先处理 Git 合并；不会强制覆盖。');
  if(token&&token!==scan.token)throw new Error('内容在查看差异后又发生变化，请重新检查更新。');
  if(scan.issues.length)throw new Error(`请先处理检查问题：${scan.issues.map(i=>i.message).join('；')}`);
  const conflicts=scan.units.filter(u=>u.status==='conflict');
  if(conflicts.some(u=>!['local','repo'].includes(choices[u.id])))return {...report(scan),needsReview:true};
  const writes=new Map(),removals=[],draft=fs.existsSync(store.storagePath(vault))?store.readSite(vault):null;
  let siteChanged=false;
  for(const u of scan.units){
   const takeRepo=u.status==='remote'||u.status==='conflict'&&choices[u.id]==='repo';
   if(!takeRepo)continue;
   if(u.kind==='article'){
    targetPath(scan.vault,u.localPath);
    if(u.repo===null)removals.push(u.localPath);else writes.set(u.localPath,Buffer.from(importedArticle(scan,u,writes)));
   }else{
    if(!draft)throw new Error('请先更新插件并迁移站点设置。');
    if(u.repo===null)throw new Error(`${u.label} 在仓库中已删除，请选择保留本地内容或恢复仓库文件。`);
    if(u.kind==='page')draft[u.key]=importMarkdown(scan,u.repo,u.remotePath,writes,u.assetsMatch&&u.projected?imageReplacements(u.local,u.projected):new Map());
    else{const f=fields.find(f=>f.key===u.key);draft.values[f.label]=f.type==='links'?u.repo.map(v=>typeof v==='string'?v:`${v.label} | ${v.href}`):f.type==='image'?importImage(scan,u.repo,u.remotePath,writes):u.repo;}
    siteChanged=true;
   }
  }
  // Build a complete recoverable backup before changing the checkout or vault.
  const backup=path.join(directory(vault),'sync-backups',`${Date.now()}-${crypto.randomUUID().slice(0,8)}`);fs.mkdirSync(backup,{recursive:true});
  const prior=new Map();
  for(const relative of new Set([...writes.keys(),...removals])){
   const file=targetPath(scan.vault,relative),data=fs.existsSync(file)?fs.readFileSync(file):null;prior.set(file,data);
   if(data){const dest=path.join(backup,relative);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,data);}
  }
  for(const file of [store.storagePath(vault),stateFile(vault)])if(fs.existsSync(file)){const data=fs.readFileSync(file);prior.set(file,data);fs.writeFileSync(path.join(backup,path.basename(file)),data);}
  writeJSON(path.join(backup,'manifest.json'),{from:scan.head,to:scan.ref,changes:[...writes.keys()],removals,choices});
  const unchanged=await inspect(vault,{base,ref:scan.ref});if(unchanged.token!==scan.token)throw new Error('同步准备期间内容发生变化，请重新检查。');
  if(scan.behind)git(base,['merge','--ff-only',scan.remote]);
  try{
   for(const [relative,data]of writes){const file=targetPath(scan.vault,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,data);}
   for(const relative of removals)fs.unlinkSync(targetPath(scan.vault,relative));
   if(siteChanged)store.saveSite(vault,draft);
   const after=await inspect(vault,{base,ref:scan.ref});
   for(const u of after.units){
    const previous=scan.units.find(p=>p.id===u.id);
    if(previous?.status==='local')continue;
    scan.state.entries[u.id]={local:u.localHash,repo:u.repoHash,...(u.localPath?{localPath:u.localPath}:{}),...(previous?.status==='conflict'&&choices[u.id]==='local'?{pendingLocal:true}:{})};
   }
   scan.state.lastCheckedAt=new Date().toISOString();scan.state.lastRemoteCheckedAt=scan.state.lastCheckedAt;scan.state.lastRemoteSha=scan.remote;writeJSON(stateFile(vault),scan.state);
   const final=report(await inspect(vault,{base,ref:scan.ref}));writeJSON(path.join(directory(vault),'sync-status.json'),final);
   return {...final,applied:true,backup: path.relative(vault,backup),imported:scan.units.filter(u=>u.status==='remote'||u.status==='conflict'&&choices[u.id]==='repo').length};
  }catch(error){
   for(const [file,data]of prior){if(data===null)fs.rmSync(file,{force:true});else fs.writeFileSync(file,data);}
   throw new Error(`同步未完成，知识库内容已恢复；仓库可能已快进，请重新检查。备份：${backup}。${error.message}`);
  }
 });
}
export async function assertPublishSafe(vault,scope,{base=root}={}){
 const scan=await inspect(vault,{base,ref:'HEAD',scope});
 if(scan.issues.length)throw new Error(scan.issues.map(i=>i.message).join('；'));
 const unsafe=scan.units.filter(u=>['remote','conflict'].includes(u.status));
 if(unsafe.length)throw new Error(`检测到外部修改：${unsafe.map(u=>u.label).join('、')}。请先在博客设置中「同步变化」并处理差异，再发布。`);
 acceptEquivalent(scan);writeJSON(stateFile(vault),scan.state);
}
export async function recordPublication(vault,scope,deployed,{base=root}={}){
 const scan=await inspect(vault,{base,ref:'HEAD',scope});
 for(const u of scan.units)scan.state.entries[u.id]={local:u.localHash,repo:u.repoHash,...(u.localPath?{localPath:u.localPath}:{}),...(u.status!=='synced'?{pendingLocal:true}:{})};
 scan.state.lastPublished={at:new Date().toISOString(),commit:scan.head,scope,deployed};writeJSON(stateFile(vault),scan.state);
}
export function progress(vault,stage,message,extra={}){
 const value={stage,message,at:new Date().toISOString(),...extra};writeJSON(path.join(directory(vault),'publish-status.json'),value);console.log(`@blog-progress ${JSON.stringify(value)}`);
}
export async function validate(vault,source){
 try{if(source)prepare(vault,path.resolve(vault,source));else prepareSite(vault);return {ok:true,issues:[]};}
 catch(error){return {ok:false,issues:[{message:error.message,field:error.field||null,file:source||null}]};}
}
async function imageInfo(vault,relative){
 const file=fs.realpathSync(path.resolve(vault,relative));if(!inside(fs.realpathSync(vault),file))throw new Error('图片不能位于知识库外。');
 const data=fs.readFileSync(file),ext=path.extname(file).toLowerCase();
 const result=(await optimizeAssets(new Map([[`public/site/image${ext}`,data]]))).values().next().value;
 const sharp=(await import('sharp')).default,meta=await sharp(data,{animated:true}).metadata(),out=Buffer.isBuffer(result)?result:result.data;
 return {ok:true,width:meta.width,height:meta.height,originalBytes:data.length,optimizedBytes:out.length,animated:(meta.pages||1)>1,extension:Buffer.isBuffer(result)?ext:result.extension};
}
async function main(){
 const [action,vault,arg]=process.argv.slice(2);if(!vault)throw new Error('缺少知识库路径。');let result;
 if(action==='check'||action==='status')result=await checkSync(vault,{fetchRemote:action==='check'});
 else if(action==='sync'||action==='resolve')result=await synchronize(vault,arg?JSON.parse(arg):{});
 else if(action==='validate')result=await validate(vault,arg);
 else if(action==='image-info')result=await imageInfo(vault,arg);
 else throw new Error('不支持的博客检查操作。');
 console.log(JSON.stringify(result));
}
if(process.argv[1]&&fs.realpathSync(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.log(JSON.stringify({ok:false,error:error.message}));process.exitCode=1;});

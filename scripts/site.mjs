import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepare, root, run } from './obsidian.mjs';
export const fields = JSON.parse(fs.readFileSync(new URL('../integrations/obsidian-blog-publisher/site-fields.json', import.meta.url),'utf8'));
const names = ['站点设置.md','首页介绍.md','关于.md'];
const commitMessage = 'content: publish site settings';
export function prepareSite(vault) {
 const settingsFile = path.join(vault,'blog',names[0]);
 const configPlan = prepare(vault,settingsFile,{page:true,slug:'site-settings'});
 const site = {};
 for (const f of fields) {
  let value = configPlan.doc.has(f.label) ? configPlan.doc.get(f.label) : f.default;
  if (f.type === 'links') {
   if (value?.toJSON) value=value.toJSON();
   if (!Array.isArray(value)) throw new Error(`${f.label} 应为列表，每项格式：名称 | 地址`);
   value=value.map(item=>{
    if (typeof item !== 'string' && !(item && typeof item.label==='string' && typeof item.href==='string')) throw new Error(`${f.label} 中的项目格式不正确`);
    const [label,href,...rest]=typeof item==='string' ? item.split('|').map(s=>s.trim()) : [item.label,item.href];
    if (!label || !href || rest.length || !(/^(https?:\/\/|mailto:)/.test(href)||/^\/(?!\/)/.test(href)) || /[<>\s]/.test(href)) throw new Error(`${f.label}：请使用 名称 | https://网址 或 名称 | /路径`);
    return {label,href};
   });
  } else if (f.type === 'boolean') {
   if (typeof value !== 'boolean') throw new Error(`${f.label} 应为 true 或 false`);
  } else if (f.type === 'number') {
   if (!Number.isInteger(value)||value<f.min||value>f.max) throw new Error(`${f.label} 必须为 ${f.min}–${f.max} 的整数`);
  } else {
   if (value == null && ['image','text'].includes(f.type)) value='';
   if (typeof value !== 'string') throw new Error(`${f.label} 应为文本`);
   if (f.type==='color' && !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`${f.label} 应为 #2563eb 这样的六位颜色`);
   if (f.type==='language' && !/^[a-z]{2,3}(?:-[a-zA-Z]{2,4})?$/.test(value)) throw new Error('页面语言示例：zh-CN、en');
   if (f.type==='url') { let u;try{u=new URL(value);}catch{} if(!u||u.protocol!=='https:'||u.pathname!=='/'||u.search||u.hash||u.username||u.password) throw new Error('正式网址需要 HTTPS 域名，例如 https://old-rookie.pages.dev');value=u.origin; }
   if (f.type==='image' && value) {
    if (value==='/favicon.svg') { /* built-in icon */ }
    else value=configPlan.resolveAsset(value.replace(/^!?\[\[|\]\]$/g,''));
   }
  }
  site[f.key]=value;
 }
 for (const k of ['title','author','description','homeHeading','blogHeading','aboutHeading']) if(!site[k].trim()) throw new Error(`请填写 ${fields.find(f=>f.key===k).label}`);
 if(site.commentsEnabled && (!/^[\w.-]+\/[\w.-]+$/.test(site.giscusRepo)||!/^R_[\w-]+$/.test(site.giscusRepoId)||!/^DIC_[\w-]+$/.test(site.giscusCategoryId))) throw new Error('开启评论前，请填写 giscus.app 提供的仓库和分类 ID；还需在 GitHub 安装 Giscus 并开启 Discussions。');
 const entries=new Map([['src/config/site.json',Buffer.from(JSON.stringify(site,null,2)+'\n')],...configPlan.assets]);
 for (const [file,id,title,description] of [[names[1],'home','首页介绍',site.description],[names[2],'about',site.aboutHeading,site.aboutDescription]]) {
  const plan=prepare(vault,path.join(vault,'blog',file),{page:true,slug:`site-${id}`,title,description});
  entries.set(`src/content/pages/${id}.md`,Buffer.from(plan.build(false)));
  for(const entry of plan.assets) entries.set(...entry);
 }
 return {site,entries};
}
export function previewWorkspace() {
 const dest=path.join(root,'.writing-preview');fs.mkdirSync(dest,{recursive:true});
 for(const dir of ['src','public']) {fs.rmSync(path.join(dest,dir),{recursive:true,force:true});fs.cpSync(path.join(root,dir),path.join(dest,dir),{recursive:true});}
 for(const name of ['astro.config.mjs','tsconfig.json','package.json'])fs.copyFileSync(path.join(root,name),path.join(dest,name));
 if(!fs.existsSync(path.join(dest,'node_modules')))fs.symlinkSync(path.join(root,'node_modules'),path.join(dest,'node_modules'),'dir');
 return dest;
}
function writeEntries(entries,dest) {for(const [file,data] of entries){fs.mkdirSync(path.dirname(path.join(dest,file)),{recursive:true});fs.writeFileSync(path.join(dest,file),data);}}
export function publishSite(plan) {
 if(run('git',['branch','--show-current'],root,true)!=='main')throw new Error('发布仓库必须在 main 分支');
 if(run('git',['status','--porcelain'],root,true))throw new Error('仓库有未提交修改，请先处理');
 run('git',['fetch','origin','main']);
 if(run('git',['rev-list','--count','HEAD..origin/main'],root,true)!=='0')throw new Error('远程有新提交，请先同步仓库');
 const ahead=run('git',['log','--format=%s','origin/main..HEAD'],root,true);
 if(ahead&&ahead.split('\n').some(s=>s!==commitMessage))throw new Error('存在其他尚未推送的提交，请先处理');
 const old=new Map([...plan.entries.keys()].map(f=>[f,fs.existsSync(path.join(root,f))?fs.readFileSync(path.join(root,f)):null]));
 let committed=false,staged=false;
 try {
  writeEntries(plan.entries,root);run('npm',['run','build']);staged=true;
  run('git',['add','--',...plan.entries.keys()]);
  if(run('git',['diff','--cached','--name-only'],root,true)){run('git',['commit','-m',commitMessage]);committed=true;}
  run('git',['push','origin','HEAD:main']);console.log('站点设置已推送 GitHub，等待 Cloudflare 构建。');
 } finally {
  if(!committed){if(staged)run('git',['reset','--',...plan.entries.keys()]);for(const [f,data]of old){if(data)fs.writeFileSync(path.join(root,f),data);else fs.rmSync(path.join(root,f),{force:true});}}
 }
}
async function main(){
 const [action,vault]=process.argv.slice(2);
 if(!['preview','publish','check'].includes(action)||!vault)throw new Error('用法：node scripts/site.mjs preview|publish|check VAULT');
 const plan=prepareSite(vault);
 console.log(`站点：${plan.site.title}\n同步：站点设置、首页介绍、关于页及引用图片（${plan.entries.size} 个文件）`);
 if(action==='check')return;
 if(action==='preview'){
  const dest=previewWorkspace();writeEntries(plan.entries,dest);
  // Restart this isolated preview so changes to Astro's canonical site URL take effect.
  run('npx',['astro','dev','stop'],dest);
  run('npx',['astro','dev','--background','--host','127.0.0.1','--port','4322'],dest);
  run('open',['http://127.0.0.1:4322/']);return;
 }
 publishSite(plan);
}
if(process.argv[1]&&fs.realpathSync(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1;});

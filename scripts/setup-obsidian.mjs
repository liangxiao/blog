import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import siteStore from '../integrations/obsidian-blog-publisher/site-store.cjs';
import { fields } from './site.mjs';
import { root } from './obsidian.mjs';
const arg=process.argv[2];
if(!arg){console.error('用法：node scripts/setup-obsidian.mjs VAULT');process.exit(1);}
const vault=fs.realpathSync(arg);
if(!fs.existsSync(path.join(vault,'.obsidian')))throw new Error('请指定已有 Obsidian 知识库');
const blog=path.join(vault,'blog');fs.mkdirSync(blog,{recursive:true});
const site=JSON.parse(fs.readFileSync(path.join(root,'src/config/site.json'),'utf8'));
function copySiteImage(value){
 if(typeof value!=='string'||!value.startsWith('/site/'))return value;
 const file=path.join(root,'public',value);
 if(!fs.existsSync(file))throw new Error(`缺少站点图片 ${value}`);
 const dest=path.join(blog,'assets/site',path.basename(value));fs.mkdirSync(path.dirname(dest),{recursive:true});
 if(!fs.existsSync(dest))fs.copyFileSync(file,dest);
 return `blog/assets/site/${path.basename(value)}`;
}
const values={};for(const f of fields){let value=site[f.key]??f.default;if(f.type==='links')value=value.map(l=>`${l.label} | ${l.href}`);if(f.type==='image')value=copySiteImage(value);values[f.label]=value;}
const page=id=>siteStore.markdownBody(fs.readFileSync(path.join(root,'src/content/pages',`${id}.md`),'utf8')).replace(/\/site\/[\w.-]+/g,value=>copySiteImage(value));
const fallback={values,home:page('home'),about:page('about')};
siteStore.migrateSite(vault,parse,fallback);
const plugin=path.join(vault,'.obsidian/plugins/local-blog-publisher');fs.mkdirSync(plugin,{recursive:true});
for(const name of ['main.js','manifest.json','styles.css','site-fields.json','site-store.cjs'])fs.copyFileSync(path.join(root,'integrations/obsidian-blog-publisher',name),path.join(plugin,name));
const dataPath=path.join(plugin,'data.json');const data=fs.existsSync(dataPath)?JSON.parse(fs.readFileSync(dataPath,'utf8')):{};
fs.writeFileSync(dataPath,JSON.stringify({...data,repoPath:root,nodePath:process.execPath},null,2)+'\n');
console.log('已更新插件；站点草稿已集中存储，原配置笔记已备份。请重新加载「博客发布」插件。');

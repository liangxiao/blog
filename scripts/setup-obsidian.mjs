import fs from 'node:fs';
import path from 'node:path';
import { stringify } from 'yaml';
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
const guidance=`
# 站点设置

直接修改上面的属性。在左侧「博客：管理站点」可选择首页封面、头像、默认文章封面和网站图标。

- 导航和社交链接每项使用：名称 | 地址，例如 GitHub | https://github.com/liangxiao。
- 默认文章封面用于没有单独封面的文章，也用于首页和关于页的分享卡片。留空表示不设置。
- 首页封面是首页介绍上方的大图，作者头像是介绍旁的小图，两者独立。
- 颜色使用六位十六进制，如 #2563eb。页面宽度范围 600–1200，正文字号 14–24。
- 正式网址用于链接和站点地图；改成自定义域名前，仍需在 Cloudflare 配好域名。
- 评论需要先在 GitHub 安装 Giscus、开启 Discussions，再从 https://giscus.app/zh-CN 获取仓库 ID 和分类 ID。未配置好时不要开启。

改好后点击「预览站点」，确认后点击「发布站点设置」。本文件正文是操作说明，不会出现在网站上。
`;
const settingsPath=path.join(blog,'站点设置.md');
if(!fs.existsSync(settingsPath))fs.writeFileSync(settingsPath,`---\n${stringify(values)}---\n${guidance}`);
for(const [id,name]of [['home','首页介绍'],['about','关于']]){
 const dest=path.join(blog,`${name}.md`);
 if(!fs.existsSync(dest)){
  let text=fs.readFileSync(path.join(root,'src/content/pages',`${id}.md`),'utf8');
  text=text.replace(/\/site\/[\w.-]+/g,m=>copySiteImage(m));
  fs.writeFileSync(dest,text);
 }
}
const plugin=path.join(vault,'.obsidian/plugins/local-blog-publisher');fs.mkdirSync(plugin,{recursive:true});
for(const name of ['main.js','manifest.json','styles.css','site-fields.json'])fs.copyFileSync(path.join(root,'integrations/obsidian-blog-publisher',name),path.join(plugin,name));
const dataPath=path.join(plugin,'data.json');const data=fs.existsSync(dataPath)?JSON.parse(fs.readFileSync(dataPath,'utf8')):{};
fs.writeFileSync(dataPath,JSON.stringify({...data,repoPath:root,nodePath:process.execPath},null,2)+'\n');
console.log('已安装/更新博客插件并初始化缺少的站点文件；已有内容保持不变。请在 Obsidian 中重新加载「博客发布」插件。');

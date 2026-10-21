const fs = require('node:fs');
const path = require('node:path');
const pluginDir = vault => path.join(vault, '.obsidian/plugins/local-blog-publisher');
const storagePath = vault => path.join(pluginDir(vault), 'site.json');
function readSite(vault) {
 const value = JSON.parse(fs.readFileSync(storagePath(vault), 'utf8'));
 if (value.version !== 1 || !value.values || typeof value.values !== 'object' || Array.isArray(value.values) || typeof value.home !== 'string' || typeof value.about !== 'string') throw new Error('站点草稿格式不正确，请恢复备份后重试；不会使用旧笔记覆盖。');
 return value;
}
function saveSite(vault, value) {
 fs.mkdirSync(pluginDir(vault), {recursive:true});
 const target=storagePath(vault), temp=`${target}.tmp`;
 fs.writeFileSync(temp, JSON.stringify(value,null,2)+'\n');
 fs.renameSync(temp,target);
}
function markdownBody(text) { return text.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/,''); }
function patchSite(vault,base,desired){
 const current=readSite(vault),merged=JSON.parse(JSON.stringify(current)),external=[];
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 for(const key of new Set([...Object.keys(base.values),...Object.keys(desired.values)])){
  const changed=!same(base.values[key],desired.values[key]),outside=!same(base.values[key],current.values[key]);
  if(changed&&outside&&!same(current.values[key],desired.values[key]))throw new Error(`「${key}」在别处也有修改，当前输入尚未保存。请先复制当前输入，再重新打开设置查看新版本。`);
  if(changed)merged.values[key]=desired.values[key];else if(outside)external.push(key);
 }
 for(const key of ['home','about']){
  const changed=!same(base[key],desired[key]),outside=!same(base[key],current[key]);
  if(changed&&outside&&!same(current[key],desired[key]))throw new Error(`${key==='home'?'首页介绍':'关于页正文'}在别处也有修改，当前输入尚未保存。请先复制当前输入，再重新打开设置查看新版本。`);
  if(changed)merged[key]=desired[key];else if(outside)external.push(key==='home'?'首页介绍':'关于页正文');
 }
 saveSite(vault,merged);return {value:merged,external};
}
function migrateSite(vault, parseYaml, fallback) {
 if (!fs.existsSync(storagePath(vault))) {
  const draft={version:1,values:{...fallback.values},home:fallback.home,about:fallback.about};
  const settings=path.join(vault,'blog/站点设置.md');
  if(fs.existsSync(settings)){
   const text=fs.readFileSync(settings,'utf8'), match=text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
   if(!match)throw new Error('旧站点设置缺少属性，迁移已停止，原文件保持不变。');
   const values=parseYaml(match[1]);
   if(!values||typeof values!=='object'||Array.isArray(values))throw new Error('旧站点设置格式不正确，原文件保持不变。');
   Object.assign(draft.values,values);
  }
  for(const [key,name] of [['home','首页介绍'],['about','关于']]){
   const file=path.join(vault,'blog',`${name}.md`);
   if(fs.existsSync(file))draft[key]=markdownBody(fs.readFileSync(file,'utf8'));
  }
  saveSite(vault,draft);
 }
 const draft=readSite(vault); // Validate before moving any originals.
 for(const name of ['站点设置.md','首页介绍.md','关于.md','使用说明.md','站点管理使用说明.md']){
  const file=path.join(vault,'blog',name);
  if(!fs.existsSync(file))continue;
  const backup=path.join(pluginDir(vault),'legacy-site-notes');fs.mkdirSync(backup,{recursive:true});
  let dest=path.join(backup,name);
  if(fs.existsSync(dest))dest=path.join(backup,`${Date.now()}-${name}`);
  fs.renameSync(file,dest);
 }
 return draft;
}
module.exports={storagePath,readSite,saveSite,patchSite,migrateSite,markdownBody};

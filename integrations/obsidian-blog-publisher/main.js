const { Plugin, Modal, Notice, Setting, PluginSettingTab, FuzzySuggestModal, MarkdownRenderer, Component } = require('obsidian');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
let siteStore, fields;
class Confirm extends Modal {
 constructor(app, file, action, site = false) { super(app); this.file = file; this.action = action; this.site = site; }
 onOpen() {
  this.contentEl.createEl('h3', { text: '发布到公开博客' });
  this.contentEl.createEl('p', { text: this.site ? "同步站点设置、首页介绍、关于页及引用的图片。文章和其他笔记不会一并发布。构建通过后推送 GitHub，并上传到 Cloudflare Pages。" : `只同步「${this.file.basename}」和它引用的图片。其他笔记不会被提交。构建通过后推送 GitHub，并上传到 Cloudflare Pages。` });
  new Setting(this.contentEl).addButton(b => b.setButtonText(this.site ? '发布站点设置' : '发布这篇文章').setCta().onClick(() => { this.close(); this.action(); })).addButton(b => b.setButtonText('取消').onClick(() => this.close()));
 }
}
class Log extends Modal {
 constructor(app,options={}){super(app);this.options=options;this.output='';this.state={message:'正在准备…'};}
 onOpen(){
  this.contentEl.empty();this.modalEl.addClass('blog-operation');
  this.contentEl.createEl('h2',{text:this.options.title||'同步博客'});
  if(this.options.subject)this.contentEl.createEl('p',{text:this.options.subject,cls:'blog-muted'});
  this.summary=this.contentEl.createDiv({cls:'blog-operation-summary'});
  this.steps=this.contentEl.createEl('ol',{cls:'blog-operation-steps'});
  this.steps.hidden=!this.options.publish;
  const details=this.contentEl.createEl('details',{cls:'blog-operation-details'});details.createEl('summary',{text:'查看详细日志'});
  this.pre=details.createEl('pre',{text:this.output});this.details=details;
  this.footer=this.contentEl.createDiv({cls:'blog-toolbar'});this.render();
 }
 append(text){this.output=(this.output+text).slice(-30000);if(this.pre){const follow=this.pre.scrollHeight-this.pre.scrollTop-this.pre.clientHeight<40;this.pre.setText(this.output);if(follow)this.pre.scrollTop=this.pre.scrollHeight;}}
 progress(value){if(['building','images','pushing','deploying'].includes(value.stage))this.lastStage=value.stage;this.state=value;this.render();}
 render(){
  if(!this.summary)return;this.summary.empty();this.steps.empty();this.footer.empty();
  this.summary.createEl('strong',{text:this.state.message});
  if(this.options.publish){
   const stages=[['building','检查与构建'],['images','压缩与上传图片'],['pushing','推送 GitHub'],['deploying','部署网站']];
   const active=stages.findIndex(([id])=>id===this.lastStage),complete=this.finished&&this.ok;
   for(const [i,[,label]]of stages.entries()){
    const done=complete?(this.state.stage==='pushed'?i<3:true):i<active,current=!this.finished&&i===active;
    this.steps.createEl('li',{text:`${done?'✓ ':current?'进行中 · ':''}${label}`,cls:done?'is-done':current?'is-current':''});
   }
  }
  if(this.url)this.summary.createEl('a',{text:this.options.publish?'查看已发布内容 ↗':'打开本地预览 ↗',attr:{href:this.url,target:'_blank',rel:'noopener noreferrer'}});
  if(this.finished&&!this.ok){this.summary.createEl('p',{text:this.error||'展开详细日志查看原因；修正后可以重试。'});this.details.open=true;}
  else if(!this.finished)this.summary.createEl('p',{text:'可以关闭此窗口，操作会继续；从博客菜单可再次查看。',cls:'blog-muted'});
  if(this.finished&&!this.ok&&this.options.retry)this.footer.createEl('button',{text:'重新检查并重试'}).addEventListener('click',()=>{this.close();this.options.retry();});
  this.footer.createEl('button',{text:this.finished?'关闭':'后台继续'}).addEventListener('click',()=>this.close());
 }
 finish(ok,{message,url,error}={}){this.finished=true;this.ok=ok;this.url=url;this.error=error;this.state={...this.state,message:message||(ok?'操作完成':'操作未完成')};this.render();}
 published(repoPath,slug){
  let deploy,site;
  try{deploy=JSON.parse(fs.readFileSync(path.join(repoPath,'.blog-deploy.json'),'utf8'));}catch{}
  try{site=JSON.parse(fs.readFileSync(path.join(repoPath,'src/config/site.json'),'utf8'));}catch{}
  let url;try{const base=new URL(site?.url);if(base.protocol==='https:'&&!base.username&&!base.password)url=new URL(slug?`blog/${encodeURIComponent(slug)}/`:'',base.href.replace(/\/?$/,'/')).href;}catch{}
  this.finish(true,{message:deploy?.enabled===true?'已发布到正式网站':'已推送 GitHub，等待网站部署',...(deploy?.enabled===true?{url}:{})});
 }
}
class NewPost extends Modal {
 constructor(app) { super(app); this.title = ''; this.description=''; }
 onOpen() {
  this.contentEl.createEl('h3', { text:'新建博客文章' });
  new Setting(this.contentEl).setName('标题').addText(t => {t.setPlaceholder('这篇文章叫什么？').onChange(v => this.title = v);setTimeout(()=>t.inputEl.focus(),0);});
  new Setting(this.contentEl).setName('摘要').setDesc('显示在文章列表中，也可以写完正文后再补。').addTextArea(t=>t.setPlaceholder('用一两句话介绍文章').onChange(v=>this.description=v));
  new Setting(this.contentEl).addButton(b => b.setButtonText('创建草稿').setCta().onClick(async () => {
   if (!this.title.trim()) return new Notice('请填写标题');
   const date = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
   const slug = `post-${Date.now()}`;
   if (!this.app.vault.getAbstractFileByPath('blog')) await this.app.vault.createFolder('blog');
   const f = await this.app.vault.create(`blog/${slug}.md`, `---\ntitle: ${JSON.stringify(this.title.trim())}\nslug: ${slug}\ndescription: ${JSON.stringify(this.description.trim())}\npubDate: ${date}\ntags: []\nheroImage: ""\ndraft: true\n---\n\n`);
   this.close(); await this.app.workspace.getLeaf().openFile(f);
  }));
 }
}
const bytes=n=>n<1024?`${n} B`:n<1024*1024?`${(n/1024).toFixed(1)} KB`:`${(n/1024/1024).toFixed(1)} MB`;
class ImageDetails extends Modal {
 constructor(app,plugin,file,choose){super(app);Object.assign(this,{plugin,file,choose});}
 async onOpen(){
  this.contentEl.createEl('h3',{text:'确认图片'});
  this.contentEl.createEl('img',{cls:'blog-image-detail',attr:{src:this.app.vault.getResourcePath(this.file),alt:this.file.name}});
  this.contentEl.createEl('p',{text:this.file.path});const info=this.contentEl.createEl('p',{text:'正在读取尺寸和计算压缩体积…'});
  new Setting(this.contentEl).addButton(b=>b.setButtonText('使用这张图').setCta().onClick(()=>{this.close();this.choose(this.file);})).addButton(b=>b.setButtonText('取消').onClick(()=>this.close()));
  try{const value=await this.plugin.rpc('image-info',this.file.path);info.setText(`${value.width||'?'} × ${value.height||'?'} · 原图 ${bytes(value.originalBytes)} · 启用 R2 后预计 ${bytes(value.optimizedBytes)}${value.optimizedBytes<value.originalBytes?`（减少 ${Math.round((1-value.optimizedBytes/value.originalBytes)*100)}%）`:'（保留原图）'}${value.animated?' · 动图不压缩':''}`);}catch(error){info.setText(`原图 ${bytes(this.file.stat.size)}；压缩估算失败：${error.message}`);}
 }
}
class ImagePicker extends FuzzySuggestModal {
 constructor(app,choose,plugin){super(app);this.choose=choose;this.plugin=plugin;this.setPlaceholder('搜索知识库中的图片');}
 getItems(){return this.app.vault.getFiles().filter(f=>/^(png|jpe?g|webp|gif|avif|svg)$/i.test(f.extension));}
 getItemText(file){return file.path;}
 renderSuggestion(match,el){const file=match.item;el.addClass('blog-image-option');el.createEl('img',{attr:{src:this.app.vault.getResourcePath(file),alt:'',loading:'lazy'}});const text=el.createDiv();text.createDiv({text:file.path});text.createEl('small',{text:bytes(file.stat.size)});}
 onChooseItem(file){new ImageDetails(this.app,this.plugin,file,this.choose).open();}
}
function excerpt(local,repo){
 const a=local.split('\n'),b=repo.split('\n');let start=0,end=0;
 while(start<Math.min(a.length,b.length)&&a[start]===b[start])start++;
 while(end<Math.min(a.length,b.length)-start&&a[a.length-1-end]===b[b.length-1-end])end++;
 const slice=lines=>lines.slice(Math.max(0,start-3),Math.min(lines.length,lines.length-end+3)).join('\n');
 return [slice(a),slice(b)];
}
class Conflicts extends Modal {
 constructor(app,plugin,report){super(app);Object.assign(this,{plugin,report,choices:{}});}
 onOpen(){
  this.modalEl.addClass('blog-conflicts');this.contentEl.createEl('h2',{text:'处理同步差异'});
  this.contentEl.createEl('p',{text:'两边的修改不会自动覆盖。请逐项选择；应用前会备份原内容。保留本地的内容仍需点击发布才会上线。'});
  for(const item of this.report.conflicts){
   this.contentEl.createEl('h3',{text:item.label});this.contentEl.createEl('p',{text:item.reason});
   const value=v=>v==null?'（此处已删除）':typeof v==='string'?v:JSON.stringify(v,null,2);
   const local=value(item.local),repo=value(item.repo),snippets=excerpt(local,repo),columns=this.contentEl.createDiv({cls:'blog-diff-columns'});
   for(const [i,label]of ['Obsidian 本地','仓库版本'].entries()){const col=columns.createDiv();col.createEl('strong',{text:label});col.createEl('pre',{text:snippets[i]||'（空内容）'});const full=col.createEl('details');full.createEl('summary',{text:'查看完整内容'});full.createEl('pre',{text:i===0?local:repo});}
   new Setting(this.contentEl).setName(`保留哪一边：${item.label}`).addDropdown(d=>d.addOption('','请选择处理方式').addOption('local',item.local===null?'保留本地删除，远程暂保留':'保留本地修改，稍后发布').addOption('repo',item.repo===null?'接受仓库删除，原文留备份':'使用仓库版本更新本地').onChange(v=>{this.choices[item.id]=v;this.apply.setDisabled(this.report.conflicts.some(c=>!this.choices[c.id]));}));
  }
  new Setting(this.contentEl).addButton(b=>{this.apply=b;b.setButtonText('备份并应用选择').setCta().setDisabled(true).onClick(()=>{this.close();this.plugin.syncChanges({token:this.report.token,choices:this.choices});});}).addButton(b=>b.setButtonText('稍后处理').onClick(()=>this.close()));
 }
}
class ValidationIssues extends Modal {
 constructor(app,plugin,issues){super(app);Object.assign(this,{plugin,issues});}
 onOpen(){this.contentEl.createEl('h3',{text:'发布前需要修改'});for(const issue of this.issues){this.contentEl.createEl('p',{text:issue.message});new Setting(this.contentEl).addButton(b=>b.setButtonText(issue.file?'打开文章':'前往对应设置').onClick(async()=>{this.close();if(issue.file){const file=this.app.vault.getAbstractFileByPath(issue.file);if(file)await this.app.workspace.getLeaf().openFile(file);}else this.plugin.openSettings(issue.field);}));}}
}
class BlogMenu extends Modal {
 constructor(app,plugin){super(app);this.plugin=plugin;}
 onOpen(){
  this.contentEl.createEl('h2',{text:'博客'});
  const file=this.app.workspace.getActiveFile(),article=this.plugin.isArticle(file);
  if(article){
   const fm=this.app.metadataCache.getFileCache(file)?.frontmatter||{};
   this.contentEl.createEl('h3',{text:fm.title||file.basename});
   this.contentEl.createEl('p',{text:fm.draft===true?'本地草稿 · 预览满意后即可发布':'博客文章 · 发布会更新这篇文章',cls:'blog-muted'});
   const bar=this.contentEl.createDiv({cls:'blog-toolbar'});
   for(const [label,action]of [['预览文章',()=>this.plugin.current('preview')],['发布文章',()=>this.plugin.current('publish')],['更换封面',()=>this.plugin.chooseImage()]])bar.createEl('button',{text:label,cls:label==='发布文章'?'mod-cta':''}).addEventListener('click',()=>{this.close();action();});
  }else this.contentEl.createEl('p',{text:'打开 blog 文件夹中的文章，即可在这里预览、发布和设置封面。',cls:'blog-muted'});
  for(const [name,desc,label,action]of [
   ['写一篇文章','在 blog 文件夹创建 Markdown 草稿','新建草稿',()=>new NewPost(this.app).open()],
   ['管理网站','首页、关于、图片、外观与评论','站点设置',()=>this.plugin.openSettings()]
  ])new Setting(this.contentEl).setName(name).setDesc(desc).addButton(b=>b.setButtonText(label).onClick(()=>{this.close();action();}));
  if(this.plugin.operationLog)new Setting(this.contentEl).setName(this.plugin.busy?'博客操作正在进行':'最近一次操作').addButton(b=>b.setButtonText('查看进度与结果').onClick(()=>{this.close();this.plugin.operationLog.open();}));
 }
}
class SettingsFinder extends FuzzySuggestModal {
 constructor(app,plugin){super(app);this.plugin=plugin;this.setPlaceholder('搜索设置：封面、首页介绍、评论、页脚…');}
 getItems(){return [...fields.map(f=>({label:f.label,section:sectionFor(f.label)})),{label:'首页介绍',section:'页面内容'},{label:'关于页正文',section:'页面内容'},{label:'Cloudflare R2 图床',section:'图片与图床'},{label:'同步备份',section:'高级'}];}
 getItemText(item){return `${item.label} · ${item.section}`;}
 onChooseItem(item){this.plugin.openSettings(item.label);}
}
module.exports = class BlogPublisher extends Plugin {
 async onload() {
  const installed=path.join(this.app.vault.adapter.getBasePath(),'.obsidian/plugins',this.manifest.id);
  const nativeRequire=require('node:module').createRequire(path.join(installed,'main.js')),storePath=nativeRequire.resolve(path.join(installed,'site-store.cjs'));
  delete nativeRequire.cache[storePath];siteStore=nativeRequire(storePath);
  fields=JSON.parse(fs.readFileSync(path.join(installed,'site-fields.json'),'utf8'));
  this.config = Object.assign({repoPath:'',nodePath:'/usr/local/bin/node'},await this.loadData());
  this.settingsTab=new Settings(this.app,this);this.addSettingTab(this.settingsTab);
  this.addCommand({id:'settings',name:'打开博客设置',callback:()=>this.openSettings()});
  this.addRibbonIcon('notebook-pen','博客',()=>new BlogMenu(this.app,this).open());
  this.registerEvent(this.app.workspace.on('active-leaf-change',()=>this.renderCover()));
  this.registerEvent(this.app.metadataCache.on('changed',()=>this.renderCover()));
  this.app.workspace.onLayoutReady(()=>{this.renderCover();this.refreshSync(true,true);});
  this.registerEvent(this.app.vault.on('modify',file=>{if(file.path.startsWith('blog/')&&file.extension==='md')this.scheduleStatus();}));
  this.addCommand({id:'new',name:'新建文章',callback:()=>new NewPost(this.app).open()});
  this.addCommand({id:'preview',name:'预览当前文章',callback:()=>this.current('preview')});
  this.addCommand({id:'publish',name:'发布当前文章',callback:()=>this.current('publish')});
 }
 openSettings(field){
  if(field){this.settingsTab.focusField=field;this.settingsTab.section=sectionFor(field);this.settingsTab.pageSection=field.startsWith('关于')?'关于页':field.startsWith('文章列表')?'文章列表':'首页';}
  this.app.setting.open();this.app.setting.openTabById(this.manifest.id);
 }
 isArticle(file){return file?.path.startsWith('blog/')&&file.extension==='md'&&!['站点设置','首页介绍','关于','使用说明','站点管理使用说明'].includes(file.basename);}
 rpc(action,arg){
  return new Promise((resolve,reject)=>{
   const vault=this.app.vault.adapter.getBasePath(),args=[path.join(this.config.repoPath,'scripts/sync.mjs'),action,vault];if(arg!==undefined)args.push(typeof arg==='string'?arg:JSON.stringify(arg));
   const child=spawn(this.config.nodePath,args,{cwd:this.config.repoPath,env:{...process.env,PATH:`${path.dirname(this.config.nodePath)}:/opt/homebrew/bin:/usr/local/bin:${process.env.PATH||''}`},shell:false});
   let output='',errors='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>errors+=d);child.on('error',reject);
   child.on('close',code=>{let result;try{result=JSON.parse(output.trim().split('\n').at(-1));}catch{return reject(new Error(errors.trim()||'检查未返回有效结果'));}if(code!==0||result.error)reject(new Error(result.error||errors||'博客检查失败'));else resolve(result);});
  });
 }
 scheduleStatus(){clearTimeout(this.statusTimer);this.statusTimer=setTimeout(()=>this.refreshSync(false,true),1200);}
 async refreshSync(fetchRemote=false,quiet=false){
  if(this.busy||this.checking||!this.config.repoPath)return;
  this.checking=true;this.settingsTab.updateStatus();
  try{this.syncReport=await this.rpc(fetchRemote?'check':'status');this.syncError='';if(fetchRemote)this.remoteError='';this.pendingSite=false;}
  catch(error){if(fetchRemote)this.remoteError=error.message;else this.syncError=error.message;if(!quiet)new Notice(`检查失败：${error.message}`);}
  finally{this.checking=false;this.settingsTab.updateStatus();}
 }
 async syncChanges(options){
  if(this.busy||this.checking)return new Notice('博客操作正在进行，请稍后重试');
  const view=this.app.workspace.getActiveViewOfType(require('obsidian').MarkdownView);
  try{if(view?.file?.path.startsWith('blog/'))await view.save();}catch(error){return new Notice(`保存文章失败：${error.message}`);}
  this.busy=true;const log=new Log(this.app,{retry:()=>this.syncChanges()});this.operationLog=log;log.open();log.progress({message:'正在检查更新、保存备份并同步…'});this.settingsTab.updateStatus('正在同步变化');
  try{
   const result=await this.rpc(options?'resolve':'sync',options);log.finish(true,{message:result.needsReview?'发现两边都有修改，请在差异窗口选择':`同步完成，导入 ${result.imported} 项变化`});log.close();this.syncReport=result;this.syncError='';
   if(result.needsReview)new Conflicts(this.app,this,result).open();else{new Notice(`同步完成，导入 ${result.imported} 项变化；本地草稿已保留`);this.settingsTab.display();}
  }catch(error){log.append(`\n同步未完成：${error.message}`);log.finish(false,{error:error.message});this.syncError=error.message;new Notice('同步未完成，请查看原因');}
  finally{this.busy=false;this.settingsTab.updateStatus();}
 }
 async preflight(file,site){
  if(this.busy||this.checking){new Notice('博客操作正在进行，请稍后重试');return false;}
  try{
   if(!site){const view=this.app.workspace.getActiveViewOfType(require('obsidian').MarkdownView);if(view?.file?.path===file.path)await view.save();}
   const result=await this.rpc('validate',site?undefined:file.path);
   if(!result.ok){new ValidationIssues(this.app,this,result.issues).open();return false;}return true;
  }catch(error){new Notice(`检查失败：${error.message}`);return false;}
 }

 loadSite(){
  const vault=this.app.vault.adapter.getBasePath();
  if(!fs.existsSync(siteStore.storagePath(vault)))throw new Error('请先运行博客插件安装器，导入已有站点配置。');
  this.siteDraft=siteStore.readSite(vault);this.siteBase=JSON.parse(JSON.stringify(this.siteDraft));return this.siteDraft;
 }
 saveSite(){
  const result=siteStore.patchSite(this.app.vault.adapter.getBasePath(),this.siteBase,this.siteDraft);
  Object.assign(this.siteDraft,result.value);this.siteBase=JSON.parse(JSON.stringify(result.value));
  if(result.external.length){new Notice(`已保留别处更新的设置：${result.external.join('、')}`);this.settingsTab.focusField=document.activeElement?.getAttribute('aria-label');this.settingsTab.display();}
 }
 async siteAction(action){
  if(this.siteSaveError)return new Notice('站点草稿尚未保存成功，请先修正设置中的保存错误。');
  if(!await this.preflight(null,true))return;
  if(action==='publish')new Confirm(this.app,null,()=>this.execute(action,null,true),true).open();else this.execute(action,null,true);
 }
 chooseImage(target,key='heroImage'){
  const f=target?this.app.vault.getAbstractFileByPath(target):this.app.workspace.getActiveFile();
  if(!f||!f.path.startsWith('blog/')||f.extension!=='md'||(!target&&['站点设置','首页介绍','关于','使用说明'].includes(f.basename)))return new Notice('请先打开一篇博客文章');
  new ImagePicker(this.app,async image=>{await this.app.fileManager.processFrontMatter(f,fm=>fm[key]=image.path);new Notice('封面已更新，预览后可发布');this.renderCover();},this).open();
 }
 renderCover(){
  const view=this.app.workspace.getActiveViewOfType(require('obsidian').MarkdownView);
  if(!view)return;
  view.containerEl.querySelector('.blog-cover-preview')?.remove();
  const f=view.file;if(!f?.path.startsWith('blog/'))return;
  const fm=this.app.metadataCache.getFileCache(f)?.frontmatter;
  const raw=fm?.heroImage;if(typeof raw!=='string'||!raw.trim())return;
  const target=raw.replace(/^!?\[\[|\]\]$/g,'');
  let url;if(/^https?:\/\//.test(target))url=target;else{const image=this.app.metadataCache.getFirstLinkpathDest(target,f.path);if(image)url=this.app.vault.getResourcePath(image);}
  if(!url)return;
  const panel=createDiv({cls:'blog-cover-preview'});
  panel.createEl('img',{attr:{src:url,alt:'文章封面'}});
  const detail=panel.createDiv();detail.createEl('strong',{text:'文章封面'});detail.createEl('div',{text:'发布后显示在文章顶部和列表中'});
  detail.createEl('button',{text:'更换封面'}).addEventListener('click',()=>this.chooseImage(f.path));
  view.containerEl.querySelector('.view-header')?.insertAdjacentElement('afterend',panel);
 }
 onunload(){clearTimeout(this.statusTimer);this.settingsTab.cleanupPreviews();document.querySelectorAll('.blog-cover-preview').forEach(el=>el.remove());}
 async current(action) {
  const f = this.app.workspace.getActiveFile();
  if (f && ['blog/站点设置.md','blog/首页介绍.md','blog/关于.md','blog/使用说明.md','blog/站点管理使用说明.md'].includes(f.path)) return this.openSettings();
  if (!f || !f.path.startsWith('blog/') || f.extension !== 'md') return new Notice('请先打开 blog 文件夹中的一篇文章');
  if(!await this.preflight(f,false))return;
  if (action === 'publish') new Confirm(this.app,f,()=>this.execute(action,f)).open();
  else this.execute(action,f);
 }
 async execute(action,file,site=false,media=false) {
  if (this.busy) return new Notice('上一个博客操作尚未完成');
  if (!this.config.repoPath) return new Notice('请先在「博客发布」设置中填写博客仓库路径');
  this.busy = true;
  // Flush the editor before reading the Markdown from disk.
  const view = this.app.workspace.getActiveViewOfType(require('obsidian').MarkdownView);
  try { if (view && !media && !site && view.file?.path === file.path) await view.save(); } catch (e) { this.busy=false; return new Notice(`保存文章失败：${e.message}`); }
  const slug=file?this.app.metadataCache.getFileCache(file)?.frontmatter?.slug:null;
  const log=new Log(this.app,{title:media?'图床连接':action==='preview'?'预览博客':'发布博客',subject:site?'首页、关于页和站点设置':file?(this.app.metadataCache.getFileCache(file)?.frontmatter?.title||file.basename):'',publish:action==='publish'&&!media,retry:async()=>{if(media||await this.preflight(file,site))this.execute(action,file,site,media);}});
  this.operationLog=log;this.publishProgress=null;log.open();log.progress({message:media?'正在连接 Cloudflare…':action==='preview'?'正在准备本地预览…':'正在检查发布内容…'});this.settingsTab.updateStatus();
  const vault = this.app.vault.adapter.getBasePath();
  const args=media?[path.join(this.config.repoPath,'scripts/media.mjs'),action]:[path.join(this.config.repoPath,site?'scripts/site.mjs':'scripts/obsidian.mjs'),action,vault,...(site?[]:[path.join(vault,file.path)])];
  const child = spawn(this.config.nodePath,args,{
   cwd:this.config.repoPath, env:{...process.env, PATH:`${path.dirname(this.config.nodePath)}:/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ''}`}, shell:false
  });
  let pending='';
  child.stdout.on('data',d=>{pending+=d.toString();const lines=pending.split('\n');pending=lines.pop();for(const line of lines){if(line.startsWith('@blog-progress ')){try{this.publishProgress=JSON.parse(line.slice(15));log.progress(this.publishProgress);this.settingsTab.updateStatus();}catch{}}else log.append(line+'\n');}});child.stderr.on('data',d=>log.append(d.toString()));
  let startError;
  child.on('error',e=>{startError=e.message;log.append(`\n启动失败：${e.message}`);});
  child.on('close',code=>{if(pending)log.append(pending);this.busy=false;this.scheduleStatus();this.settingsTab.updateStatus();
   if(code===0&&action==='publish'&&!media)log.published(this.config.repoPath,slug);
   else log.finish(code===0,{message:code===0?(action==='preview'?'预览已打开，正式网站尚未更新':'图床连接操作完成'):'操作未完成',url:code===0&&action==='preview'?`http://127.0.0.1:4322/${site?'':`blog/${encodeURIComponent(slug)}/`}`:undefined,error:startError||this.publishProgress?.stage==='failed'&&this.publishProgress.message||undefined});
   new Notice(code===0?(action==='publish'&&!media?'发布完成，可从博客菜单查看结果':'博客操作完成'):'博客操作失败，请查看原因');});
 }
};
function sectionFor(label){
 if(label==='Cloudflare R2 图床')return '图片与图床';if(label==='同步备份')return '高级';
 const f=fields.find(f=>f.label===label),key=f?.key;
 if(['首页介绍','关于页正文'].includes(label)||['homeHeading','latestHeading','latestCount','allPostsText','aboutHeading','aboutDescription','blogHeading','blogDescription'].includes(key))return '页面内容';
 if(f?.type==='image')return '图片与图床';if(['commentsEnabled','giscusRepo','giscusRepoId','giscusCategoryId'].includes(key))return '评论';
 if(['title','description','author','url','language'].includes(key))return '基本信息';return '导航与外观';
}
class Settings extends PluginSettingTab {
 constructor(app,plugin){super(app,plugin);this.plugin=plugin;this.section='基本信息';this.pageSection='首页';}
 display(){
  this.cleanupPreviews();this.fieldInputs=new Map();const el=this.containerEl;el.empty();el.addClass('blog-settings');
  el.createEl('h2',{text:'博客设置'});
  let draft;
  try{draft=this.plugin.loadSite();}catch(error){el.createEl('p',{text:error.message});this.advanced(el);return;}
  const actions=el.createDiv({cls:'blog-settings-actions'});
  const bar=actions.createDiv({cls:'blog-toolbar'});this.operationButtons=[];
  for(const [label,action]of [['预览站点',()=>this.plugin.siteAction('preview')],['发布站点设置',()=>this.plugin.siteAction('publish')]]){const button=bar.createEl('button',{text:label,cls:label==='发布站点设置'?'mod-cta':''});button.addEventListener('click',action);this.operationButtons.push(button);}
  bar.createEl('button',{text:'搜索设置…'}).addEventListener('click',()=>new SettingsFinder(this.app,this.plugin).open());
  this.status=actions.createEl('small',{text:'更改会自动保存到本地'});
  this.syncStatus=el.createDiv({cls:'blog-sync-status'});this.updateStatus();
  const tabs=el.createDiv({cls:'blog-settings-tabs'});
  for(const name of ['基本信息','页面内容','图片与图床','导航与外观','评论','高级']){
   const button=tabs.createEl('button',{text:name,cls:this.section===name?'mod-cta':'',attr:{'aria-pressed':String(this.section===name)}});
   button.addEventListener('click',()=>{this.section=name;this.display();});
  }
  const body=el.createDiv({cls:'blog-settings-body'});
  const group=(title,keys)=>{body.createEl('h3',{text:title});for(const key of keys)this.field(body,fields.find(f=>f.key===key),draft);};
  if(this.section==='基本信息')group('站点信息',['title','description','author','url','language']);
  if(this.section==='页面内容'){
   const pages=body.createDiv({cls:'blog-toolbar blog-page-tabs'});
   for(const name of ['首页','关于页','文章列表'])pages.createEl('button',{text:name,cls:this.pageSection===name?'mod-cta':'',attr:{'aria-pressed':String(this.pageSection===name)}}).addEventListener('click',()=>{this.pageSection=name;this.display();});
   if(this.pageSection==='首页'){group('首页',['homeHeading']);this.page(body,'首页介绍','home',draft);group('首页文章列表',['latestHeading','latestCount','allPostsText']);}
   if(this.pageSection==='关于页'){group('关于页',['aboutHeading','aboutDescription']);this.page(body,'关于页正文','about',draft);}
   if(this.pageSection==='文章列表')group('文章列表页',['blogHeading','blogDescription']);
  }
  if(this.section==='图片与图床'){
   group('站点图片',['homeCover','avatar','defaultCover','favicon']);this.media(body);
  }
  if(this.section==='导航与外观'){
   group('导航与联系方式',['navigation','socialLinks']);
   group('外观',['accentLight','accentDark','contentWidth','fontSize']);
   group('文章显示',['showDates','showTags','showListCovers','showArticleCover']);
   group('页脚',['footerText','copyrightStartYear','showRss','showPoweredBy']);
  }
  if(this.section==='评论'){
   body.createEl('p',{text:'评论由 Giscus 提供，访客使用 GitHub 登录。已配置的仓库信息会保留。'});
   group('Giscus 评论',['commentsEnabled','giscusRepo','giscusRepoId','giscusCategoryId']);
  }
  if(this.section==='高级')this.advanced(body);
  el.scrollTop=0;
  if(this.focusField){const input=this.fieldInputs?.get(this.focusField);input?.focus({preventScroll:true});if(input?.tagName==='TEXTAREA')input.setSelectionRange(0,0);input?.scrollIntoView({block:'center'});this.focusField=null;}
 }
 changed(){
  try{this.plugin.saveSite();this.plugin.siteSaveError=false;this.plugin.pendingSite=true;this.status.setText('草稿已保存，点击发布后上线');this.updateStatus();this.plugin.scheduleStatus();}
  catch(error){this.plugin.siteSaveError=true;this.status.setText(`保存失败：${error.message}`);new Notice(`保存失败：${error.message}`);}
 }
 field(el,f,draft){
  this.fieldInputs??=new Map();const setting=new Setting(el).setName(f.label),value=draft.values[f.label]??f.default;
  setting.settingEl.tabIndex=-1;this.fieldInputs.set(f.label,setting.settingEl);
  const update=v=>{draft.values[f.label]=v;this.changed();};
  if(f.type==='boolean'){setting.addToggle(t=>t.setValue(value).onChange(update));return;}
  if(f.type==='links'){
   setting.setDesc('每行一项：名称 | 地址。按行的顺序显示。').addTextArea(t=>{t.setValue(value.map(v=>typeof v==='string'?v:`${v.label} | ${v.href}`).join('\n')).onChange(v=>update(v.split('\n').filter(l=>l.trim())));t.inputEl.rows=4;});return;
  }
  if(f.type==='number')setting.setDesc(`范围 ${f.min}–${f.max}`);
  if(f.type==='image')setting.setDesc('选择知识库图片，或填写 HTTPS 图片网址；留空可取消。');
  let imagePreview;
  const refreshImage=value=>{
   if(!imagePreview)return;imagePreview.empty();const raw=String(value||'').replace(/^!?\[\[|\]\]$/g,'');let url;
   if(/^https:\/\//.test(raw))url=raw;else{const file=this.app.metadataCache.getFirstLinkpathDest(raw,'blog/首页介绍.md');if(file)url=this.app.vault.getResourcePath(file);}
   if(url)imagePreview.createEl('img',{attr:{src:url,alt:f.label,loading:'lazy'}});else imagePreview.createEl('small',{text:raw?'已填写图片路径，可预览站点查看效果':'未设置图片'});
  };
  setting.addText(t=>{
   this.fieldInputs.set(f.label,t.inputEl);t.inputEl.setAttribute('aria-label',f.label);t.setValue(String(value)).onChange(v=>{update(f.type==='number'?(v.trim()===''?'':Number(v)):v);if(f.type==='image')refreshImage(v);});
   if(f.type==='number'){t.inputEl.type='number';t.inputEl.min=f.min;t.inputEl.max=f.max;}
   if(f.type==='image'){
    setting.addButton(b=>b.setButtonText('选图').onClick(()=>new ImagePicker(this.app,image=>{t.setValue(image.path);update(image.path);refreshImage(image.path);},this.plugin).open()));
    setting.addExtraButton(b=>b.setIcon('x').setTooltip(`清除${f.label}`).onClick(()=>{t.setValue('');update('');refreshImage('');}));
   }
  });
  if(f.type==='image'){setting.settingEl.addClass('blog-image-field');imagePreview=el.createDiv({cls:'blog-setting-image'});refreshImage(value);}
 }
 cleanupPreviews(){for(const value of this.previews||[]){clearTimeout(value.timer);value.component?.unload();if(value.component)this.plugin.removeChild(value.component);}this.previews=[];}
 hide(){this.cleanupPreviews();}
 updateStatus(message){
  if(!this.syncStatus)return;const expanded=this.syncStatus.querySelector('details')?.open;this.syncStatus.empty();const p=this.plugin;
  for(const button of this.operationButtons||[])button.disabled=Boolean(p.busy||p.checking);
  let report=p.syncReport,publication=p.publishProgress;
  const folder=path.dirname(siteStore.storagePath(this.app.vault.adapter.getBasePath()));
  try{report??=JSON.parse(fs.readFileSync(path.join(folder,'sync-status.json'),'utf8'));}catch{}
  try{publication??=JSON.parse(fs.readFileSync(path.join(folder,'publish-status.json'),'utf8'));}catch{}
  const c=report?.counts||{},lines=[],blocked=p.busy||p.checking;
  let headline='尚未检查更新';
  if(report)headline=c.conflict?`有 ${c.conflict} 项冲突，需要处理`:c.remote||report.behind?`发现外部变化，建议先同步`:c.local||p.pendingSite?`有待发布修改，草稿已保存`:'本地与仓库已同步';
  if(p.pendingSite&&!c.conflict&&!c.remote&&!report?.behind)headline='有待发布修改，草稿已保存';
  if(report?.issues?.length)headline=`有 ${report.issues.length} 项内容需要检查，展开详情查看`;
  if(report?.ahead)headline=report.behind?'仓库提交已分叉，需要先合并':'有尚未推送的提交，发布前请检查详情';
  if(report?.dirty)headline='仓库有未提交修改，暂不能同步或发布';
  if(report?.branch&&report.branch!=='main')headline='写作工具正在更新，完成后即可发布';
  if(publication?.stage==='failed')headline='上次发布未完成，可查看操作结果';
  if(p.syncError||p.remoteError)headline='更新检查未完成，请查看详情';
  if(message)headline=message;else if(p.checking)headline='正在检查更新…';else if(p.busy)headline=p.operationLog?.state.message||'博客操作进行中…';
  this.syncStatus.createEl('strong',{text:headline});
  const actions=this.syncStatus.createDiv({cls:'blog-toolbar'}),button=(label,action)=>{const b=actions.createEl('button',{text:label});b.disabled=Boolean(blocked);b.addEventListener('click',action);};
  button('检查更新',()=>p.refreshSync(true));
  if(c.remote||c.conflict||report?.behind)button(c.conflict?'处理差异':'同步变化',()=>p.syncChanges());
  if(p.operationLog)actions.createEl('button',{text:p.busy?'查看进度':'查看最近结果'}).addEventListener('click',()=>p.operationLog.open());
  const detail=this.syncStatus.createEl('details');detail.open=Boolean(expanded);detail.createEl('summary',{text:'同步详情与工具'});
  if(report){
   lines.push(`待发布 ${c.local} 项 · 外部变化 ${c.remote} 项 · 冲突 ${c.conflict} 项`);
   if(report.branch!=='main')lines.push(`当前仓库分支：${report.branch}，发布需要 main 分支`);
   if(report.dirty)lines.push('仓库有未提交修改；同步和发布前需要先处理');
   if(report.ahead&&report.behind)lines.push('本地与远程提交已分叉，需要先处理 Git 合并');else if(report.behind)lines.push(`GitHub 领先 ${report.behind} 个提交，点击同步变化`);else if(report.ahead)lines.push(`本机仓库有 ${report.ahead} 个未推送提交，请先推送后发布`);
   if(report.issues?.length)lines.push(`有 ${report.issues.length} 项内容需要检查`);
   lines.push(`本地检查：${new Date(report.checkedAt).toLocaleString()} · GitHub：${report.remoteCheckedAt?new Date(report.remoteCheckedAt).toLocaleString():'尚未检查成功'}`);
  }else lines.push('尚未检查仓库更新，点击「检查更新」');
  if(publication?.stage==='failed')lines.push(`上次发布未完成：${publication.message}`);
  if(report?.lastPublished)lines.push(`${report.lastPublished.deployed?'上次部署提交':'上次推送'}：${new Date(report.lastPublished.at).toLocaleString()}`);
  if(p.syncError)lines.push(`检查／同步未完成：${p.syncError}`);
  if(p.remoteError)lines.push(`GitHub 检查未完成：${p.remoteError}`);
  for(const line of lines)detail.createDiv({text:line});
  const tools=detail.createDiv({cls:'blog-toolbar'});
  for(const [label,action]of [['同步变化',()=>p.syncChanges()],['检查站点内容',async()=>{if(await p.preflight(null,true))new Notice('站点内容检查通过');}]]){const b=tools.createEl('button',{text:label});b.disabled=Boolean(blocked);b.addEventListener('click',action);}
 }
 page(el,label,key,draft){
  const setting=new Setting(el).setName(label).setDesc('支持 Markdown 和 ![[图片名]]；更改自动保存，发布后上线。');setting.settingEl.addClass('blog-page-field');
  const preview=el.createEl('details',{cls:'blog-page-preview'});preview.createEl('summary',{text:'查看文字与图片预览'});
  const rendered=preview.createDiv({cls:'blog-markdown-preview markdown-rendered'}),state={timer:null,component:null,generation:0};this.previews.push(state);
  const render=async text=>{
   const generation=++state.generation;state.component?.unload();if(state.component)this.plugin.removeChild(state.component);
   state.component=new Component();this.plugin.addChild(state.component);const target=createDiv();
   try{await MarkdownRenderer.render(this.app,text,target,`blog/${key==='home'?'首页介绍':'关于'}.md`,state.component);if(generation===state.generation&&rendered.isConnected)rendered.replaceChildren(...target.childNodes);}catch(error){if(generation===state.generation)rendered.setText(`预览失败：${error.message}`);}
  };
  setting.addTextArea(t=>{this.fieldInputs??=new Map();this.fieldInputs.set(label,t.inputEl);t.setValue(draft[key]).onChange(v=>{draft[key]=v;this.changed();clearTimeout(state.timer);state.timer=setTimeout(()=>render(v),250);});t.inputEl.rows=7;t.inputEl.setAttribute('aria-label',label);});
  render(draft[key]);
 }
 media(el){
  const heading=el.createEl('h3',{text:'Cloudflare R2 图床',attr:{tabindex:'-1'}});this.fieldInputs.set('Cloudflare R2 图床',heading);
  el.createEl('p',{text:'本地图片照常插入；发布时自动压缩、上传并替换网址。预览不会上传。'});
  const file=path.join(this.plugin.config.repoPath,'.blog-media.json');
  let config={enabled:false,accountId:'',bucket:'blog-images',publicBaseUrl:''};
  try{if(fs.existsSync(file))config={...config,...JSON.parse(fs.readFileSync(file,'utf8'))};}catch(error){el.createEl('p',{text:`图床配置读取失败：${error.message}`});return;}
  el.createEl('p',{text:config.enabled?'已启用 · 发布时自动压缩上传，原图留在知识库。':'尚未启用图床。',cls:'blog-muted'});
  const details=el.createEl('details');details.open=!config.enabled;details.createEl('summary',{text:'连接设置'});el=details;
  new Setting(el).setName('发布时上传 R2').addToggle(t=>t.setValue(config.enabled===true).onChange(v=>config.enabled=v));
  for(const [key,label]of [['accountId','Cloudflare 账户 ID'],['bucket','R2 存储桶'],['publicBaseUrl','图片公开地址']])new Setting(el).setName(label).addText(t=>t.setValue(config[key]||'').onChange(v=>config[key]=v.trim()));
  new Setting(el).setName('图床连接').setDesc('连接设置仅存于本机仓库；令牌由 Cloudflare 官方工具管理。').addButton(b=>b.setButtonText('保存图床设置').onClick(()=>{
   if(config.enabled){let u;try{u=new URL(config.publicBaseUrl);}catch{}if(!/^[a-f0-9]{32}$/.test(config.accountId)||!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(config.bucket)||!u||u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.hostname.endsWith('.r2.cloudflarestorage.com'))return new Notice('请填写有效的账户 ID、桶名和公开 HTTPS 地址');}
   try{fs.writeFileSync(file,JSON.stringify(config,null,2)+'\n',{mode:0o600});new Notice('图床设置已保存');}catch(error){new Notice(error.message);}
  })).addButton(b=>b.setButtonText('检查连接').onClick(()=>this.plugin.execute('status',null,false,true))).addButton(b=>b.setButtonText('登录 Cloudflare').onClick(()=>this.plugin.execute('login',null,false,true)));
 }
 advanced(el){
  const backups=new Setting(el).setName('同步备份').setDesc('每次同步前保留原内容和处理记录。').addButton(b=>b.setButtonText('打开备份文件夹').onClick(()=>{const folder=path.join(path.dirname(siteStore.storagePath(this.app.vault.adapter.getBasePath())),'sync-backups');fs.mkdirSync(folder,{recursive:true});spawn('open',[folder],{shell:false});}));backups.settingEl.tabIndex=-1;this.fieldInputs.set('同步备份',backups.settingEl);
  el.createEl('h3',{text:'本机连接'});
  for(const [key,label] of [['repoPath','本地博客仓库路径'],['nodePath','Node.js 路径']])new Setting(el).setName(label).addText(t=>t.setValue(this.plugin.config[key]).onChange(async v=>{this.plugin.config[key]=v.trim();await this.plugin.saveData(this.plugin.config);}));
  el.createEl('p',{text:'原站点配置笔记已备份到插件的 legacy-site-notes 目录。发布只读取站点草稿和引用图片，不会发布备份或其他笔记。'});
 }
}

const { Plugin, Modal, Notice, Setting, PluginSettingTab, FuzzySuggestModal, parseYaml } = require('obsidian');
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
 onOpen() { this.contentEl.createEl('h3', { text: '博客操作日志' }); this.pre = this.contentEl.createEl('pre'); this.pre.style.whiteSpace = 'pre-wrap'; }
 append(text) { this.pre.textContent = (this.pre.textContent + text).slice(-30000); this.pre.scrollIntoView({ block:'end' }); }
 published(repoPath) {
  const summary=this.contentEl.createDiv();this.pre.before(summary);
  let deploy,site;
  try{deploy=JSON.parse(fs.readFileSync(path.join(repoPath,'.blog-deploy.json'),'utf8'));}catch{}
  try{site=JSON.parse(fs.readFileSync(path.join(repoPath,'src/config/site.json'),'utf8'));}catch{}
  summary.createEl('h2',{text:deploy?.enabled===true?'已推送 GitHub，并提交 Cloudflare 部署':'已推送 GitHub'});
  if(deploy?.enabled!==true)summary.createEl('p',{text:'本机未启用直接部署，请确认 Cloudflare 的自动部署状态。'});
  let url;try{url=new URL(site?.url);}catch{}
  if(url?.protocol==='https:'&&!url.username&&!url.password){
   summary.createEl('a',{text:`查看正式网站：${url.origin}`,attr:{href:url.origin,target:'_blank',rel:'noopener noreferrer'}});
  }
  summary.createEl('p',{text:'127.0.0.1:4322 是本地预览地址。修改内容后，点击预览或发布才会更新网页。'});
  summary.scrollIntoView({block:'start'});
 }
}
class NewPost extends Modal {
 constructor(app) { super(app); this.title = ''; }
 onOpen() {
  this.contentEl.createEl('h3', { text:'新建博客文章' });
  new Setting(this.contentEl).setName('标题').addText(t => t.onChange(v => this.title = v));
  new Setting(this.contentEl).addButton(b => b.setButtonText('创建草稿').setCta().onClick(async () => {
   if (!this.title.trim()) return new Notice('请填写标题');
   const date = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
   const slug = `post-${Date.now()}`;
   if (!this.app.vault.getAbstractFileByPath('blog')) await this.app.vault.createFolder('blog');
   const f = await this.app.vault.create(`blog/${slug}.md`, `---\ntitle: ${JSON.stringify(this.title.trim())}\nslug: ${slug}\ndescription: ""\npubDate: ${date}\ntags: []\nheroImage: ""\ndraft: true\n---\n\n`);
   this.close(); await this.app.workspace.getLeaf().openFile(f);
  }));
 }
}
class ImagePicker extends FuzzySuggestModal {
 constructor(app, choose) { super(app); this.choose=choose; this.setPlaceholder('搜索知识库中的图片'); }
 getItems(){return this.app.vault.getFiles().filter(f=>/^(png|jpe?g|webp|gif|avif|svg)$/i.test(f.extension));}
 getItemText(file){return file.path;}
 onChooseItem(file){this.choose(file);}
}
class BlogMenu extends Modal {
 constructor(app,plugin){super(app);this.plugin=plugin;}
 onOpen(){
  this.contentEl.createEl('h2',{text:'博客'});
  for(const [name,desc,action] of [
   ['新建文章','在 blog 文件夹创建 Markdown 草稿',()=>new NewPost(this.app).open()],
   ['预览当前文章','查看当前文章的网页效果',()=>this.plugin.current('preview')],
   ['发布当前文章','推送 GitHub 并部署到正式网站',()=>this.plugin.current('publish')],
   ['选择文章封面','选择知识库中的图片',()=>this.plugin.chooseImage()],
   ['站点设置','首页、关于、图片、外观、评论与发布',()=>this.plugin.openSettings()]
  ])new Setting(this.contentEl).setName(name).setDesc(desc).addButton(b=>b.setButtonText('打开').onClick(()=>{this.close();action();}));
 }
}
module.exports = class BlogPublisher extends Plugin {
 async onload() {
  const installed=path.join(this.app.vault.adapter.getBasePath(),'.obsidian/plugins',this.manifest.id);
  siteStore=require(path.join(installed,'site-store.cjs'));
  fields=JSON.parse(fs.readFileSync(path.join(installed,'site-fields.json'),'utf8'));
  this.config = Object.assign({repoPath:'',nodePath:'/usr/local/bin/node'},await this.loadData());
  this.addSettingTab(new Settings(this.app,this));
  this.addCommand({id:'settings',name:'打开博客设置',callback:()=>this.openSettings()});
  this.addRibbonIcon('notebook-pen','博客',()=>new BlogMenu(this.app,this).open());
  this.registerEvent(this.app.workspace.on('active-leaf-change',()=>this.renderCover()));
  this.registerEvent(this.app.metadataCache.on('changed',()=>this.renderCover()));
  this.app.workspace.onLayoutReady(()=>this.renderCover());
  this.addCommand({id:'new',name:'新建文章',callback:()=>new NewPost(this.app).open()});
  this.addCommand({id:'preview',name:'预览当前文章',callback:()=>this.current('preview')});
  this.addCommand({id:'publish',name:'发布当前文章',callback:()=>this.current('publish')});
 }
 openSettings(){this.app.setting.open();this.app.setting.openTabById(this.manifest.id);}
 loadSite(){
  const vault=this.app.vault.adapter.getBasePath();
  if(!fs.existsSync(siteStore.storagePath(vault)))throw new Error('请先运行博客插件安装器，导入已有站点配置。');
  this.siteDraft=siteStore.readSite(vault);return this.siteDraft;
 }
 saveSite(){siteStore.saveSite(this.app.vault.adapter.getBasePath(),this.siteDraft);}
 siteAction(action){
  if(this.siteSaveError)return new Notice('站点草稿尚未保存成功，请先修正设置中的保存错误。');
  if(action==='publish')new Confirm(this.app,null,()=>this.execute(action,null,true),true).open();
  else this.execute(action,null,true);
 }
 chooseImage(target,key='heroImage'){
  const f=target?this.app.vault.getAbstractFileByPath(target):this.app.workspace.getActiveFile();
  if(!f||!f.path.startsWith('blog/')||f.extension!=='md'||(!target&&['站点设置','首页介绍','关于','使用说明'].includes(f.basename)))return new Notice('请先打开一篇博客文章');
  new ImagePicker(this.app,async image=>{await this.app.fileManager.processFrontMatter(f,fm=>fm[key]=image.path);new Notice('封面已更新，预览后可发布');this.renderCover();}).open();
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
 onunload(){document.querySelectorAll('.blog-cover-preview').forEach(el=>el.remove());}
 current(action) {
  const f = this.app.workspace.getActiveFile();
  if (f && ['blog/站点设置.md','blog/首页介绍.md','blog/关于.md','blog/使用说明.md','blog/站点管理使用说明.md'].includes(f.path)) return this.openSettings();
  if (!f || !f.path.startsWith('blog/') || f.extension !== 'md') return new Notice('请先打开 blog 文件夹中的一篇文章');
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
  const log = new Log(this.app); log.open(); log.append(action === 'preview' ? '准备预览…\n' : '检查、构建并发布…\n');
  const vault = this.app.vault.adapter.getBasePath();
  const args=media?[path.join(this.config.repoPath,'scripts/media.mjs'),action]:[path.join(this.config.repoPath,site?'scripts/site.mjs':'scripts/obsidian.mjs'),action,vault,...(site?[]:[path.join(vault,file.path)])];
  const child = spawn(this.config.nodePath,args,{
   cwd:this.config.repoPath, env:{...process.env, PATH:`${path.dirname(this.config.nodePath)}:/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ''}`}, shell:false
  });
  child.stdout.on('data',d=>log.append(d.toString())); child.stderr.on('data',d=>log.append(d.toString()));
  child.on('error',e=>{this.busy=false;log.append(`\n启动失败：${e.message}`);});
  child.on('close',code=>{this.busy=false;log.append(code===0 ? '\n完成。\n':'\n未完成，请查看上面的原因。\n');if(code===0&&action==='publish'&&!media)log.published(this.config.repoPath);new Notice(code===0 ? (action==='publish'&&!media?'发布完成，点击日志顶部链接查看正式网站':'博客操作完成'):'博客操作失败，请查看日志');});
 }
};
class Settings extends PluginSettingTab {
 constructor(app,plugin){super(app,plugin);this.plugin=plugin;this.section='基本信息';}
 display(){
  const el=this.containerEl;el.empty();el.addClass('blog-settings');
  el.createEl('h2',{text:'博客设置'});
  el.createEl('p',{text:'文章在 blog 文件夹写，站点内容在这里维护。更改自动保存为本地草稿，点击发布后才会上线。'});
  let draft;
  try{draft=this.plugin.loadSite();}catch(error){el.createEl('p',{text:error.message});this.advanced(el);return;}
  const actions=el.createDiv({cls:'blog-settings-actions'});
  new Setting(actions).addButton(b=>b.setButtonText('预览站点').onClick(()=>this.plugin.siteAction('preview'))).addButton(b=>b.setButtonText('发布站点设置').setCta().onClick(()=>this.plugin.siteAction('publish')));
  this.status=actions.createEl('small',{text:'更改会自动保存到本地'});
  const tabs=el.createDiv({cls:'blog-settings-tabs'});
  for(const name of ['基本信息','页面内容','图片与图床','导航与外观','评论','高级']){
   const button=tabs.createEl('button',{text:name,cls:this.section===name?'mod-cta':''});
   button.addEventListener('click',()=>{this.section=name;this.display();});
  }
  const body=el.createDiv({cls:'blog-settings-body'});
  const group=(title,keys)=>{body.createEl('h3',{text:title});for(const key of keys)this.field(body,fields.find(f=>f.key===key),draft);};
  if(this.section==='基本信息')group('站点信息',['title','description','author','url','language']);
  if(this.section==='页面内容'){
   group('首页',['homeHeading']);this.page(body,'首页介绍','home',draft);
   group('首页文章列表',['latestHeading','latestCount','allPostsText']);
   group('关于页',['aboutHeading','aboutDescription']);this.page(body,'关于页正文','about',draft);
   group('文章列表页',['blogHeading','blogDescription']);
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
 }
 changed(){
  try{this.plugin.saveSite();this.plugin.siteSaveError=false;this.status.setText('草稿已保存，点击发布后上线');}
  catch(error){this.plugin.siteSaveError=true;this.status.setText(`保存失败：${error.message}`);new Notice(`保存失败：${error.message}`);}
 }
 field(el,f,draft){
  const setting=new Setting(el).setName(f.label),value=draft.values[f.label]??f.default;
  const update=v=>{draft.values[f.label]=v;this.changed();};
  if(f.type==='boolean'){setting.addToggle(t=>t.setValue(value).onChange(update));return;}
  if(f.type==='links'){
   setting.setDesc('每行一项：名称 | 地址。按行的顺序显示。').addTextArea(t=>{t.setValue(value.map(v=>typeof v==='string'?v:`${v.label} | ${v.href}`).join('\n')).onChange(v=>update(v.split('\n').filter(l=>l.trim())));t.inputEl.rows=4;});return;
  }
  if(f.type==='number')setting.setDesc(`范围 ${f.min}–${f.max}`);
  if(f.type==='image')setting.setDesc('选择知识库图片，或填写 HTTPS 图片网址；留空可取消。');
  setting.addText(t=>{
   t.setValue(String(value)).onChange(v=>update(f.type==='number'?(v.trim()===''?'':Number(v)):v));
   if(f.type==='number'){t.inputEl.type='number';t.inputEl.min=f.min;t.inputEl.max=f.max;}
   if(f.type==='image')setting.addButton(b=>b.setButtonText('选图').onClick(()=>new ImagePicker(this.app,image=>{t.setValue(image.path);update(image.path);}).open()));
  });
 }
 page(el,label,key,draft){
  const setting=new Setting(el).setName(label).setDesc('支持 Markdown 和 ![[图片名]]，无需再维护单独的笔记。');setting.settingEl.addClass('blog-page-field');
  setting.addTextArea(t=>{t.setValue(draft[key]).onChange(v=>{draft[key]=v;this.changed();});t.inputEl.rows=9;t.inputEl.setAttribute('aria-label',label);});
 }
 media(el){
  el.createEl('h3',{text:'Cloudflare R2 图床'});
  el.createEl('p',{text:'本地图片照常插入；发布时自动压缩、上传并替换网址。预览不会上传。'});
  const file=path.join(this.plugin.config.repoPath,'.blog-media.json');
  let config={enabled:false,accountId:'',bucket:'blog-images',publicBaseUrl:''};
  try{if(fs.existsSync(file))config={...config,...JSON.parse(fs.readFileSync(file,'utf8'))};}catch(error){el.createEl('p',{text:`图床配置读取失败：${error.message}`});return;}
  new Setting(el).setName('发布时上传 R2').addToggle(t=>t.setValue(config.enabled===true).onChange(v=>config.enabled=v));
  for(const [key,label]of [['accountId','Cloudflare 账户 ID'],['bucket','R2 存储桶'],['publicBaseUrl','图片公开地址']])new Setting(el).setName(label).addText(t=>t.setValue(config[key]||'').onChange(v=>config[key]=v.trim()));
  new Setting(el).setName('图床连接').setDesc('连接设置仅存于本机仓库；令牌由 Cloudflare 官方工具管理。').addButton(b=>b.setButtonText('保存图床设置').onClick(()=>{
   if(config.enabled){let u;try{u=new URL(config.publicBaseUrl);}catch{}if(!/^[a-f0-9]{32}$/.test(config.accountId)||!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(config.bucket)||!u||u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.hostname.endsWith('.r2.cloudflarestorage.com'))return new Notice('请填写有效的账户 ID、桶名和公开 HTTPS 地址');}
   try{fs.writeFileSync(file,JSON.stringify(config,null,2)+'\n',{mode:0o600});new Notice('图床设置已保存');}catch(error){new Notice(error.message);}
  })).addButton(b=>b.setButtonText('检查连接').onClick(()=>this.plugin.execute('status',null,false,true))).addButton(b=>b.setButtonText('登录 Cloudflare').onClick(()=>this.plugin.execute('login',null,false,true)));
 }
 advanced(el){
  el.createEl('h3',{text:'本机连接'});
  for(const [key,label] of [['repoPath','本地博客仓库路径'],['nodePath','Node.js 路径']])new Setting(el).setName(label).addText(t=>t.setValue(this.plugin.config[key]).onChange(async v=>{this.plugin.config[key]=v.trim();await this.plugin.saveData(this.plugin.config);}));
  el.createEl('p',{text:'原站点配置笔记已备份到插件的 legacy-site-notes 目录。发布只读取站点草稿和引用图片，不会发布备份或其他笔记。'});
 }
}

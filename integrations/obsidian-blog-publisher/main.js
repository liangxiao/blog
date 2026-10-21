const { Plugin, Modal, Notice, Setting, PluginSettingTab, FuzzySuggestModal } = require('obsidian');
const { spawn } = require('child_process');
const path = require('path');
class Confirm extends Modal {
 constructor(app, file, action, site = false) { super(app); this.file = file; this.action = action; this.site = site; }
 onOpen() {
  this.contentEl.createEl('h3', { text: '发布到公开博客' });
  this.contentEl.createEl('p', { text: this.site ? "同步站点设置、首页介绍、关于页及引用的图片。文章和其他笔记不会一并发布。构建通过后推送 GitHub。" : `只同步「${this.file.basename}」和它引用的图片。其他笔记不会被提交。构建通过后会推送 GitHub，并触发 Cloudflare 部署。` });
  new Setting(this.contentEl).addButton(b => b.setButtonText(this.site ? '发布站点设置' : '发布这篇文章').setCta().onClick(() => { this.close(); this.action(); })).addButton(b => b.setButtonText('取消').onClick(() => this.close()));
 }
}
class Log extends Modal {
 onOpen() { this.contentEl.createEl('h3', { text: '博客操作日志' }); this.pre = this.contentEl.createEl('pre'); this.pre.style.whiteSpace = 'pre-wrap'; }
 append(text) { this.pre.textContent = (this.pre.textContent + text).slice(-30000); this.pre.scrollIntoView({ block:'end' }); }
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
class SiteDashboard extends Modal {
 constructor(app,plugin){super(app);this.plugin=plugin;}
 onOpen(){
  this.contentEl.createEl('h2',{text:'博客管理'});
  this.contentEl.createEl('p',{text:'继续在当前知识库维护。修改后先预览，再发布。'});
  for(const [name,desc] of [['站点设置','标题、作者、导航、图片、页脚、配色、字号、显示开关和评论'],['首页介绍','首页自我介绍，支持 Markdown 和图片'],['关于','关于页正文、联系方式和声明']]){
   new Setting(this.contentEl).setName(name).setDesc(desc).addButton(b=>b.setButtonText('编辑').onClick(async()=>{this.close();await this.plugin.openSiteFile(name);}));
  }
  new Setting(this.contentEl).setName('站点图片').setDesc('从知识库图片中选择，也可以在站点设置里填写 HTTPS 图片地址。');
  for(const key of ['首页封面','作者头像','默认文章封面','网站图标'])new Setting(this.contentEl).setName(key).addButton(b=>b.setButtonText('选图').onClick(()=>{this.close();this.plugin.chooseImage('blog/站点设置.md',key);}));
  new Setting(this.contentEl).addButton(b=>b.setButtonText('预览站点').onClick(()=>{this.close();this.plugin.siteAction('preview');})).addButton(b=>b.setButtonText('发布站点设置').setCta().onClick(()=>{this.close();this.plugin.siteAction('publish');}));
 }
}
module.exports = class BlogPublisher extends Plugin {
 async onload() {
  this.config = Object.assign({repoPath:'',nodePath:'/usr/local/bin/node'},await this.loadData());
  this.addSettingTab(new Settings(this.app,this));
  this.addCommand({id:'manage-site',name:'管理站点',callback:()=>new SiteDashboard(this.app,this).open()});
  this.addCommand({id:'preview-site',name:'预览站点设置',callback:()=>this.siteAction('preview')});
  this.addCommand({id:'publish-site',name:'发布站点设置',callback:()=>this.siteAction('publish')});
  this.addCommand({id:'choose-cover',name:'选择当前文章封面',callback:()=>this.chooseImage()});
  this.addRibbonIcon('settings-2','博客：管理站点',()=>new SiteDashboard(this.app,this).open());
  this.addRibbonIcon('image','博客：选择文章封面',()=>this.chooseImage());
  this.registerEvent(this.app.workspace.on('active-leaf-change',()=>this.renderCover()));
  this.registerEvent(this.app.metadataCache.on('changed',()=>this.renderCover()));
  this.app.workspace.onLayoutReady(()=>this.renderCover());
  this.addCommand({id:'new',name:'新建文章',callback:()=>new NewPost(this.app).open()});
  this.addCommand({id:'preview',name:'预览当前文章',callback:()=>this.current('preview')});
  this.addCommand({id:'publish',name:'发布当前文章',callback:()=>this.current('publish')});
  this.addRibbonIcon('file-plus','博客：新建文章',()=>new NewPost(this.app).open());
  this.addRibbonIcon('eye','博客：预览当前文章',()=>this.current('preview'));
  this.addRibbonIcon('upload','博客：发布当前文章',()=>this.current('publish'));
 }
 async openSiteFile(name){
  const f=this.app.vault.getAbstractFileByPath(`blog/${name}.md`);
  if(!f)return new Notice('站点文件不存在，请先初始化站点设置');
  await this.app.workspace.getLeaf().openFile(f);
 }
 siteAction(action){
  const f=this.app.vault.getAbstractFileByPath('blog/站点设置.md');
  if(!f)return new Notice('缺少 blog/站点设置.md');
  if(action==='publish')new Confirm(this.app,f,()=>this.execute(action,f,true),true).open();
  else this.execute(action,f,true);
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
  if (f && ['blog/站点设置.md','blog/首页介绍.md','blog/关于.md'].includes(f.path)) return this.siteAction(action);
  if (!f || !f.path.startsWith('blog/') || f.extension !== 'md') return new Notice('请先打开 blog 文件夹中的一篇文章');
  if (action === 'publish') new Confirm(this.app,f,()=>this.execute(action,f)).open();
  else this.execute(action,f);
 }
 async execute(action,file,site=false) {
  if (this.busy) return new Notice('上一个博客操作尚未完成');
  if (!this.config.repoPath) return new Notice('请先在「博客发布」设置中填写博客仓库路径');
  this.busy = true;
  // Flush the editor before reading the Markdown from disk.
  const view = this.app.workspace.getActiveViewOfType(require('obsidian').MarkdownView);
  try { if (view && (site || view.file?.path === file.path)) await view.save(); } catch (e) { this.busy=false; return new Notice(`保存文章失败：${e.message}`); }
  const log = new Log(this.app); log.open(); log.append(action === 'preview' ? '准备预览…\n' : '检查、构建并发布…\n');
  const vault = this.app.vault.adapter.getBasePath();
  const child = spawn(this.config.nodePath,[path.join(this.config.repoPath,site?'scripts/site.mjs':'scripts/obsidian.mjs'),action,vault,path.join(vault,file.path)],{
   cwd:this.config.repoPath, env:{...process.env, PATH:`${path.dirname(this.config.nodePath)}:/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ''}`}, shell:false
  });
  child.stdout.on('data',d=>log.append(d.toString())); child.stderr.on('data',d=>log.append(d.toString()));
  child.on('error',e=>{this.busy=false;log.append(`\n启动失败：${e.message}`);});
  child.on('close',code=>{this.busy=false;log.append(code===0 ? '\n完成。\n':'\n未完成，请查看上面的原因。\n');new Notice(code===0 ? '博客操作完成':'博客操作失败，请查看日志');});
 }
};
class Settings extends PluginSettingTab {
 constructor(app,plugin){super(app,plugin);this.plugin=plugin;}
 display(){this.containerEl.empty();for(const [key,label] of [['repoPath','本地博客仓库路径'],['nodePath','Node.js 路径']])new Setting(this.containerEl).setName(label).addText(t=>t.setValue(this.plugin.config[key]).onChange(async v=>{this.plugin.config[key]=v.trim();await this.plugin.saveData(this.plugin.config);}));}
}

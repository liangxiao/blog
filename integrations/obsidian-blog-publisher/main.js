const { Plugin, Modal, Notice, Setting, PluginSettingTab } = require('obsidian');
const { spawn } = require('child_process');
const path = require('path');
class Confirm extends Modal {
 constructor(app, file, action) { super(app); this.file = file; this.action = action; }
 onOpen() {
  this.contentEl.createEl('h3', { text: '发布到公开博客' });
  this.contentEl.createEl('p', { text: `只同步「${this.file.basename}」和它引用的图片。其他笔记不会被提交。构建通过后会推送 GitHub，并触发 Cloudflare 部署。` });
  new Setting(this.contentEl).addButton(b => b.setButtonText('发布这篇文章').setCta().onClick(() => { this.close(); this.action(); })).addButton(b => b.setButtonText('取消').onClick(() => this.close()));
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
   const f = await this.app.vault.create(`blog/${slug}.md`, `---\ntitle: ${JSON.stringify(this.title.trim())}\nslug: ${slug}\ndescription: ""\npubDate: ${date}\ntags: []\ndraft: true\n---\n\n`);
   this.close(); await this.app.workspace.getLeaf().openFile(f);
  }));
 }
}
module.exports = class BlogPublisher extends Plugin {
 async onload() {
  this.config = Object.assign({repoPath:'',nodePath:'/usr/local/bin/node'},await this.loadData());
  this.addSettingTab(new Settings(this.app,this));
  this.addCommand({id:'new',name:'新建文章',callback:()=>new NewPost(this.app).open()});
  this.addCommand({id:'preview',name:'预览当前文章',callback:()=>this.current('preview')});
  this.addCommand({id:'publish',name:'发布当前文章',callback:()=>this.current('publish')});
  this.addRibbonIcon('file-plus','博客：新建文章',()=>new NewPost(this.app).open());
  this.addRibbonIcon('eye','博客：预览当前文章',()=>this.current('preview'));
  this.addRibbonIcon('upload','博客：发布当前文章',()=>this.current('publish'));
 }
 current(action) {
  const f = this.app.workspace.getActiveFile();
  if (!f || !f.path.startsWith('blog/') || f.extension !== 'md') return new Notice('请先打开 blog 文件夹中的一篇文章');
  if (action === 'publish') new Confirm(this.app,f,()=>this.execute(action,f)).open();
  else this.execute(action,f);
 }
 async execute(action,file) {
  if (this.busy) return new Notice('上一个博客操作尚未完成');
  if (!this.config.repoPath) return new Notice('请先在「博客发布」设置中填写博客仓库路径');
  this.busy = true;
  // Flush the editor before reading the Markdown from disk.
  const view = this.app.workspace.getActiveViewOfType(require('obsidian').MarkdownView);
  try { if (view?.file?.path === file.path) await view.save(); } catch (e) { this.busy=false; return new Notice(`保存文章失败：${e.message}`); }
  const log = new Log(this.app); log.open(); log.append(action === 'preview' ? '准备预览…\n' : '检查、构建并发布…\n');
  const vault = this.app.vault.adapter.getBasePath();
  const child = spawn(this.config.nodePath,[path.join(this.config.repoPath,'scripts/obsidian.mjs'),action,vault,path.join(vault,file.path)],{
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

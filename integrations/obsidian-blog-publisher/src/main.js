const { Plugin, Notice, MarkdownView } = require('obsidian');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const siteStore = require('../site-store.cjs');
const fields = require('../site-fields.json');
const { Runner } = require('./runner');
const { Operation } = require('./operation');
const { BlogView, VIEW_TYPE } = require('./view');
const { BlogSettingTab } = require('./settings');
const { NewPostModal, PropertiesModal, ConfirmModal, ImagePicker, ConflictsModal } = require('./modals');
const { isArticle, articleInfo, checklist } = require('./articles');

const DEFAULTS = { repoPath: '', nodePath: '/usr/local/bin/node', proxyMode: 'system', proxyUrl: '', confirmPublish: true, checkOnStartup: true };

module.exports = class BlogPublisher extends Plugin {
  async onload() {
    this.fields = fields;
    this.config = Object.assign({}, DEFAULTS, await this.loadData());
    this.runner = new Runner(this);
    this.readSiteInfo();

    this.registerView(VIEW_TYPE, leaf => new BlogView(leaf, this));
    this.settingsTab = new BlogSettingTab(this.app, this);
    this.addSettingTab(this.settingsTab);
    this.addRibbonIcon('notebook-pen', '博客', () => this.revealView());
    this.statusBar = this.addStatusBarItem();
    this.statusBar.addClass('blog-statusbar', 'mod-clickable');
    this.statusBar.addEventListener('click', () => this.revealView());

    const articleCommand = (id, name, run) => this.addCommand({
      id, name,
      checkCallback: checking => {
        const file = this.app.workspace.getActiveFile();
        if (!isArticle(file)) return false;
        if (!checking) run(file);
        return true;
      },
    });
    this.addCommand({ id: 'open-panel', name: '打开博客面板', callback: () => this.revealView() });
    this.addCommand({ id: 'new', name: '新建文章', callback: () => this.newPost() });
    articleCommand('publish', '发布当前文章', file => this.publish(file));
    articleCommand('preview', '预览当前文章', file => this.preview(file));
    articleCommand('properties', '编辑当前文章属性', file => this.editProperties(file));
    articleCommand('cover', '更换当前文章封面', file => this.chooseCover(file));
    this.addCommand({ id: 'check', name: '检查 GitHub 更新', callback: () => this.refreshSync(true) });
    this.addCommand({ id: 'settings', name: '打开博客设置', callback: () => this.openSettings() });

    this.registerEvent(this.app.vault.on('modify', file => { if (file.path.startsWith('blog/') && file.extension === 'md') this.scheduleStatus(); }));
    this.app.workspace.onLayoutReady(() => {
      this.cleanupStaleState();
      if (this.runner.diagnose().length === 0) this.refreshSync(this.config.checkOnStartup, true);
    });
    this.updateStatusBar();
  }

  onunload() { clearTimeout(this.statusTimer); this.settingsTab?.cleanup(); }

  // ---------- helpers ----------
  get vaultPath() { return this.app.vault.adapter.getBasePath(); }
  get stateDir() { return path.dirname(siteStore.storagePath(this.vaultPath)); }
  notice(text, timeout) { return new Notice(text, timeout); }
  get view() { return this.app.workspace.getLeavesOfType(VIEW_TYPE)[0]?.view; }
  rerender() { this.view?.requestRender(); this.settingsTab?.updateSiteStatus(); this.updateStatusBar(); }

  readSiteInfo() {
    try {
      const site = JSON.parse(fs.readFileSync(path.join(this.config.repoPath, 'src/config/site.json'), 'utf8'));
      const url = new URL(site.url);
      this.siteUrl = url.protocol === 'https:' ? url.href.replace(/\/?$/, '/') : null;
      this.siteTitle = site.title;
    } catch { this.siteUrl = null; this.siteTitle = null; }
  }

  onConfigChanged() { this.readSiteInfo(); this.rerender(); }
  isPublished(slug) { return Boolean(slug && fs.existsSync(path.join(this.config.repoPath, 'src/content/blog', `${slug}.md`))); }

  // A crashed or force-quit Obsidian could leave a stale cancel request behind.
  cleanupStaleState() { try { fs.rmSync(path.join(this.stateDir, 'cancel-request'), { force: true }); } catch { /* ignore */ } }

  async revealView() {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) { leaf = this.app.workspace.getRightLeaf(false); await leaf.setViewState({ type: VIEW_TYPE, active: true }); }
    this.app.workspace.revealLeaf(leaf);
  }

  openSettings(section) {
    if (section && ['site', 'pages', 'images', 'appearance', 'comments', 'connection'].includes(section)) this.settingsTab.section = section;
    else if (section) { this.settingsTab.focusField = section; }
    this.app.setting.open();
    this.app.setting.openTabById(this.manifest.id);
  }

  openRepo() { if (this.config.repoPath) spawn('open', [this.config.repoPath], { shell: false }); }
  openBackups() { const dir = path.join(this.stateDir, 'sync-backups'); fs.mkdirSync(dir, { recursive: true }); spawn('open', [dir], { shell: false }); }

  async saveEditor(file) {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (view?.file && (!file || view.file.path === file.path)) await view.save();
  }

  updateStatusBar() {
    const bar = this.statusBar; if (!bar) return;
    const op = this.operation;
    bar.empty();
    if (op?.running) {
      const step = op.activeStep;
      bar.setText(`博客 · ${step ? step.label : op.title}${step?.detail ? ` ${step.detail}` : ''}…`);
      bar.show();
    } else if (op && op.state === 'failed' && !op.dismissed) { bar.setText('博客 · 上次操作未完成'); bar.show(); }
    else bar.hide();
  }

  // ---------- site draft (shared with scripts via site-store.cjs) ----------
  loadSite() {
    if (!fs.existsSync(siteStore.storagePath(this.vaultPath))) throw new Error('还没有站点草稿。请在博客仓库运行 npm run obsidian:setup -- <知识库路径> 导入站点配置。');
    this.siteDraft = siteStore.readSite(this.vaultPath);
    this.siteBase = JSON.parse(JSON.stringify(this.siteDraft));
    return this.siteDraft;
  }
  saveSite() {
    const result = siteStore.patchSite(this.vaultPath, this.siteBase, this.siteDraft);
    Object.assign(this.siteDraft, result.value);
    this.siteBase = JSON.parse(JSON.stringify(result.value));
    if (result.external.length) new Notice(`已合并别处更新的设置：${result.external.join('、')}`);
  }

  // ---------- sync status ----------
  scheduleStatus() { clearTimeout(this.statusTimer); this.statusTimer = setTimeout(() => this.refreshSync(false, true), 1500); }

  async refreshSync(fetchRemote = false, quiet = false) {
    if (this.busy) return;
    if (this.checkPromise) return this.checkPromise;
    this.checking = true; this.rerender();
    this.checkPromise = (async () => {
      try { this.syncReport = await this.runner.rpc(fetchRemote ? 'check' : 'status', undefined, { timeout: fetchRemote ? 120000 : 60000 }); this.syncError = ''; this.pendingSite = false; }
      catch (error) { this.syncError = error.message; if (!quiet) new Notice(`检查没有完成：${error.message}`); }
      finally { this.checking = false; this.checkPromise = null; this.rerender(); }
    })();
    return this.checkPromise;
  }

  // ---------- operations ----------
  async begin(options) {
    if (this.busy) { new Notice('还有一个博客操作在进行，请等它完成'); this.revealView(); return null; }
    if (this.checkPromise) await this.checkPromise;
    this.busy = true;
    const op = new Operation(options);
    this.operation = op;
    let last = 0;
    op.on(() => { const now = Date.now(); if (now - last > 120 || !op.running) { last = now; this.view?.renderOperation(); this.updateStatusBar(); } });
    this.cleanupStaleState();
    await this.revealView();
    this.rerender();
    return op;
  }

  end(op) {
    this.busy = false; this.child = null;
    this.rerender();
    if (!this.view) new Notice(op.state === 'success' ? `${op.title}：${op.message}` : `${op.title}没有完成，打开博客面板查看原因`);
    this.scheduleStatus();
  }

  // Spawns a script for `op`, wiring logs, progress and the final state.
  async runScript(op, script, args, { timeout = 0 } = {}) {
    const { child, done } = this.runner.start(script, args, { onLine: line => op.log(line), onProgress: record => op.progress(record), timeout });
    this.child = child;
    const result = await done;
    if (result.startError) op.log(result.startError);
    let status = null;
    if (result.code !== 0) { try { status = JSON.parse(fs.readFileSync(path.join(this.stateDir, 'publish-status.json'), 'utf8')); } catch { /* none */ } }
    const fresh = status && Date.parse(status.at) >= op.startedAt && status.stage === 'failed';
    return { ok: result.code === 0, error: result.startError || (fresh ? status.message : null), code: fresh ? status.code : null };
  }

  async validate(op, relative) {
    try {
      const result = await this.runner.rpc('validate', relative, { timeout: 60000 });
      if (!result.ok) { op.finish(false, { error: result.issues.map(i => i.message).join('；'), code: 'VALIDATION' }); return false; }
      op.log('内容检查通过');
      return true;
    } catch (error) { op.finish(false, { error: error.message }); return false; }
  }

  articleBlocking(file) {
    const info = articleInfo(this, file);
    return checklist(this.app, info).filter(i => !i.ok && i.level === 'error');
  }

  async publish(file) {
    try { await this.saveEditor(file); } catch (error) { return new Notice(`保存文章失败：${error.message}`); }
    const blocking = this.articleBlocking(file);
    if (blocking.length) {
      const field = blocking.find(b => b.field)?.field;
      if (field) { new Notice(`发布前请先补全：${blocking.map(b => b.label).join('、')}`); return this.editProperties(file, field); }
      return new Notice(blocking.map(b => b.detail || b.label).join('\n'), 8000);
    }
    const info = articleInfo(this, file);
    const go = () => this.runPublish(file);
    if (!this.config.confirmPublish) return go();
    const images = (this.app.metadataCache.getFileCache(file)?.embeds || []).length;
    new ConfirmModal(this.app, {
      title: info.published ? '发布更新' : '发布文章',
      confirm: info.published ? '发布更新' : '发布',
      lines: [
        ['file-text', `「${info.title}」`],
        ['link', this.siteUrl ? new URL(`blog/${info.slug}/`, this.siteUrl).href : `/blog/${info.slug}/`],
        ['image', images ? `${images} 张图片会压缩后上传到图床` : '没有正文图片'],
        ['shield-check', '只发布这一篇文章和它引用的图片，其他笔记不会离开本机'],
      ],
      remember: async () => { this.config.confirmPublish = false; await this.saveData(this.config); },
      onConfirm: go,
    }).open();
  }

  async runPublish(file) {
    const info = articleInfo(this, file);
    const op = await this.begin({ kind: 'publish', title: info.published ? '发布更新' : '发布文章', subject: info.title, file, cancellable: true });
    if (!op) return;
    op.retry = () => this.runPublish(file);
    try {
      if (!await this.validate(op, file.path)) return;
      const result = await this.runScript(op, 'scripts/obsidian.mjs', ['publish', this.vaultPath, path.join(this.vaultPath, file.path)]);
      if (result.ok) {
        op.finish(true, { message: op.partial ? '已推送到 GitHub，Cloudflare 会自动部署（通常 1–2 分钟）' : '已发布到网站', url: this.siteUrl ? new URL(`blog/${encodeURIComponent(info.slug)}/`, this.siteUrl).href : null });
        new Notice(`「${info.title}」已发布`);
      } else op.finish(false, { error: result.error, code: result.code });
    } finally { this.end(op); }
  }

  async preview(file) {
    try { await this.saveEditor(file); } catch (error) { return new Notice(`保存文章失败：${error.message}`); }
    const info = articleInfo(this, file);
    const op = await this.begin({ kind: 'preview', title: '本地预览', subject: info.title, file, cancellable: true });
    if (!op) return;
    op.retry = () => this.preview(file);
    try {
      if (!await this.validate(op, file.path)) return;
      op.activate('preview'); op.emit();
      const result = await this.runScript(op, 'scripts/obsidian.mjs', ['preview', this.vaultPath, path.join(this.vaultPath, file.path)], { timeout: 180000 });
      if (result.ok) op.finish(true, { message: '预览已在浏览器打开，正式网站没有变化', url: `http://127.0.0.1:4322/blog/${encodeURIComponent(info.slug)}/` });
      else op.finish(false, { error: result.error, code: result.code });
    } finally { this.end(op); }
  }

  async siteAction(action) {
    if (this.siteSaveError) return new Notice('站点设置有未保存的错误，请先修正');
    const run = async () => {
      const op = await this.begin({ kind: action === 'publish' ? 'publish' : 'preview', title: action === 'publish' ? '发布站点设置' : '预览站点', subject: '首页、关于页和站点设置', cancellable: true });
      if (!op) return;
      op.retry = () => this.siteAction(action);
      try {
        if (!await this.validate(op)) return;
        if (action === 'preview') { op.activate('preview'); op.emit(); }
        const result = await this.runScript(op, 'scripts/site.mjs', [action, this.vaultPath], action === 'preview' ? { timeout: 180000 } : {});
        if (result.ok) op.finish(true, action === 'publish' ? { message: op.partial ? '已推送到 GitHub，等待 Cloudflare 部署' : '站点设置已上线', url: this.siteUrl } : { message: '预览已在浏览器打开', url: 'http://127.0.0.1:4322/' });
        else op.finish(false, { error: result.error, code: result.code });
      } finally { this.end(op); if (action === 'publish') this.pendingSite = false; }
    };
    if (action === 'publish' && this.config.confirmPublish) {
      new ConfirmModal(this.app, { title: '发布站点设置', confirm: '发布', lines: [['layout', '站点信息、首页介绍、关于页、导航与外观'], ['shield-check', '文章不会一起发布']], onConfirm: run }).open();
    } else run();
  }

  async syncChanges(options) {
    try { await this.saveEditor(); } catch { /* not critical */ }
    const op = await this.begin({ kind: 'sync', title: options ? '应用差异选择' : '同步仓库变化' });
    if (!op) return;
    op.retry = () => this.syncChanges(options);
    try {
      const result = await this.runner.rpc(options ? 'resolve' : 'sync', options, { timeout: 180000 });
      this.syncReport = result; this.syncError = '';
      if (result.needsReview) { op.finish(true, { message: '两边都有修改，请逐项选择' }); new ConflictsModal(this, result).open(); }
      else op.finish(true, { message: result.imported ? `已导入 ${result.imported} 项变化，原内容已备份` : '没有需要导入的变化' });
    } catch (error) { op.finish(false, { error: error.message }); }
    finally { this.end(op); }
  }

  async cloudflare(action) {
    const op = await this.begin({ kind: action === 'login' ? 'login' : 'media', title: action === 'login' ? '登录 Cloudflare' : '检查图床连接', cancellable: action === 'login' });
    if (!op) return;
    const previous = this.lastFailed;
    try {
      if (action === 'login') op.message = '浏览器会打开 Cloudflare 授权页，点击 Allow 后回到这里';
      op.emit();
      const result = await this.runScript(op, 'scripts/media.mjs', [action], { timeout: action === 'login' ? 300000 : 90000 });
      if (result.ok) {
        op.finish(true, { message: action === 'login' ? '登录成功' : '连接正常' });
        if (action === 'login' && previous?.retry) op.followUp = ['重新发布', previous.retry];
      } else op.finish(false, { error: result.error || (action === 'login' ? '授权没有完成。若浏览器提示 CSRF 错误，先在浏览器登录 dash.cloudflare.com 再重试。' : '无法访问 R2，请检查授权和网络'), code: action === 'login' ? null : 'AUTH_CLOUDFLARE' });
      op.retry = () => this.cloudflare(action);
    } finally { this.end(op); }
  }

  cancelOperation() {
    const op = this.operation;
    if (!op?.running || !op.cancellable) return;
    op.cancelRequested = true; op.message = '正在安全地停止…'; op.emit();
    if (op.kind === 'publish') {
      // Publishing stops at the next safe checkpoint so the repository is cleaned up properly.
      try { fs.mkdirSync(this.stateDir, { recursive: true }); fs.writeFileSync(path.join(this.stateDir, 'cancel-request'), String(Date.now())); } catch { /* ignore */ }
    } else this.child?.kill('SIGTERM');
  }

  remedy(id, op) {
    if (op.state === 'failed') this.lastFailed = op;
    switch (id) {
      case 'retry': return op.retry?.();
      case 'login': return this.cloudflare('login');
      case 'sync': return this.syncChanges();
      case 'network': return this.openSettings('connection');
      case 'media': return this.openSettings('images');
      case 'repo': return this.openRepo();
      case 'edit': return op.file ? this.editProperties(op.file) : this.openSettings();
      case 'open': return op.file && this.app.workspace.getLeaf(false).openFile(op.file);
      case 'log': op.showLog = true; return this.view?.renderOperation();
      case 'followUp': return op.followUp?.[1]();
    }
  }

  // ---------- article helpers ----------
  newPost() { new NewPostModal(this).open(); }
  editProperties(file, focus) { new PropertiesModal(this, file, { focus, onSaved: () => this.rerender() }).open(); }
  chooseCover(file) {
    new ImagePicker(this, async image => {
      await this.app.fileManager.processFrontMatter(file, fm => { fm.heroImage = image.path; });
      new Notice('封面已更新');
      this.rerender();
    }).open();
  }
};

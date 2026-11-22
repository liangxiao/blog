const { PluginSettingTab, Setting, Notice, MarkdownRenderer, Component, setIcon } = require('obsidian');
const path = require('path');
const fs = require('fs');
const { ImagePicker } = require('./modals');
const { imageUrl } = require('./articles');

const SECTIONS = [
  ['site', '站点信息', 'globe'],
  ['pages', '页面内容', 'file-text'],
  ['images', '图片与图床', 'image'],
  ['appearance', '导航与外观', 'palette'],
  ['comments', '评论', 'message-square'],
  ['connection', '连接与发布', 'plug'],
];
const GROUPS = {
  site: [['站点信息', ['title', 'description', 'author', 'url', 'language']]],
  appearance: [
    ['导航与联系方式', ['navigation', 'socialLinks']],
    ['外观', ['accentLight', 'accentDark', 'contentWidth', 'fontSize']],
    ['文章显示', ['showDates', 'showTags', 'showListCovers', 'showArticleCover']],
    ['页脚', ['footerText', 'copyrightStartYear', 'showRss', 'showPoweredBy']],
  ],
  comments: [['Giscus 评论', ['commentsEnabled', 'giscusRepo', 'giscusRepoId', 'giscusCategoryId']]],
  images: [['站点图片', ['homeCover', 'avatar', 'defaultCover', 'favicon']]],
};
const PAGE_GROUPS = {
  home: [['首页', ['homeHeading']], ['__home'], ['首页文章列表', ['latestHeading', 'latestCount', 'allPostsText']]],
  about: [['关于页', ['aboutHeading', 'aboutDescription']], ['__about']],
  list: [['文章列表页', ['blogHeading', 'blogDescription']]],
};

class BlogSettingTab extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; this.section = 'site'; this.page = 'home'; this.previews = []; }

  open(section) { if (section) this.section = section; }

  display() {
    this.cleanup();
    const el = this.containerEl; el.empty(); el.addClass('blog-settings');
    const top = el.createDiv({ cls: 'blog-settings-top' });
    const nav = top.createDiv({ cls: 'blog-settings-nav' });
    for (const [id, label, icon] of SECTIONS) {
      const b = nav.createEl('button', { cls: this.section === id ? 'is-active' : '' });
      setIcon(b.createSpan(), icon); b.createSpan({ text: label });
      b.addEventListener('click', () => { this.section = id; this.display(); });
    }
    if (this.section !== 'connection') this.drawSiteBar(top);
    const body = el.createDiv({ cls: 'blog-settings-body' });
    if (this.section === 'connection') return this.drawConnection(body);
    let draft;
    try { draft = this.plugin.loadSite(); }
    catch (error) { body.createDiv({ cls: 'blog-card blog-card-warn', text: error.message }); return; }
    if (this.section === 'pages') {
      const tabs = body.createDiv({ cls: 'blog-segmented' });
      for (const [id, label] of [['home', '首页'], ['about', '关于页'], ['list', '文章列表页']]) {
        const b = tabs.createEl('button', { text: label, cls: this.page === id ? 'is-active' : '' });
        b.addEventListener('click', () => { this.page = id; this.display(); });
      }
      for (const [title, keys] of PAGE_GROUPS[this.page]) {
        if (title === '__home') this.pageEditor(body, '首页介绍', 'home', draft);
        else if (title === '__about') this.pageEditor(body, '关于页正文', 'about', draft);
        else this.group(body, title, keys, draft);
      }
    } else {
      for (const [title, keys] of GROUPS[this.section]) this.group(body, title, keys, draft);
      if (this.section === 'comments') body.createEl('p', { cls: 'blog-muted', text: '评论由 Giscus 提供，访客使用 GitHub 账号登录留言。' });
      if (this.section === 'images') this.drawMedia(body);
    }
    if (this.focusField) {
      const input = this.inputs?.get(this.focusField);
      input?.scrollIntoView({ block: 'center' }); input?.focus?.({ preventScroll: true });
      this.focusField = null;
    }
  }

  drawSiteBar(top) {
    const bar = top.createDiv({ cls: 'blog-site-bar' });
    this.statusEl = bar.createDiv({ cls: 'blog-site-status' });
    this.updateSiteStatus();
    const actions = bar.createDiv({ cls: 'blog-actions' });
    const busy = this.plugin.busy;
    this.siteButtons = [
      actions.createEl('button', { text: '预览站点' }),
      actions.createEl('button', { text: '发布站点设置', cls: 'mod-cta' }),
    ];
    this.siteButtons[0].addEventListener('click', () => this.plugin.siteAction('preview'));
    this.siteButtons[1].addEventListener('click', () => this.plugin.siteAction('publish'));
    for (const b of this.siteButtons) b.disabled = busy;
  }

  updateSiteStatus(message) {
    if (!this.statusEl) return;
    const p = this.plugin;
    const pending = p.pendingSite || p.syncReport?.changes?.some(c => c.id.startsWith('site') || c.id.startsWith('page'));
    this.statusEl.empty();
    this.statusEl.toggleClass('is-error', Boolean(p.siteSaveError));
    this.statusEl.setText(message || (p.siteSaveError ? '保存失败，请检查输入' : pending ? '修改已自动保存 · 发布后上线' : '与线上一致'));
    for (const b of this.siteButtons || []) b.disabled = p.busy;
  }

  changed() {
    try { this.plugin.saveSite(); this.plugin.siteSaveError = false; this.plugin.pendingSite = true; this.updateSiteStatus(); this.plugin.scheduleStatus(); }
    catch (error) { this.plugin.siteSaveError = true; this.updateSiteStatus(`保存失败：${error.message}`); }
  }

  group(body, title, keys, draft) {
    body.createEl('h3', { text: title, cls: 'blog-settings-group' });
    for (const key of keys) { const field = this.plugin.fields.find(f => f.key === key); if (field) this.field(body, field, draft); }
  }

  field(el, f, draft) {
    this.inputs ??= new Map();
    const setting = new Setting(el).setName(f.label);
    const value = draft.values[f.label] ?? f.default;
    const update = v => { draft.values[f.label] = v; this.changed(); };
    this.inputs.set(f.label, setting.settingEl);
    if (f.type === 'boolean') { setting.addToggle(t => t.setValue(Boolean(value)).onChange(update)); return; }
    if (f.type === 'color') {
      setting.addColorPicker(c => c.setValue(String(value)).onChange(update));
      return;
    }
    if (f.type === 'links') {
      setting.setDesc('每行一项：名称 | 地址').addTextArea(t => {
        t.setValue((value || []).map(v => typeof v === 'string' ? v : `${v.label} | ${v.href}`).join('\n')).onChange(v => update(v.split('\n').filter(l => l.trim())));
        t.inputEl.rows = 4; t.inputEl.addClass('blog-input-wide');
      });
      return;
    }
    if (f.type === 'number') setting.setDesc(`${f.min ?? ''}–${f.max ?? ''}`);
    let preview;
    const showImage = v => {
      if (!preview) return; preview.empty();
      const url = imageUrl(this.app, v, 'blog/首页介绍.md');
      if (url) preview.createEl('img', { attr: { src: url, alt: f.label } });
    };
    setting.addText(t => {
      this.inputs.set(f.label, t.inputEl);
      t.setValue(String(value ?? '')).onChange(v => { update(f.type === 'number' ? (v.trim() === '' ? '' : Number(v)) : v); if (f.type === 'image') showImage(v); });
      if (f.type === 'number') { t.inputEl.type = 'number'; if (f.min != null) t.inputEl.min = f.min; if (f.max != null) t.inputEl.max = f.max; }
      if (f.type === 'image') {
        t.setPlaceholder('知识库图片路径或 https:// 地址');
        setting.addButton(b => b.setButtonText('选图').onClick(() => new ImagePicker(this.plugin, image => { t.setValue(image.path); update(image.path); showImage(image.path); }).open()));
        setting.addExtraButton(b => b.setIcon('x').setTooltip('清除').onClick(() => { t.setValue(''); update(''); showImage(''); }));
      }
    });
    if (f.type === 'image') { setting.settingEl.addClass('blog-image-field'); preview = setting.infoEl.createDiv({ cls: 'blog-setting-image' }); showImage(value); }
  }

  pageEditor(el, label, key, draft) {
    el.createEl('h3', { text: label, cls: 'blog-settings-group' });
    const wrap = el.createDiv({ cls: 'blog-page-editor' });
    const textarea = wrap.createEl('textarea', { cls: 'blog-page-text' });
    textarea.value = draft[key]; textarea.rows = 12;
    textarea.setAttribute('aria-label', label);
    this.inputs ??= new Map(); this.inputs.set(label, textarea);
    const preview = wrap.createDiv({ cls: 'blog-page-preview markdown-rendered' });
    const state = { timer: null, component: null, generation: 0 }; this.previews.push(state);
    const render = async text => {
      const generation = ++state.generation;
      state.component?.unload(); if (state.component) this.plugin.removeChild(state.component);
      state.component = new Component(); this.plugin.addChild(state.component);
      const target = createDiv();
      try { await MarkdownRenderer.render(this.app, text, target, `blog/${key === 'home' ? '首页介绍' : '关于'}.md`, state.component); if (generation === state.generation) preview.replaceChildren(...target.childNodes); }
      catch (error) { if (generation === state.generation) preview.setText(`预览失败：${error.message}`); }
    };
    textarea.addEventListener('input', () => { draft[key] = textarea.value; this.changed(); clearTimeout(state.timer); state.timer = setTimeout(() => render(textarea.value), 250); });
    el.createEl('p', { cls: 'blog-muted', text: '支持 Markdown 和 ![[图片]]。左侧编辑，右侧预览。' });
    render(draft[key]);
  }

  drawMedia(el) {
    el.createEl('h3', { text: 'Cloudflare R2 图床', cls: 'blog-settings-group' });
    const file = path.join(this.plugin.config.repoPath, '.blog-media.json');
    let config = { enabled: false, accountId: '', bucket: 'blog-images', publicBaseUrl: '' };
    try { if (fs.existsSync(file)) config = { ...config, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; }
    catch (error) { el.createDiv({ cls: 'blog-card blog-card-warn', text: `图床配置读取失败：${error.message}` }); return; }
    el.createEl('p', { cls: 'blog-muted', text: '在笔记里照常插入本地图片；发布时自动压缩成 WebP 上传到 R2，原图留在知识库。' });
    new Setting(el).setName('发布时上传到 R2').addToggle(t => t.setValue(config.enabled === true).onChange(v => config.enabled = v));
    for (const [key, label, hint] of [['accountId', 'Cloudflare 账户 ID', '32 位十六进制'], ['bucket', 'R2 存储桶', ''], ['publicBaseUrl', '图片公开地址', '例如 https://example.pages.dev/media']]) {
      new Setting(el).setName(label).setDesc(hint).addText(t => { t.setValue(config[key] || '').onChange(v => config[key] = v.trim()); t.inputEl.addClass('blog-input-wide'); });
    }
    new Setting(el).addButton(b => b.setButtonText('登录 Cloudflare').onClick(() => this.plugin.cloudflare('login')))
      .addButton(b => b.setButtonText('检查连接').onClick(() => this.plugin.cloudflare('status')))
      .addButton(b => b.setButtonText('保存').setCta().onClick(() => {
        if (config.enabled) {
          let u; try { u = new URL(config.publicBaseUrl); } catch { /* invalid */ }
          if (!/^[a-f0-9]{32}$/.test(config.accountId) || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(config.bucket) || !u || u.protocol !== 'https:' || u.hostname.endsWith('.r2.cloudflarestorage.com')) return new Notice('请填写有效的账户 ID、存储桶和公开 HTTPS 地址');
        }
        try { fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 }); new Notice('图床设置已保存'); } catch (error) { new Notice(error.message); }
      }));
  }

  drawConnection(el) {
    const p = this.plugin, problems = p.runner.diagnose();
    const status = el.createDiv({ cls: `blog-card ${problems.length ? 'blog-card-warn' : 'blog-card-ok'}` });
    status.createEl('strong', { text: problems.length ? '本机连接需要设置' : '本机连接正常' });
    for (const problem of problems) status.createDiv({ text: problem });

    el.createEl('h3', { text: '本机', cls: 'blog-settings-group' });
    const save = async () => { await p.saveData(p.config); p.onConfigChanged(); };
    new Setting(el).setName('博客仓库').setDesc('Astro 博客的本地 git 仓库').addText(t => {
      t.setPlaceholder('/Users/你/Projects/blog').setValue(p.config.repoPath).onChange(async v => { p.config.repoPath = v.trim(); await save(); });
      t.inputEl.addClass('blog-input-wide');
      t.inputEl.addEventListener('blur', () => this.display());
    }).addExtraButton(b => b.setIcon('folder-open').setTooltip('在 Finder 中打开').onClick(() => p.openRepo()));
    new Setting(el).setName('Node.js').setDesc('运行发布脚本的 node 可执行文件').addText(t => {
      t.setValue(p.config.nodePath).onChange(async v => { p.config.nodePath = v.trim(); await save(); });
      t.inputEl.addClass('blog-input-wide');
      t.inputEl.addEventListener('blur', () => this.display());
    });

    el.createEl('h3', { text: '网络', cls: 'blog-settings-group' });
    const network = new Setting(el).setName('代理').setDesc(`当前：${p.runner.describeNetwork()}`);
    network.addDropdown(d => d.addOption('system', '跟随系统代理（推荐）').addOption('custom', '自定义').addOption('off', '不使用代理').setValue(p.config.proxyMode).onChange(async v => { p.config.proxyMode = v; await save(); this.display(); }));
    if (p.config.proxyMode === 'custom') new Setting(el).setName('代理地址').setDesc('HTTP 代理，例如 http://127.0.0.1:7890').addText(t => t.setValue(p.config.proxyUrl || '').onChange(async v => { p.config.proxyUrl = v.trim(); await save(); }));
    el.createEl('p', { cls: 'blog-muted', text: 'Obsidian 不会继承终端里的代理变量。这里的设置会传给 git、GitHub CLI、wrangler 和图片校验。' });

    el.createEl('h3', { text: '发布', cls: 'blog-settings-group' });
    new Setting(el).setName('发布前确认').setDesc('点击发布后先显示将要发布的内容').addToggle(t => t.setValue(p.config.confirmPublish).onChange(async v => { p.config.confirmPublish = v; await save(); }));
    new Setting(el).setName('启动时检查 GitHub 更新').addToggle(t => t.setValue(p.config.checkOnStartup).onChange(async v => { p.config.checkOnStartup = v; await save(); }));
    new Setting(el).setName('Cloudflare').setDesc('图片上传和网站部署使用 wrangler 的登录授权').addButton(b => b.setButtonText('检查连接').onClick(() => p.cloudflare('status'))).addButton(b => b.setButtonText('登录 Cloudflare').onClick(() => p.cloudflare('login')));
    new Setting(el).setName('同步备份').setDesc('每次同步前保留的原内容').addButton(b => b.setButtonText('打开备份文件夹').onClick(() => p.openBackups()));
  }

  cleanup() {
    for (const s of this.previews) { clearTimeout(s.timer); s.component?.unload(); if (s.component) this.plugin.removeChild(s.component); }
    this.previews = []; this.inputs = new Map(); this.statusEl = null; this.siteButtons = null;
  }
  hide() { this.cleanup(); }
}

module.exports = { BlogSettingTab, SECTIONS };

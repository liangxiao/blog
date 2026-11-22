const { ItemView, setIcon, debounce } = require('obsidian');
const { isArticle, articleInfo, listArticles, checklist, imageUrl } = require('./articles');
const { formatDuration } = require('./operation');

const VIEW_TYPE = 'blog-publisher-panel';

function button(parent, { text, icon, cls = '', onClick, disabled = false, tooltip }) {
  const b = parent.createEl('button', { cls: `blog-button ${cls}`.trim() });
  if (icon) setIcon(b.createSpan({ cls: 'blog-button-icon' }), icon);
  if (text) b.createSpan({ text });
  if (tooltip) b.setAttribute('aria-label', tooltip);
  b.disabled = disabled;
  b.addEventListener('click', event => { event.preventDefault(); if (!b.disabled) onClick(event); });
  return b;
}

const relative = time => {
  if (!time) return '';
  const diff = Date.now() - new Date(time).getTime();
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  return new Date(time).toLocaleDateString();
};

class BlogView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.filter = '';
    this.listLimit = 30;
    this.requestRender = debounce(() => this.render(), 150, true);
  }
  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return '博客'; }
  getIcon() { return 'notebook-pen'; }

  async onOpen() {
    this.containerEl.children[1].addClass('blog-panel');
    this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.requestRender()));
    this.registerEvent(this.app.workspace.on('file-open', () => this.requestRender()));
    this.registerEvent(this.app.metadataCache.on('changed', file => { if (isArticle(file)) this.requestRender(); }));
    this.registerEvent(this.app.vault.on('rename', () => this.requestRender()));
    this.registerEvent(this.app.vault.on('delete', () => this.requestRender()));
    this.registerInterval(window.setInterval(() => this.tick(), 1000));
    this.render();
  }

  // Updates elapsed time labels without rebuilding the DOM.
  tick() {
    const op = this.plugin.operation;
    if (op?.running && this.elapsedEl) this.elapsedEl.setText(formatDuration(op.elapsed));
  }

  // Called by the plugin whenever the running operation reports progress.
  renderOperation() {
    if (!this.opEl) return this.render();
    this.drawOperation(this.opEl);
  }

  render() {
    const root = this.containerEl.children[1];
    const scroll = root.querySelector('.blog-list')?.scrollTop;
    root.empty();
    this.drawHeader(root);
    const problems = this.plugin.runner.diagnose();
    if (problems.length) { this.drawSetup(root, problems); return; }
    this.drawSync(root);
    this.opEl = root.createDiv({ cls: 'blog-op-container' });
    this.drawOperation(this.opEl);
    this.drawCurrent(root);
    this.drawList(root);
    const list = root.querySelector('.blog-list');
    if (list && scroll) list.scrollTop = scroll;
  }

  drawHeader(root) {
    const header = root.createDiv({ cls: 'blog-panel-header' });
    const title = header.createDiv({ cls: 'blog-panel-title' });
    title.createSpan({ text: this.plugin.siteTitle || '博客' });
    if (this.plugin.siteUrl) {
      const link = title.createEl('a', { cls: 'blog-site-link', text: new URL(this.plugin.siteUrl).host, href: this.plugin.siteUrl });
      link.setAttribute('aria-label', '打开网站');
    }
    const tools = header.createDiv({ cls: 'blog-panel-tools' });
    button(tools, { icon: 'plus', tooltip: '新建文章', cls: 'clickable-icon', onClick: () => this.plugin.newPost() });
    button(tools, { icon: 'settings', tooltip: '站点设置', cls: 'clickable-icon', onClick: () => this.plugin.openSettings() });
  }

  drawSetup(root, problems) {
    const card = root.createDiv({ cls: 'blog-card blog-card-warn' });
    card.createEl('strong', { text: '还差一步就能使用' });
    const list = card.createEl('ul');
    for (const p of problems) list.createEl('li', { text: p });
    button(card, { text: '打开连接设置', cls: 'mod-cta', onClick: () => this.plugin.openSettings('connection') });
  }

  drawSync(root) {
    const p = this.plugin, report = p.syncReport, c = report?.counts || {};
    const bar = root.createDiv({ cls: 'blog-sync' });
    let tone = 'ok', text = '与 GitHub 同步', action = null;
    if (p.checking) { tone = 'busy'; text = '正在检查…'; }
    else if (p.syncError) { tone = 'warn'; text = '检查没有完成'; }
    else if (!report) { tone = 'muted'; text = '尚未检查'; }
    else if (report.dirty) { tone = 'warn'; text = '仓库有未提交的改动'; action = ['打开仓库', () => p.openRepo()]; }
    else if (report.branch && report.branch !== 'main') { tone = 'warn'; text = `仓库在 ${report.branch} 分支`; }
    else if (c.conflict) { tone = 'warn'; text = `${c.conflict} 项冲突`; action = ['处理', () => p.syncChanges()]; }
    else if (c.remote || report.behind) { tone = 'info'; text = '仓库有新内容'; action = ['同步', () => p.syncChanges()]; }
    else if (c.local) { tone = 'info'; text = `${c.local} 项修改待发布`; }
    bar.addClass(`is-${tone}`);
    bar.createSpan({ cls: 'blog-dot' });
    const label = bar.createDiv({ cls: 'blog-sync-label' });
    label.createSpan({ text });
    const checked = report?.remoteCheckedAt || report?.checkedAt;
    if (checked && !p.checking) label.createEl('small', { text: `检查于 ${relative(checked)}` });
    if (p.syncError) bar.setAttribute('aria-label', p.syncError);
    if (action) button(bar, { text: action[0], cls: 'blog-link-button', disabled: p.busy, onClick: action[1] });
    button(bar, { icon: 'refresh-cw', cls: 'clickable-icon', tooltip: '检查 GitHub 更新', disabled: p.busy || p.checking, onClick: () => p.refreshSync(true) });
  }

  drawOperation(container) {
    container.empty();
    this.elapsedEl = null;
    const op = this.plugin.operation;
    if (!op || op.dismissed) return;
    const card = container.createDiv({ cls: `blog-card blog-op is-${op.state}` });
    const head = card.createDiv({ cls: 'blog-op-head' });
    const icon = head.createSpan({ cls: 'blog-op-icon' });
    setIcon(icon, { running: 'loader', success: 'check-circle-2', failed: 'alert-circle', cancelled: 'circle-slash' }[op.state]);
    const titles = head.createDiv({ cls: 'blog-op-titles' });
    titles.createEl('strong', { text: op.title });
    if (op.subject) titles.createEl('small', { text: op.subject });
    this.elapsedEl = head.createEl('small', { cls: 'blog-op-time', text: formatDuration(op.elapsed) });
    if (!op.running) button(head, { icon: 'x', cls: 'clickable-icon', tooltip: '关闭', onClick: () => { op.dismissed = true; this.drawOperation(container); } });

    if (op.steps.length > 1 || op.running) {
      const steps = card.createEl('ol', { cls: 'blog-steps' });
      for (const step of op.steps) {
        const li = steps.createEl('li', { cls: `is-${step.status}` });
        const marker = li.createSpan({ cls: 'blog-step-marker' });
        if (step.status === 'done') setIcon(marker, 'check');
        else if (step.status === 'failed') setIcon(marker, 'x');
        else if (step.status === 'skipped') setIcon(marker, 'minus');
        li.createSpan({ cls: 'blog-step-label', text: step.label });
        const meta = li.createSpan({ cls: 'blog-step-meta' });
        if (step.status === 'active' && step.detail) meta.setText(step.detail);
        else if (step.status === 'done' && step.endedAt && step.startedAt) meta.setText(formatDuration(step.endedAt - step.startedAt));
        if (step.status === 'active' && step.fraction != null) li.createDiv({ cls: 'blog-progress' }).createDiv({ attr: { style: `width:${Math.max(4, step.fraction * 100)}%` } });
      }
    }

    if (op.running) {
      card.createDiv({ cls: 'blog-op-message', text: op.message });
      const actions = card.createDiv({ cls: 'blog-actions' });
      if (op.cancellable) button(actions, { text: op.cancelRequested ? '正在取消…' : '取消', disabled: op.cancelRequested, onClick: () => this.plugin.cancelOperation() });
    } else if (op.state === 'success') {
      card.createDiv({ cls: 'blog-op-message', text: op.message });
      const actions = card.createDiv({ cls: 'blog-actions' });
      if (op.followUp) button(actions, { text: op.followUp[0], cls: 'mod-cta', onClick: () => this.plugin.remedy('followUp', op) });
      if (op.url) button(actions, { text: op.kind === 'preview' ? '打开预览' : op.file ? '查看文章' : '打开网站', icon: 'external-link', cls: op.followUp ? '' : 'mod-cta', onClick: () => window.open(op.url) });
    } else {
      const box = card.createDiv({ cls: 'blog-op-error' });
      box.createDiv({ cls: 'blog-op-error-message', text: op.errorMessage || op.message });
      if (op.remedy?.hint) box.createDiv({ cls: 'blog-op-hint', text: op.remedy.hint });
      if (op.errorCode === 'NETWORK') box.createDiv({ cls: 'blog-op-hint', text: `当前网络：${this.plugin.runner.describeNetwork()}` });
      const actions = card.createDiv({ cls: 'blog-actions' });
      const remedies = op.remedy?.actions || [['retry', '重试', true]];
      for (const [id, label, primary] of remedies) button(actions, { text: label, cls: primary ? 'mod-cta' : '', onClick: () => this.plugin.remedy(id, op) });
    }

    if (op.lines.length) {
      const details = card.createEl('details', { cls: 'blog-log' });
      details.open = Boolean(op.showLog);
      details.addEventListener('toggle', () => { op.showLog = details.open; });
      const summary = details.createEl('summary');
      summary.createSpan({ text: '日志' });
      button(summary, { icon: 'copy', cls: 'clickable-icon', tooltip: '复制日志', onClick: () => { navigator.clipboard.writeText(op.lines.join('\n')); this.plugin.notice('日志已复制'); } });
      const pre = details.createEl('pre', { text: op.lines.slice(-300).join('\n') });
      if (details.open) requestAnimationFrame(() => pre.scrollTop = pre.scrollHeight);
    }
  }

  drawCurrent(root) {
    const file = this.app.workspace.getActiveFile();
    if (!isArticle(file)) {
      const empty = root.createDiv({ cls: 'blog-card blog-current-empty' });
      empty.createDiv({ text: '打开 blog 文件夹中的一篇文章，即可在这里预览和发布。', cls: 'blog-muted' });
      button(empty, { text: '写一篇新文章', icon: 'plus', onClick: () => this.plugin.newPost() });
      return;
    }
    const info = articleInfo(this.plugin, file);
    const card = root.createDiv({ cls: 'blog-card blog-current' });
    const cover = imageUrl(this.app, info.cover, file.path);
    if (cover) {
      const figure = card.createDiv({ cls: 'blog-cover' });
      figure.createEl('img', { attr: { src: cover, alt: '封面' } });
      button(figure, { icon: 'image', cls: 'blog-cover-change', tooltip: '更换封面', onClick: () => this.plugin.chooseCover(file) });
    }
    const head = card.createDiv({ cls: 'blog-current-head' });
    head.createEl('h3', { text: info.title });
    head.createSpan({ cls: `blog-badge is-${info.status.id}`, text: info.status.label });
    if (info.description) card.createEl('p', { cls: 'blog-current-desc', text: info.description });
    if (info.url && info.published) {
      const link = card.createEl('a', { cls: 'blog-current-url', text: `/blog/${info.slug}/`, href: info.url });
      setIcon(link.createSpan(), 'arrow-up-right');
    }

    const items = checklist(this.app, info);
    const blocking = items.filter(i => !i.ok && i.level === 'error');
    const checks = card.createDiv({ cls: 'blog-checklist' });
    for (const item of items) {
      const row = checks.createDiv({ cls: `blog-check ${item.ok ? 'is-ok' : `is-${item.level}`}` });
      setIcon(row.createSpan({ cls: 'blog-check-icon' }), item.ok ? 'check' : item.level === 'error' ? 'circle-alert' : 'info');
      row.createSpan({ cls: 'blog-check-label', text: item.label });
      if (!item.ok && item.detail) row.createSpan({ cls: 'blog-check-detail', text: item.detail });
      if (!item.ok && item.field) {
        row.addClass('is-clickable');
        row.addEventListener('click', () => item.field === 'heroImage' ? this.plugin.chooseCover(file) : this.plugin.editProperties(file, item.field));
      }
    }

    const busy = this.plugin.busy;
    const actions = card.createDiv({ cls: 'blog-actions blog-current-actions' });
    button(actions, { text: '属性', icon: 'pencil', onClick: () => this.plugin.editProperties(file) });
    button(actions, { text: '预览', icon: 'eye', disabled: busy, onClick: () => this.plugin.preview(file) });
    const publishLabel = info.published ? (info.status.id === 'published' ? '重新发布' : '发布更新') : '发布';
    button(actions, { text: publishLabel, icon: 'send', cls: 'mod-cta', disabled: busy || blocking.length > 0, tooltip: blocking.length ? `先补全：${blocking.map(b => b.label).join('、')}` : undefined, onClick: () => this.plugin.publish(file) });
  }

  drawList(root) {
    const section = root.createDiv({ cls: 'blog-list-section' });
    const head = section.createDiv({ cls: 'blog-list-head' });
    const articles = listArticles(this.plugin);
    head.createEl('h4', { text: `全部文章 · ${articles.length}` });
    const search = head.createEl('input', { type: 'search', placeholder: '搜索', value: this.filter, cls: 'blog-search' });
    const list = section.createDiv({ cls: 'blog-list' });
    const active = this.app.workspace.getActiveFile();
    const draw = () => {
      list.empty();
      const q = this.filter.trim().toLowerCase();
      const shown = q ? articles.filter(a => `${a.title} ${a.slug} ${a.tags.join(' ')}`.toLowerCase().includes(q)) : articles;
      if (!shown.length) list.createDiv({ cls: 'blog-muted blog-list-empty', text: q ? '没有匹配的文章' : '还没有文章' });
      for (const a of shown.slice(0, this.listLimit)) {
        const row = list.createDiv({ cls: `blog-row${a.file === active ? ' is-active' : ''}` });
        row.createDiv({ cls: 'blog-row-title', text: a.title });
        const meta = row.createDiv({ cls: 'blog-row-meta' });
        meta.createSpan({ cls: `blog-badge is-${a.status.id}`, text: a.status.label });
        if (a.pubDate) meta.createSpan({ text: a.pubDate.slice(0, 10) });
        row.addEventListener('click', event => this.app.workspace.getLeaf(event.metaKey || event.ctrlKey).openFile(a.file));
      }
      if (shown.length > this.listLimit) button(list, { text: `显示更多（还有 ${shown.length - this.listLimit} 篇）`, cls: 'blog-link-button', onClick: () => { this.listLimit += 50; draw(); } });
    };
    search.addEventListener('input', () => { this.filter = search.value; draw(); });
    draw();
  }
}

module.exports = { BlogView, VIEW_TYPE };

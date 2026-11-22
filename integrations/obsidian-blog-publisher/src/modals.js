const { Modal, Notice, Setting, FuzzySuggestModal, setIcon } = require('obsidian');
const { SLUG, suggestSlug, existingSlugs, frontmatter, imageUrl, BLOG_DIR } = require('./articles');

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const bytes = n => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;

function fieldHint(setting, text, error = false) {
  setting.descEl.empty();
  setting.descEl.setText(text);
  setting.settingEl.toggleClass('blog-field-error', error);
}

// ---------- New post ----------
class NewPostModal extends Modal {
  constructor(plugin) { super(plugin.app); this.plugin = plugin; this.values = { title: '', slug: '', description: '' }; this.slugTouched = false; }
  onOpen() {
    this.modalEl.addClass('blog-modal');
    this.titleEl.setText('新建文章');
    const taken = existingSlugs(this.plugin);
    const { contentEl } = this;
    let slugSetting, slugInput, createButton;
    const validate = () => {
      const { slug, title } = this.values;
      let error = '';
      if (!SLUG.test(slug)) error = '只能用小写字母、数字和短横线，例如 agent-notes';
      else if (taken.has(slug)) error = '这个网址已经被另一篇文章使用';
      fieldHint(slugSetting, error || `发布后的网址：/blog/${slug}/ （发布后不建议再改）`, Boolean(error));
      createButton?.setDisabled(Boolean(error) || !title.trim());
      return !error && title.trim();
    };
    new Setting(contentEl).setName('标题').addText(t => {
      t.setPlaceholder('这篇文章叫什么？').onChange(v => {
        this.values.title = v;
        if (!this.slugTouched) { this.values.slug = suggestSlug(v, taken); slugInput.setValue(this.values.slug); }
        validate();
      });
      t.inputEl.addClass('blog-input-wide');
      setTimeout(() => t.inputEl.focus(), 0);
    });
    slugSetting = new Setting(contentEl).setName('网址').addText(t => {
      slugInput = t;
      t.setPlaceholder('my-first-post').onChange(v => { this.slugTouched = true; this.values.slug = v.trim(); validate(); });
    });
    new Setting(contentEl).setName('摘要').setDesc('一两句话，显示在文章列表中。也可以写完再补。').addTextArea(t => {
      t.setPlaceholder('这篇文章讲了什么').onChange(v => this.values.description = v);
      t.inputEl.rows = 3; t.inputEl.addClass('blog-input-wide');
    });
    new Setting(contentEl).addButton(b => b.setButtonText('取消').onClick(() => this.close())).addButton(b => {
      createButton = b;
      b.setButtonText('创建草稿').setCta().setDisabled(true).onClick(() => this.create());
    });
    this.values.slug = suggestSlug('', taken); slugInput.setValue(this.values.slug); validate();
    this.scope.register(['Mod'], 'Enter', () => { if (validate()) this.create(); return false; });
  }
  async create() {
    const { title, slug, description } = this.values;
    const { vault } = this.app;
    if (!vault.getAbstractFileByPath(BLOG_DIR)) await vault.createFolder(BLOG_DIR);
    const filePath = `${BLOG_DIR}/${title.trim().replace(/[\\/:*?"<>|#^[\]]/g, ' ').trim() || slug}.md`;
    if (vault.getAbstractFileByPath(filePath)) return new Notice('已有同名笔记，请换一个标题');
    const file = await vault.create(filePath, `---\ntitle: ${JSON.stringify(title.trim())}\nslug: ${slug}\ndescription: ${JSON.stringify(description.trim())}\npubDate: ${today()}\nblogTags: []\nheroImage: ""\ndraft: true\n---\n\n`);
    this.close();
    await this.app.workspace.getLeaf(false).openFile(file);
    this.plugin.revealView();
  }
  onClose() { this.contentEl.empty(); }
}

// ---------- Edit article properties ----------
class PropertiesModal extends Modal {
  constructor(plugin, file, { focus, onSaved } = {}) { super(plugin.app); Object.assign(this, { plugin, file, focus, onSaved }); }
  onOpen() {
    this.modalEl.addClass('blog-modal');
    this.titleEl.setText('文章属性');
    const fm = frontmatter(this.app, this.file);
    const values = {
      title: fm.title || '', description: fm.description || '', slug: fm.slug || '',
      pubDate: fm.pubDate ? String(fm.pubDate).slice(0, 10) : today(),
      tags: (Array.isArray(fm.blogTags) ? fm.blogTags : Array.isArray(fm.tags) ? fm.tags : []).join(', '), heroImage: fm.heroImage || '',
    };
    const published = this.plugin.isPublished(fm.slug);
    const taken = existingSlugs(this.plugin); taken.delete(fm.slug);
    const { contentEl } = this; const inputs = {};
    let saveButton, slugSetting;
    const valid = () => {
      let error = '';
      if (!SLUG.test(values.slug)) error = '只能用小写字母、数字和短横线';
      else if (taken.has(values.slug)) error = '这个网址已经被另一篇文章使用';
      fieldHint(slugSetting, error || (published ? '已发布的文章改网址会让旧链接失效' : `/blog/${values.slug}/`), Boolean(error));
      const ok = !error && values.title.trim() && values.description.trim() && !Number.isNaN(Date.parse(values.pubDate));
      saveButton?.setDisabled(!ok);
      return ok;
    };
    new Setting(contentEl).setName('标题').addText(t => { inputs.title = t.inputEl; t.setValue(values.title).onChange(v => { values.title = v; valid(); }); t.inputEl.addClass('blog-input-wide'); });
    new Setting(contentEl).setName('摘要').setDesc('显示在文章列表、RSS 和分享卡片中').addTextArea(t => { inputs.description = t.inputEl; t.setValue(values.description).onChange(v => { values.description = v; valid(); }); t.inputEl.rows = 3; t.inputEl.addClass('blog-input-wide'); });
    slugSetting = new Setting(contentEl).setName('网址').addText(t => { inputs.slug = t.inputEl; t.setValue(values.slug).onChange(v => { values.slug = v.trim(); valid(); }); });
    if (!values.slug) slugSetting.addExtraButton(b => b.setIcon('wand-2').setTooltip('根据标题生成').onClick(() => { values.slug = suggestSlug(values.title, taken); inputs.slug.value = values.slug; valid(); }));
    new Setting(contentEl).setName('发布日期').addText(t => { inputs.pubDate = t.inputEl; t.inputEl.type = 'date'; t.setValue(values.pubDate).onChange(v => { values.pubDate = v; valid(); }); });
    new Setting(contentEl).setName('标签').setDesc('用逗号分隔').addText(t => { inputs.tags = t.inputEl; t.setValue(values.tags).onChange(v => values.tags = v); t.inputEl.addClass('blog-input-wide'); });
    const cover = new Setting(contentEl).setName('封面');
    const preview = contentEl.createDiv({ cls: 'blog-cover-field' });
    const showCover = () => {
      preview.empty();
      const url = imageUrl(this.app, values.heroImage, this.file.path);
      if (url) preview.createEl('img', { attr: { src: url, alt: '封面预览' } });
      cover.setDesc(values.heroImage ? values.heroImage : '没有封面时使用站点默认封面');
    };
    cover.addButton(b => b.setButtonText(values.heroImage ? '更换' : '选择图片').onClick(() => new ImagePicker(this.plugin, image => { values.heroImage = image.path; showCover(); }).open()));
    cover.addExtraButton(b => b.setIcon('x').setTooltip('移除封面').onClick(() => { values.heroImage = ''; showCover(); }));
    showCover();
    new Setting(contentEl).addButton(b => b.setButtonText('取消').onClick(() => this.close())).addButton(b => {
      saveButton = b;
      b.setButtonText('保存').setCta().onClick(async () => {
        if (!valid()) return;
        await this.app.fileManager.processFrontMatter(this.file, data => {
          data.title = values.title.trim(); data.description = values.description.trim(); data.slug = values.slug;
          data.pubDate = values.pubDate; data.blogTags = values.tags.split(/[,，]/).map(s => s.trim()).filter(Boolean);
          data.heroImage = values.heroImage;
        });
        this.close(); new Notice('文章属性已保存'); this.onSaved?.();
      });
    });
    valid();
    const target = inputs[this.focus === 'heroImage' ? 'title' : this.focus] || inputs.title;
    setTimeout(() => target?.focus(), 0);
  }
  onClose() { this.contentEl.empty(); }
}

// ---------- Publish confirmation ----------
class ConfirmModal extends Modal {
  constructor(app, { title, lines, confirm, danger = false, onConfirm, remember }) { super(app); Object.assign(this, { heading: title, lines, confirmText: confirm, danger, onConfirm, remember }); }
  onOpen() {
    this.modalEl.addClass('blog-modal');
    this.titleEl.setText(this.heading);
    const list = this.contentEl.createEl('ul', { cls: 'blog-confirm-list' });
    for (const [icon, text] of this.lines) { const li = list.createEl('li'); setIcon(li.createSpan({ cls: 'blog-confirm-icon' }), icon); li.createSpan({ text }); }
    let skip = false;
    if (this.remember) new Setting(this.contentEl).setName('以后发布不再询问').setDesc('可以在设置中重新打开').addToggle(t => t.onChange(v => skip = v));
    new Setting(this.contentEl).addButton(b => b.setButtonText('取消').onClick(() => this.close())).addButton(b => {
      b.setButtonText(this.confirmText); if (this.danger) b.setWarning(); else b.setCta();
      b.onClick(() => { this.close(); if (skip) this.remember(); this.onConfirm(); });
      setTimeout(() => b.buttonEl.focus(), 0);
    });
  }
  onClose() { this.contentEl.empty(); }
}

// ---------- Image picker ----------
class ImagePicker extends FuzzySuggestModal {
  constructor(plugin, choose) { super(plugin.app); Object.assign(this, { plugin, choose }); this.setPlaceholder('搜索知识库中的图片'); this.modalEl.addClass('blog-image-picker'); }
  getItems() { return this.app.vault.getFiles().filter(f => /^(png|jpe?g|webp|gif|avif|svg)$/i.test(f.extension)).sort((a, b) => b.stat.mtime - a.stat.mtime); }
  getItemText(file) { return file.path; }
  renderSuggestion(match, el) {
    const file = match.item;
    el.addClass('blog-image-option');
    el.createEl('img', { attr: { src: this.app.vault.getResourcePath(file), alt: '', loading: 'lazy' } });
    const text = el.createDiv();
    text.createDiv({ text: file.name });
    text.createEl('small', { text: `${file.parent?.path || '/'} · ${bytes(file.stat.size)}` });
  }
  onChooseItem(file) { new ImageDetails(this.plugin, file, this.choose).open(); }
}

class ImageDetails extends Modal {
  constructor(plugin, file, choose) { super(plugin.app); Object.assign(this, { plugin, file, choose }); }
  async onOpen() {
    this.modalEl.addClass('blog-modal');
    this.titleEl.setText(this.file.name);
    this.contentEl.createEl('img', { cls: 'blog-image-detail', attr: { src: this.app.vault.getResourcePath(this.file), alt: this.file.name } });
    const info = this.contentEl.createEl('p', { cls: 'blog-muted', text: '正在读取尺寸…' });
    new Setting(this.contentEl).addButton(b => b.setButtonText('取消').onClick(() => this.close())).addButton(b => b.setButtonText('使用这张图').setCta().onClick(() => { this.close(); this.choose(this.file); }));
    try {
      const v = await this.plugin.runner.rpc('image-info', this.file.path, { timeout: 30000 });
      const saved = v.optimizedBytes < v.originalBytes ? `，发布时压缩到 ${bytes(v.optimizedBytes)}（-${Math.round((1 - v.optimizedBytes / v.originalBytes) * 100)}%）` : '';
      info.setText(`${v.width || '?'} × ${v.height || '?'} · ${bytes(v.originalBytes)}${saved}${v.animated ? ' · 动图保持原样' : ''}`);
    } catch { info.setText(bytes(this.file.stat.size)); }
  }
  onClose() { this.contentEl.empty(); }
}

// ---------- Sync conflicts ----------
function excerpt(local, repo) {
  const a = local.split('\n'), b = repo.split('\n'); let start = 0, end = 0;
  while (start < Math.min(a.length, b.length) && a[start] === b[start]) start++;
  while (end < Math.min(a.length, b.length) - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
  const slice = lines => lines.slice(Math.max(0, start - 3), Math.min(lines.length, lines.length - end + 3)).join('\n');
  return [slice(a), slice(b)];
}

class ConflictsModal extends Modal {
  constructor(plugin, report) { super(plugin.app); Object.assign(this, { plugin, report, choices: {} }); }
  onOpen() {
    this.modalEl.addClass('blog-modal', 'blog-conflicts');
    this.titleEl.setText(`处理 ${this.report.conflicts.length} 项差异`);
    this.contentEl.createEl('p', { cls: 'blog-muted', text: '本地和仓库都改过这些内容。逐项选择保留哪一边，应用前会自动备份。' });
    let apply;
    const refresh = () => apply.setDisabled(this.report.conflicts.some(c => !this.choices[c.id]));
    for (const item of this.report.conflicts) {
      const card = this.contentEl.createDiv({ cls: 'blog-conflict' });
      card.createEl('h4', { text: item.label });
      card.createEl('p', { cls: 'blog-muted', text: item.reason });
      const show = v => v == null ? '（已删除）' : typeof v === 'string' ? v : JSON.stringify(v, null, 2);
      const local = show(item.local), repo = show(item.repo), [a, b] = excerpt(local, repo);
      const columns = card.createDiv({ cls: 'blog-diff-columns' });
      const options = [['local', 'Obsidian 本地', a, local, item.local === null ? '保留本地的删除' : '保留本地版本'], ['repo', '仓库版本', b, repo, item.repo === null ? '接受仓库的删除' : '使用仓库版本']];
      const buttons = [];
      for (const [choice, label, snippet, full, action] of options) {
        const col = columns.createDiv({ cls: 'blog-diff-column' });
        col.createEl('strong', { text: label });
        col.createEl('pre', { text: snippet || '（空）' });
        const more = col.createEl('details'); more.createEl('summary', { text: '完整内容' }); more.createEl('pre', { text: full });
        const button = col.createEl('button', { text: action });
        buttons.push([button, choice, col]);
        button.addEventListener('click', () => {
          this.choices[item.id] = choice;
          for (const [b, c, column] of buttons) { b.toggleClass('mod-cta', c === choice); column.toggleClass('is-chosen', c === choice); }
          refresh();
        });
      }
    }
    new Setting(this.contentEl).addButton(b => b.setButtonText('稍后处理').onClick(() => this.close())).addButton(b => {
      apply = b; b.setButtonText('备份并应用').setCta().setDisabled(true).onClick(() => { this.close(); this.plugin.syncChanges({ token: this.report.token, choices: this.choices }); });
    });
  }
  onClose() { this.contentEl.empty(); }
}

module.exports = { NewPostModal, PropertiesModal, ConfirmModal, ImagePicker, ConflictsModal, bytes };

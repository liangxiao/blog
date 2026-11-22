// State of one long-running blog operation (publish, preview, sync, login). Views subscribe to
// changes; the operation itself knows nothing about the DOM.
const STEP_SETS = {
  publish: [
    ['check', '检查内容', ['checking']],
    ['build', '构建网站', ['building']],
    ['images', '上传图片', ['images']],
    ['push', '推送到 GitHub', ['pushing']],
    ['deploy', '部署到 Cloudflare', ['deploying']],
  ],
  preview: [['check', '检查内容', []], ['preview', '启动本地预览', []]],
  sync: [['sync', '同步仓库变化', []]],
  login: [['login', '在浏览器中完成 Cloudflare 授权', []]],
  media: [['media', '检查图床连接', []]],
};

// What the user can do about each failure type. `action` ids are handled by the plugin.
const REMEDIES = {
  AUTH_CLOUDFLARE: { hint: 'Cloudflare 的登录授权过期了。重新登录后再发布即可，已完成的步骤不会重复。', actions: [['login', '登录 Cloudflare', true], ['retry', '重试']] },
  NETWORK: { hint: '网络连接不稳定或代理不可用。确认代理（Clash 等）已开启后重试。', actions: [['retry', '重试', true], ['network', '网络设置']] },
  REMOTE_CHANGED: { hint: 'GitHub 上有这台电脑还没有的修改。先同步，再发布，避免覆盖。', actions: [['sync', '同步变化', true]] },
  REPO_STATE: { hint: '博客仓库有未提交或未推送的改动，发布暂停以免带上无关内容。', actions: [['repo', '打开仓库文件夹'], ['retry', '重试']] },
  VALIDATION: { hint: '文章内容需要调整后才能发布。', actions: [['edit', '编辑文章属性', true], ['open', '打开文章']] },
  BUILD: { hint: '网站构建失败，正式网站没有任何变化。展开日志可查看具体哪一行出错。', actions: [['log', '查看日志', true], ['retry', '重试']] },
  IMAGE: { hint: '图片上传或图床配置有问题。', actions: [['retry', '重试', true], ['media', '图床设置']] },
  DEPLOY: { hint: '内容已经保存到 GitHub，只是 Cloudflare 部署没完成。直接重试即可。', actions: [['retry', '重新发布', true], ['login', '登录 Cloudflare']] },
  CANCELLED: { hint: '', actions: [['retry', '重新发布']] },
};

let nextId = 1;
class Operation {
  constructor({ kind, title, subject = '', file = null, scope = null, cancellable = false }) {
    Object.assign(this, { id: nextId++, kind, title, subject, file, scope, cancellable });
    this.steps = (STEP_SETS[kind] || [['run', title, []]]).map(([id, label, stages]) => ({ id, label, stages, status: 'pending', detail: '', startedAt: 0, endedAt: 0 }));
    this.state = 'running';
    this.message = '准备中…';
    this.lines = [];
    this.startedAt = Date.now();
    this.endedAt = 0;
    this.listeners = new Set();
    this.cancelRequested = false;
    this.activate(this.steps[0].id);
  }

  on(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  emit() { for (const listener of this.listeners) try { listener(this); } catch (error) { console.error(error); } }

  get running() { return this.state === 'running'; }
  get elapsed() { return (this.endedAt || Date.now()) - this.startedAt; }
  get activeStep() { return this.steps.find(s => s.status === 'active'); }
  get remedy() { return this.errorCode ? REMEDIES[this.errorCode] : null; }

  activate(id, detail = '') {
    const index = this.steps.findIndex(s => s.id === id);
    if (index < 0) return;
    const now = Date.now();
    this.steps.forEach((step, i) => {
      if (i < index && step.status !== 'done') { step.status = step.status === 'pending' ? 'skipped' : 'done'; step.endedAt ||= now; }
      if (i === index) { if (step.status !== 'active') step.startedAt = now; step.status = 'active'; step.detail = detail; }
    });
  }

  log(line) { this.lines.push(line); if (this.lines.length > 2000) this.lines.splice(0, this.lines.length - 2000); this.emit(); }

  // Maps a `@blog-progress` record from the scripts onto the visible steps.
  progress(record) {
    if (!this.running) return;
    const step = this.steps.find(s => s.stages.includes(record.stage));
    if (step) {
      const detail = record.total ? `${record.current}/${record.total}` : '';
      this.activate(step.id, detail);
      step.fraction = record.total ? (record.current - 1) / record.total : null;
    }
    if (record.message && !['failed', 'published', 'pushed'].includes(record.stage)) this.message = record.message;
    if (record.stage === 'pushing' || record.stage === 'deploying') this.cancellable = false;
    if (record.stage === 'pushed') this.partial = true; // pushed to GitHub but no direct deploy
    if (record.stage === 'failed') { this.errorCode = record.code || this.errorCode; this.errorMessage = record.message; }
    this.emit();
  }

  finish(ok, { message, url, error, code } = {}) {
    if (!this.running) return;
    const now = Date.now();
    this.endedAt = now;
    if (this.cancelRequested && !ok) { this.state = 'cancelled'; code = 'CANCELLED'; }
    else this.state = ok ? 'success' : 'failed';
    for (const step of this.steps) {
      if (ok && (step.status === 'active' || step.status === 'pending')) {
        step.status = this.partial && step.id === 'deploy' ? 'skipped' : 'done';
        step.endedAt ||= now;
      } else if (!ok && step.status === 'active') { step.status = this.state === 'cancelled' ? 'skipped' : 'failed'; step.endedAt = now; }
    }
    this.message = message || (ok ? '完成' : this.state === 'cancelled' ? '已取消' : '没有完成');
    this.url = url;
    if (!ok) {
      this.errorCode = code || this.errorCode || null;
      this.errorMessage = error || this.errorMessage || this.lines.filter(l => /错误|失败|Error|✘/.test(l)).at(-1) || '查看日志了解原因';
    }
    this.emit();
  }
}

const formatDuration = ms => ms < 1000 ? '<1 秒' : ms < 60000 ? `${Math.round(ms / 1000)} 秒` : `${Math.floor(ms / 60000)} 分 ${Math.round((ms % 60000) / 1000)} 秒`;

module.exports = { Operation, REMEDIES, formatDuration };

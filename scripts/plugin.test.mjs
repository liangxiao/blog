// Exercises the bundled Obsidian plugin (integrations/obsidian-blog-publisher/main.js) against a
// stubbed `obsidian` module and a fake blog repository whose scripts emit the real protocol.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Module, {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pluginDir = path.join(root, 'integrations/obsidian-blog-publisher');
const require = createRequire(import.meta.url);

const notices = [];
class Stub { constructor(app) { this.app = app; } }
const obsidian = {
  Plugin: class extends Stub {
    constructor(app, manifest) { super(app); this.manifest = manifest; this.data = null; }
    async loadData() { return this.data; } async saveData(d) { this.data = d; }
    registerView() {} addSettingTab() {} addRibbonIcon() {} addCommand() {} registerEvent() {} addChild() {} removeChild() {}
    addStatusBarItem() { return {addClass() {}, addEventListener() {}, empty() {}, setText(t) { this.text = t; }, show() {}, hide() {}}; }
  },
  Notice: class { constructor(text) { notices.push(text); } },
  MarkdownView: class {}, ItemView: class {}, Modal: class extends Stub { open() { this.opened = true; } },
  FuzzySuggestModal: class extends Stub {}, PluginSettingTab: class extends Stub { cleanup() {} updateSiteStatus() {} },
  Setting: class {}, Component: class {}, MarkdownRenderer: {},
  setIcon() {}, debounce: fn => fn,
};
const load = Module._load;
Module._load = function (request, ...rest) { return request === 'obsidian' ? obsidian : load.call(this, request, ...rest); };

const {Operation} = require(path.join(pluginDir, 'src/operation.js'));
const {buildEnv} = require(path.join(pluginDir, 'src/runner.js'));
const {suggestSlug, checklist, articleInfo} = require(path.join(pluginDir, 'src/articles.js'));

function fixture({publish = 'ok'} = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-plugin-'));
  const vault = path.join(base, 'vault'), repo = path.join(base, 'repo');
  fs.mkdirSync(path.join(vault, 'blog'), {recursive: true});
  fs.mkdirSync(path.join(repo, 'scripts'), {recursive: true});
  fs.mkdirSync(path.join(repo, 'node_modules'));
  fs.mkdirSync(path.join(repo, 'src/config'), {recursive: true});
  fs.writeFileSync(path.join(repo, 'src/config/site.json'), JSON.stringify({title: '测试博客', url: 'https://example.com'}));
  fs.writeFileSync(path.join(repo, 'scripts/sync.mjs'), `const [a]=process.argv.slice(2);if(a!=='validate')process.getBuiltinModule('fs').appendFileSync(${JSON.stringify(path.join(base, 'rpc.log'))},a+'\\n');console.log(JSON.stringify(a==='validate'?{ok:true,issues:[]}:{ok:true,checkedAt:new Date().toISOString(),counts:{local:0,remote:0,conflict:0,synced:1},changes:[]}));`);
  const state = path.join(vault, '.obsidian/plugins/local-blog-publisher');
  const progress = (stage, message, extra = {}) => `console.log('@blog-progress '+JSON.stringify({stage:${JSON.stringify(stage)},message:${JSON.stringify(message)},at:new Date().toISOString(),...${JSON.stringify(extra)}}));`;
  const scripts = {
    ok: progress('checking', '检查') + progress('building', '构建') + progress('images', '上传图片 1/2', {current: 1, total: 2}) + progress('pushing', '推送') + progress('deploying', '部署') + progress('published', '文章已发布'),
    auth: progress('building', '构建') + `process.getBuiltinModule('fs').mkdirSync(${JSON.stringify(state)},{recursive:true});process.getBuiltinModule('fs').writeFileSync(${JSON.stringify(path.join(state, 'publish-status.json'))},JSON.stringify({stage:'failed',message:'Cloudflare 授权已过期',code:'AUTH_CLOUDFLARE',at:new Date().toISOString()}));` + progress('failed', 'Cloudflare 授权已过期', {code: 'AUTH_CLOUDFLARE'}) + 'console.error("Cloudflare 授权已过期");process.exitCode=1;',
    slow: progress('building', '构建') + `const fs=process.getBuiltinModule('fs'),f=${JSON.stringify(path.join(state, 'cancel-request'))};const t=setInterval(()=>{if(fs.existsSync(f)){clearInterval(t);fs.rmSync(f);fs.writeFileSync(${JSON.stringify(path.join(base, 'saw-cancel'))},'');console.error('已取消发布');process.exitCode=1;}},20);`,
  };
  fs.writeFileSync(path.join(repo, 'scripts/obsidian.mjs'), scripts[publish]);
  const file = {path: 'blog/测试.md', basename: '测试', extension: 'md', stat: {mtime: 1}};
  const fm = {title: '测试文章', description: '摘要', slug: 'test-post', pubDate: '2026-11-22', heroImage: ''};
  const app = {
    vault: {on() {}, adapter: {getBasePath: () => vault}, getMarkdownFiles: () => [file], getAbstractFileByPath: () => null},
    metadataCache: {getFileCache: () => ({frontmatter: fm, embeds: [], links: []}), getFirstLinkpathDest: () => null},
    workspace: {getLeavesOfType: () => [], getRightLeaf: () => ({setViewState: async () => {}}), revealLeaf() {}, onLayoutReady() {}, getActiveViewOfType: () => null, getActiveFile: () => file},
  };
  return {base, vault, repo, file, fm, app, state};
}

async function plugin(f) {
  const Plugin = require(path.join(pluginDir, 'main.js'));
  const p = new Plugin(f.app, {id: 'local-blog-publisher'});
  p.data = {repoPath: f.repo, nodePath: process.execPath, proxyMode: 'off', confirmPublish: false};
  await p.onload();
  return p;
}

test('operation steps follow script progress, including partial deploys and failures', () => {
  const op = new Operation({kind: 'publish', title: '发布'});
  assert.equal(op.activeStep.id, 'check');
  op.progress({stage: 'images', message: '上传 2/5', current: 2, total: 5});
  assert.deepEqual(op.steps.map(s => s.status), ['done', 'skipped', 'active', 'pending', 'pending']);
  assert.equal(op.activeStep.detail, '2/5');
  op.progress({stage: 'pushing', message: '推送'}); assert.equal(op.cancellable, false);
  op.progress({stage: 'pushed', message: '已推送'});
  op.finish(true);
  assert.equal(op.state, 'success'); assert.equal(op.steps.at(-1).status, 'skipped');
  const failed = new Operation({kind: 'publish', title: '发布'});
  failed.progress({stage: 'building', message: '构建'});
  failed.finish(false, {error: '构建失败', code: 'BUILD'});
  assert.equal(failed.steps[1].status, 'failed'); assert.equal(failed.remedy.actions[0][0], 'log');
});

test('child processes get an explicit proxy and IPv4-first DNS, never inherited stale proxies', () => {
  const saved = process.env.ALL_PROXY; process.env.ALL_PROXY = 'socks5://stale:1';
  try {
    const off = buildEnv({nodePath: '/usr/local/bin/node', proxyMode: 'off'}).env;
    assert.equal(off.ALL_PROXY, undefined); assert.equal(off.HTTPS_PROXY, undefined); assert.match(off.NODE_OPTIONS, /--dns-result-order=ipv4first/);
    const custom = buildEnv({nodePath: '/usr/local/bin/node', proxyMode: 'custom', proxyUrl: 'http://127.0.0.1:7897'}).env;
    assert.equal(custom.HTTPS_PROXY, 'http://127.0.0.1:7897'); assert.equal(custom.NODE_USE_ENV_PROXY, '1'); assert.match(custom.NO_PROXY, /127\.0\.0\.1/);
    assert.ok(custom.PATH.startsWith('/usr/local/bin:'));
  } finally { if (saved === undefined) delete process.env.ALL_PROXY; else process.env.ALL_PROXY = saved; }
});

test('slug suggestions use ASCII words, fall back to the date, and avoid collisions', () => {
  assert.equal(suggestSlug('Agent 落地 Notes'), 'agent-notes');
  assert.match(suggestSlug('企业级落地的观察'), /^post-\d{4}-\d{2}-\d{2}$/);
  assert.equal(suggestSlug('Hello World', new Set(['hello-world'])), 'hello-world-2');
});

test('the checklist blocks missing metadata and private note links but only warns about covers', () => {
  const f = fixture();
  try {
    const p = {app: f.app, config: {repoPath: f.repo}, syncReport: null, siteUrl: null};
    let items = checklist(f.app, articleInfo(p, f.file));
    assert.deepEqual(items.filter(i => !i.ok).map(i => [i.label, i.level]), [['封面', 'warn']]);
    f.fm.slug = 'Bad Slug'; f.fm.description = '';
    f.app.metadataCache.getFileCache = () => ({frontmatter: f.fm, embeds: [], links: [{link: '私人笔记', original: '[[私人笔记]]'}]});
    items = checklist(f.app, articleInfo(p, f.file));
    assert.deepEqual(items.filter(i => !i.ok && i.level === 'error').map(i => i.label), ['摘要', '网址', '私人笔记链接']);
  } finally { fs.rmSync(f.base, {recursive: true, force: true}); }
});

test('publishing runs validation then the publish script and reports success with the article URL', async () => {
  const f = fixture();
  try {
    const p = await plugin(f);
    await p.runPublish(f.file);
    const op = p.operation;
    assert.equal(op.state, 'success', op.errorMessage);
    assert.equal(op.url, 'https://example.com/blog/test-post/');
    assert.deepEqual(op.steps.map(s => s.status), ['done', 'done', 'done', 'done', 'done']);
    assert.equal(p.busy, false);
    await p.checkPromise;
    assert.match(fs.readFileSync(path.join(f.base, 'rpc.log'), 'utf8'), /^check$/m, 'a successful publish re-checks GitHub immediately');
  } finally { fs.rmSync(f.base, {recursive: true, force: true}); }
});

test('a failed publish surfaces the error code so the panel can offer “登录 Cloudflare”', async () => {
  const f = fixture({publish: 'auth'});
  try {
    const p = await plugin(f);
    await p.runPublish(f.file);
    assert.equal(p.operation.state, 'failed');
    assert.equal(p.operation.errorCode, 'AUTH_CLOUDFLARE');
    assert.equal(p.operation.remedy.actions[0][0], 'login');
    assert.equal(p.operation.steps[1].status, 'failed');
  } finally { fs.rmSync(f.base, {recursive: true, force: true}); }
});

test('cancelling a publish writes a cancel request and ends in the cancelled state', async () => {
  const f = fixture({publish: 'slow'});
  try {
    const p = await plugin(f);
    const running = p.runPublish(f.file);
    for (let i = 0; i < 200 && p.operation?.activeStep?.id !== 'build'; i++) await new Promise(r => setTimeout(r, 10));
    p.cancelOperation();
    await running;
    assert.equal(p.operation.state, 'cancelled');
    assert.ok(fs.existsSync(path.join(f.base, 'saw-cancel')), 'script observed the cancel request');
  } finally { fs.rmSync(f.base, {recursive: true, force: true}); }
});

test('a missing repository is reported as a setup problem instead of a crash', async () => {
  const f = fixture();
  try {
    const p = await plugin(f);
    p.config.repoPath = path.join(f.base, 'missing');
    assert.match(p.runner.diagnose().join(), /找不到博客仓库/);
    await p.runPublish(f.file);
    assert.equal(p.operation.state, 'failed'); assert.match(p.operation.errorMessage, /找不到博客仓库/);
  } finally { fs.rmSync(f.base, {recursive: true, force: true}); }
});

// Runs the blog repository scripts as child processes with a predictable environment.
// Obsidian is a GUI app: it does not inherit the shell's PATH or proxy variables, so we
// rebuild both here instead of relying on whatever the Dock happened to launch it with.
const { spawn, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const PROXY_KEYS = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'NO_PROXY', 'no_proxy'];

// Reads the macOS system proxy (what Clash / Surge set with "系统代理"). Only HTTP(S) proxies are
// usable by Node's built-in fetch, git and wrangler, so SOCKS-only setups are ignored.
function systemProxy() {
  if (process.platform !== 'darwin') return null;
  try {
    const out = execFileSync('/usr/sbin/scutil', ['--proxy'], { encoding: 'utf8', timeout: 2000 });
    const get = key => (out.match(new RegExp(`\\b${key}\\s*:\\s*(\\S+)`)) || [])[1];
    for (const kind of ['HTTPS', 'HTTP']) {
      if (get(`${kind}Enable`) === '1' && get(`${kind}Proxy`)) return `http://${get(`${kind}Proxy`)}:${get(`${kind}Port`) || 80}`;
    }
  } catch { /* no proxy information available */ }
  return null;
}

function resolveProxy(config) {
  if (config.proxyMode === 'off') return { url: null, source: '已关闭' };
  if (config.proxyMode === 'custom') return { url: config.proxyUrl?.trim() || null, source: '自定义' };
  const system = systemProxy();
  if (system) return { url: system, source: '系统代理' };
  const inherited = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  return inherited ? { url: inherited, source: '环境变量' } : { url: null, source: '直连' };
}

function buildEnv(config) {
  const env = { ...process.env };
  for (const key of PROXY_KEYS) delete env[key];
  const nodeDir = path.dirname(config.nodePath);
  env.PATH = [nodeDir, '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', process.env.PATH || ''].join(':');
  // Some networks advertise IPv6 but cannot route it; Node would otherwise hang on the AAAA address.
  env.NODE_OPTIONS = [process.env.NODE_OPTIONS, '--dns-result-order=ipv4first'].filter(Boolean).join(' ');
  env.WRANGLER_SEND_METRICS = 'false';
  env.FORCE_COLOR = '0';
  const proxy = resolveProxy(config);
  if (proxy.url) {
    for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy']) env[key] = proxy.url;
    env.NO_PROXY = env.no_proxy = 'localhost,127.0.0.1,::1';
    env.NODE_USE_ENV_PROXY = '1'; // Node 24+: make global fetch honour HTTP(S)_PROXY
  }
  return { env, proxy };
}

const stripAnsi = text => text.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '');

class Runner {
  constructor(plugin) { this.plugin = plugin; }
  get config() { return this.plugin.config; }
  get vault() { return this.plugin.app.vault.adapter.getBasePath(); }

  // Returns a list of human readable problems with the local setup, empty when ready.
  diagnose() {
    const problems = [];
    const { repoPath, nodePath } = this.config;
    if (!repoPath) problems.push('还没有填写博客仓库路径');
    else if (!fs.existsSync(path.join(repoPath, 'scripts/sync.mjs'))) problems.push(`在 ${repoPath} 找不到博客仓库（缺少 scripts/sync.mjs）`);
    else if (!fs.existsSync(path.join(repoPath, 'node_modules'))) problems.push('博客仓库还没有安装依赖，请在仓库目录运行 npm install');
    if (!nodePath || !fs.existsSync(nodePath)) problems.push(`找不到 Node.js：${nodePath || '未填写'}`);
    return problems;
  }

  describeNetwork() { const { proxy } = buildEnv(this.config); return proxy.url ? `${proxy.source} ${proxy.url}` : proxy.source; }

  // Spawns `node <script> ...args`. Streams stdout lines to `onLine`, progress records to `onProgress`.
  start(script, args, { onLine = () => {}, onProgress = () => {}, timeout = 0 } = {}) {
    const problems = this.diagnose();
    if (problems.length) return { child: null, done: Promise.resolve({ code: 1, startError: problems.join('；') }) };
    const { env } = buildEnv(this.config);
    const child = spawn(this.config.nodePath, [path.join(this.config.repoPath, script), ...args], { cwd: this.config.repoPath, env, shell: false });
    let pending = '', stderr = '', startError = null, timer = null;
    const handle = chunk => {
      pending += stripAnsi(chunk.toString());
      const lines = pending.split('\n'); pending = lines.pop();
      for (const line of lines) {
        if (line.startsWith('@blog-progress ')) { try { onProgress(JSON.parse(line.slice(15))); } catch { /* ignore malformed */ } }
        else if (line.trim()) onLine(line);
      }
    };
    child.stdout.on('data', handle);
    child.stderr.on('data', chunk => { const text = stripAnsi(chunk.toString()); stderr += text; for (const line of text.split('\n')) if (line.trim()) onLine(line); });
    if (timeout) timer = setTimeout(() => { startError = `操作超过 ${Math.round(timeout / 1000)} 秒没有完成，已停止`; child.kill('SIGTERM'); }, timeout);
    const done = new Promise(resolve => {
      child.on('error', error => { startError = `无法启动 Node.js：${error.message}`; });
      child.on('close', code => { clearTimeout(timer); if (pending.trim()) onLine(pending); resolve({ code: code ?? 1, stderr, startError }); });
    });
    return { child, done };
  }

  // One-shot JSON RPC against scripts/sync.mjs: the last stdout line is the JSON result.
  rpc(action, arg, { timeout = 90000 } = {}) {
    return new Promise((resolve, reject) => {
      const problems = this.diagnose();
      if (problems.length) return reject(new Error(problems.join('；')));
      const args = [path.join(this.config.repoPath, 'scripts/sync.mjs'), action, this.vault];
      if (arg !== undefined) args.push(typeof arg === 'string' ? arg : JSON.stringify(arg));
      const { env } = buildEnv(this.config);
      const child = spawn(this.config.nodePath, args, { cwd: this.config.repoPath, env, shell: false });
      let output = '', errors = '';
      const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('检查超时，请确认网络后重试')); }, timeout);
      child.stdout.on('data', d => output += d);
      child.stderr.on('data', d => errors += d);
      child.on('error', error => { clearTimeout(timer); reject(new Error(`无法启动 Node.js：${error.message}`)); });
      child.on('close', code => {
        clearTimeout(timer);
        let result;
        try { result = JSON.parse(output.trim().split('\n').at(-1)); }
        catch { return reject(new Error(stripAnsi(errors).trim().split('\n').at(-1) || '检查没有返回结果')); }
        if (code !== 0 || result.error) reject(new Error(result.error || errors || '检查失败'));
        else resolve(result);
      });
    });
  }
}

module.exports = { Runner, systemProxy, buildEnv };

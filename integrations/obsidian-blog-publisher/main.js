/* 博客发布 — generated from src/ by `npm run plugin:build`; edit the sources instead. */
"use strict";
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// integrations/obsidian-blog-publisher/site-store.cjs
var require_site_store = __commonJS({
  "integrations/obsidian-blog-publisher/site-store.cjs"(exports2, module2) {
    "use strict";
    var fs2 = require("node:fs");
    var path2 = require("node:path");
    var pluginDir = (vault) => path2.join(vault, ".obsidian/plugins/local-blog-publisher");
    var storagePath = (vault) => path2.join(pluginDir(vault), "site.json");
    function readSite(vault) {
      const value = JSON.parse(fs2.readFileSync(storagePath(vault), "utf8"));
      if (value.version !== 1 || !value.values || typeof value.values !== "object" || Array.isArray(value.values) || typeof value.home !== "string" || typeof value.about !== "string") throw new Error("站点草稿格式不正确，请恢复备份后重试；不会使用旧笔记覆盖。");
      return value;
    }
    function saveSite(vault, value) {
      fs2.mkdirSync(pluginDir(vault), { recursive: true });
      const target = storagePath(vault), temp = `${target}.tmp`;
      fs2.writeFileSync(temp, JSON.stringify(value, null, 2) + "\n");
      fs2.renameSync(temp, target);
    }
    function markdownBody(text) {
      return text.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "");
    }
    function patchSite(vault, base, desired) {
      const current = readSite(vault), merged = JSON.parse(JSON.stringify(current)), external = [];
      const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
      for (const key of /* @__PURE__ */ new Set([...Object.keys(base.values), ...Object.keys(desired.values)])) {
        const changed = !same(base.values[key], desired.values[key]), outside = !same(base.values[key], current.values[key]);
        if (changed && outside && !same(current.values[key], desired.values[key])) throw new Error(`「${key}」在别处也有修改，当前输入尚未保存。请先复制当前输入，再重新打开设置查看新版本。`);
        if (changed) merged.values[key] = desired.values[key];
        else if (outside) external.push(key);
      }
      for (const key of ["home", "about"]) {
        const changed = !same(base[key], desired[key]), outside = !same(base[key], current[key]);
        if (changed && outside && !same(current[key], desired[key])) throw new Error(`${key === "home" ? "首页介绍" : "关于页正文"}在别处也有修改，当前输入尚未保存。请先复制当前输入，再重新打开设置查看新版本。`);
        if (changed) merged[key] = desired[key];
        else if (outside) external.push(key === "home" ? "首页介绍" : "关于页正文");
      }
      saveSite(vault, merged);
      return { value: merged, external };
    }
    function migrateSite(vault, parseYaml, fallback) {
      if (!fs2.existsSync(storagePath(vault))) {
        const draft2 = { version: 1, values: { ...fallback.values }, home: fallback.home, about: fallback.about };
        const settings = path2.join(vault, "blog/站点设置.md");
        if (fs2.existsSync(settings)) {
          const text = fs2.readFileSync(settings, "utf8"), match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
          if (!match) throw new Error("旧站点设置缺少属性，迁移已停止，原文件保持不变。");
          const values = parseYaml(match[1]);
          if (!values || typeof values !== "object" || Array.isArray(values)) throw new Error("旧站点设置格式不正确，原文件保持不变。");
          Object.assign(draft2.values, values);
        }
        for (const [key, name] of [["home", "首页介绍"], ["about", "关于"]]) {
          const file = path2.join(vault, "blog", `${name}.md`);
          if (fs2.existsSync(file)) draft2[key] = markdownBody(fs2.readFileSync(file, "utf8"));
        }
        saveSite(vault, draft2);
      }
      const draft = readSite(vault);
      for (const name of ["站点设置.md", "首页介绍.md", "关于.md", "使用说明.md", "站点管理使用说明.md"]) {
        const file = path2.join(vault, "blog", name);
        if (!fs2.existsSync(file)) continue;
        const backup = path2.join(pluginDir(vault), "legacy-site-notes");
        fs2.mkdirSync(backup, { recursive: true });
        let dest = path2.join(backup, name);
        if (fs2.existsSync(dest)) dest = path2.join(backup, `${Date.now()}-${name}`);
        fs2.renameSync(file, dest);
      }
      return draft;
    }
    module2.exports = { storagePath, readSite, saveSite, patchSite, migrateSite, markdownBody };
  }
});

// integrations/obsidian-blog-publisher/site-fields.json
var require_site_fields = __commonJS({
  "integrations/obsidian-blog-publisher/site-fields.json"(exports2, module2) {
    module2.exports = [
      {
        key: "title",
        label: "博客标题",
        type: "text",
        default: "没有终点"
      },
      {
        key: "description",
        label: "博客简介",
        type: "text",
        default: "记录 AI Agent、投研 Agent 架构，以及基金投资的学习笔记。"
      },
      {
        key: "author",
        label: "作者名称",
        type: "text",
        default: "xiao liang"
      },
      {
        key: "url",
        label: "正式网址",
        type: "url",
        default: "https://old-rookie.pages.dev"
      },
      {
        key: "language",
        label: "页面语言",
        type: "language",
        default: "zh-CN"
      },
      {
        key: "homeHeading",
        label: "首页标题",
        type: "text",
        default: "你好，我是 xiao liang 👋"
      },
      {
        key: "homeCover",
        label: "首页封面",
        type: "image",
        default: ""
      },
      {
        key: "avatar",
        label: "作者头像",
        type: "image",
        default: ""
      },
      {
        key: "defaultCover",
        label: "默认文章封面",
        type: "image",
        default: ""
      },
      {
        key: "favicon",
        label: "网站图标",
        type: "image",
        default: "/favicon.svg"
      },
      {
        key: "latestHeading",
        label: "最新文章标题",
        type: "text",
        default: "最近文章"
      },
      {
        key: "latestCount",
        label: "首页文章数量",
        type: "number",
        default: 5,
        min: 1,
        max: 50
      },
      {
        key: "allPostsText",
        label: "全部文章按钮文字",
        type: "text",
        default: "查看全部文章 →"
      },
      {
        key: "blogHeading",
        label: "文章列表标题",
        type: "text",
        default: "全部文章"
      },
      {
        key: "blogDescription",
        label: "文章列表简介",
        type: "text",
        default: "全部文章列表"
      },
      {
        key: "aboutHeading",
        label: "关于页标题",
        type: "text",
        default: "关于"
      },
      {
        key: "aboutDescription",
        label: "关于页简介",
        type: "text",
        default: "关于我和这个博客"
      },
      {
        key: "navigation",
        label: "导航链接",
        type: "links",
        default: [
          {
            label: "首页",
            href: "/"
          },
          {
            label: "文章",
            href: "/blog"
          },
          {
            label: "关于",
            href: "/about"
          }
        ]
      },
      {
        key: "socialLinks",
        label: "社交联系链接",
        type: "links",
        default: []
      },
      {
        key: "showRss",
        label: "显示RSS入口",
        type: "boolean",
        default: true
      },
      {
        key: "showPoweredBy",
        label: "显示Astro署名",
        type: "boolean",
        default: true
      },
      {
        key: "footerText",
        label: "页脚补充文字",
        type: "text",
        default: ""
      },
      {
        key: "copyrightStartYear",
        label: "版权起始年份",
        type: "number",
        default: 2026,
        min: 2e3,
        max: 2100
      },
      {
        key: "accentLight",
        label: "浅色强调色",
        type: "color",
        default: "#2563eb"
      },
      {
        key: "accentDark",
        label: "深色强调色",
        type: "color",
        default: "#60a5fa"
      },
      {
        key: "contentWidth",
        label: "页面宽度",
        type: "number",
        default: 760,
        min: 600,
        max: 1200
      },
      {
        key: "fontSize",
        label: "正文字号",
        type: "number",
        default: 17,
        min: 14,
        max: 24
      },
      {
        key: "showDates",
        label: "显示文章日期",
        type: "boolean",
        default: true
      },
      {
        key: "showTags",
        label: "显示文章标签",
        type: "boolean",
        default: true
      },
      {
        key: "showListCovers",
        label: "显示列表封面",
        type: "boolean",
        default: true
      },
      {
        key: "showArticleCover",
        label: "显示文章顶部封面",
        type: "boolean",
        default: true
      },
      {
        key: "commentsEnabled",
        label: "启用评论",
        type: "boolean",
        default: false
      },
      {
        key: "giscusRepo",
        label: "评论仓库",
        type: "text",
        default: "liangxiao/blog"
      },
      {
        key: "giscusRepoId",
        label: "评论仓库ID",
        type: "text",
        default: ""
      },
      {
        key: "giscusCategoryId",
        label: "评论分类ID",
        type: "text",
        default: ""
      }
    ];
  }
});

// integrations/obsidian-blog-publisher/src/runner.js
var require_runner = __commonJS({
  "integrations/obsidian-blog-publisher/src/runner.js"(exports2, module2) {
    "use strict";
    var { spawn: spawn2, execFileSync } = require("child_process");
    var path2 = require("path");
    var fs2 = require("fs");
    var PROXY_KEYS = ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy", "NO_PROXY", "no_proxy"];
    function systemProxy() {
      if (process.platform !== "darwin") return null;
      try {
        const out = execFileSync("/usr/sbin/scutil", ["--proxy"], { encoding: "utf8", timeout: 2e3 });
        const get = (key) => (out.match(new RegExp(`\\b${key}\\s*:\\s*(\\S+)`)) || [])[1];
        for (const kind of ["HTTPS", "HTTP"]) {
          if (get(`${kind}Enable`) === "1" && get(`${kind}Proxy`)) return `http://${get(`${kind}Proxy`)}:${get(`${kind}Port`) || 80}`;
        }
      } catch {
      }
      return null;
    }
    function resolveProxy(config) {
      if (config.proxyMode === "off") return { url: null, source: "已关闭" };
      if (config.proxyMode === "custom") return { url: config.proxyUrl?.trim() || null, source: "自定义" };
      const system = systemProxy();
      if (system) return { url: system, source: "系统代理" };
      const inherited = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
      return inherited ? { url: inherited, source: "环境变量" } : { url: null, source: "直连" };
    }
    function buildEnv(config) {
      const env = { ...process.env };
      for (const key of PROXY_KEYS) delete env[key];
      const nodeDir = path2.dirname(config.nodePath);
      env.PATH = [nodeDir, "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", process.env.PATH || ""].join(":");
      env.NODE_OPTIONS = [process.env.NODE_OPTIONS, "--dns-result-order=ipv4first"].filter(Boolean).join(" ");
      env.WRANGLER_SEND_METRICS = "false";
      env.FORCE_COLOR = "0";
      const proxy = resolveProxy(config);
      if (proxy.url) {
        for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"]) env[key] = proxy.url;
        env.NO_PROXY = env.no_proxy = "localhost,127.0.0.1,::1";
        env.NODE_USE_ENV_PROXY = "1";
      }
      return { env, proxy };
    }
    var stripAnsi = (text) => text.replace(/\u001b\[[0-9;]*[A-Za-z]/g, "");
    var Runner2 = class {
      constructor(plugin) {
        this.plugin = plugin;
      }
      get config() {
        return this.plugin.config;
      }
      get vault() {
        return this.plugin.app.vault.adapter.getBasePath();
      }
      // Returns a list of human readable problems with the local setup, empty when ready.
      diagnose() {
        const problems = [];
        const { repoPath, nodePath } = this.config;
        if (!repoPath) problems.push("还没有填写博客仓库路径");
        else if (!fs2.existsSync(path2.join(repoPath, "scripts/sync.mjs"))) problems.push(`在 ${repoPath} 找不到博客仓库（缺少 scripts/sync.mjs）`);
        else if (!fs2.existsSync(path2.join(repoPath, "node_modules"))) problems.push("博客仓库还没有安装依赖，请在仓库目录运行 npm install");
        if (!nodePath || !fs2.existsSync(nodePath)) problems.push(`找不到 Node.js：${nodePath || "未填写"}`);
        return problems;
      }
      describeNetwork() {
        const { proxy } = buildEnv(this.config);
        return proxy.url ? `${proxy.source} ${proxy.url}` : proxy.source;
      }
      // Spawns `node <script> ...args`. Streams stdout lines to `onLine`, progress records to `onProgress`.
      start(script, args, { onLine = () => {
      }, onProgress = () => {
      }, timeout = 0 } = {}) {
        const problems = this.diagnose();
        if (problems.length) return { child: null, done: Promise.resolve({ code: 1, startError: problems.join("；") }) };
        const { env } = buildEnv(this.config);
        const child = spawn2(this.config.nodePath, [path2.join(this.config.repoPath, script), ...args], { cwd: this.config.repoPath, env, shell: false });
        let pending = "", stderr = "", startError = null, timer = null;
        const handle = (chunk) => {
          pending += stripAnsi(chunk.toString());
          const lines = pending.split("\n");
          pending = lines.pop();
          for (const line of lines) {
            if (line.startsWith("@blog-progress ")) {
              try {
                onProgress(JSON.parse(line.slice(15)));
              } catch {
              }
            } else if (line.trim()) onLine(line);
          }
        };
        child.stdout.on("data", handle);
        child.stderr.on("data", (chunk) => {
          const text = stripAnsi(chunk.toString());
          stderr += text;
          for (const line of text.split("\n")) if (line.trim()) onLine(line);
        });
        if (timeout) timer = setTimeout(() => {
          startError = `操作超过 ${Math.round(timeout / 1e3)} 秒没有完成，已停止`;
          child.kill("SIGTERM");
        }, timeout);
        const done = new Promise((resolve) => {
          child.on("error", (error) => {
            startError = `无法启动 Node.js：${error.message}`;
          });
          child.on("close", (code) => {
            clearTimeout(timer);
            if (pending.trim()) onLine(pending);
            resolve({ code: code ?? 1, stderr, startError });
          });
        });
        return { child, done };
      }
      // One-shot JSON RPC against scripts/sync.mjs: the last stdout line is the JSON result.
      rpc(action, arg, { timeout = 9e4 } = {}) {
        return new Promise((resolve, reject) => {
          const problems = this.diagnose();
          if (problems.length) return reject(new Error(problems.join("；")));
          const args = [path2.join(this.config.repoPath, "scripts/sync.mjs"), action, this.vault];
          if (arg !== void 0) args.push(typeof arg === "string" ? arg : JSON.stringify(arg));
          const { env } = buildEnv(this.config);
          const child = spawn2(this.config.nodePath, args, { cwd: this.config.repoPath, env, shell: false });
          let output = "", errors = "";
          const timer = setTimeout(() => {
            child.kill("SIGTERM");
            reject(new Error("检查超时，请确认网络后重试"));
          }, timeout);
          child.stdout.on("data", (d) => output += d);
          child.stderr.on("data", (d) => errors += d);
          child.on("error", (error) => {
            clearTimeout(timer);
            reject(new Error(`无法启动 Node.js：${error.message}`));
          });
          child.on("close", (code) => {
            clearTimeout(timer);
            let result;
            try {
              result = JSON.parse(output.trim().split("\n").at(-1));
            } catch {
              return reject(new Error(stripAnsi(errors).trim().split("\n").at(-1) || "检查没有返回结果"));
            }
            if (code !== 0 || result.error) reject(new Error(result.error || errors || "检查失败"));
            else resolve(result);
          });
        });
      }
    };
    module2.exports = { Runner: Runner2, systemProxy, buildEnv };
  }
});

// integrations/obsidian-blog-publisher/src/operation.js
var require_operation = __commonJS({
  "integrations/obsidian-blog-publisher/src/operation.js"(exports2, module2) {
    "use strict";
    var STEP_SETS = {
      publish: [
        ["check", "检查内容", ["checking"]],
        ["build", "构建网站", ["building"]],
        ["images", "上传图片", ["images"]],
        ["push", "推送到 GitHub", ["pushing"]],
        ["deploy", "部署到 Cloudflare", ["deploying"]]
      ],
      preview: [["check", "检查内容", []], ["preview", "启动本地预览", []]],
      sync: [["sync", "同步仓库变化", []]],
      login: [["login", "在浏览器中完成 Cloudflare 授权", []]],
      media: [["media", "检查图床连接", []]]
    };
    var REMEDIES = {
      AUTH_CLOUDFLARE: { hint: "Cloudflare 的登录授权过期了。重新登录后再发布即可，已完成的步骤不会重复。", actions: [["login", "登录 Cloudflare", true], ["retry", "重试"]] },
      NETWORK: { hint: "网络连接不稳定或代理不可用。确认代理（Clash 等）已开启后重试。", actions: [["retry", "重试", true], ["network", "网络设置"]] },
      REMOTE_CHANGED: { hint: "GitHub 上有这台电脑还没有的修改。先同步，再发布，避免覆盖。", actions: [["sync", "同步变化", true]] },
      REPO_STATE: { hint: "博客仓库有未提交或未推送的改动，发布暂停以免带上无关内容。", actions: [["repo", "打开仓库文件夹"], ["retry", "重试"]] },
      VALIDATION: { hint: "文章内容需要调整后才能发布。", actions: [["edit", "编辑文章属性", true], ["open", "打开文章"]] },
      BUILD: { hint: "网站构建失败，正式网站没有任何变化。展开日志可查看具体哪一行出错。", actions: [["log", "查看日志", true], ["retry", "重试"]] },
      IMAGE: { hint: "图片上传或图床配置有问题。", actions: [["retry", "重试", true], ["media", "图床设置"]] },
      DEPLOY: { hint: "内容已经保存到 GitHub，只是 Cloudflare 部署没完成。直接重试即可。", actions: [["retry", "重新发布", true], ["login", "登录 Cloudflare"]] },
      CANCELLED: { hint: "", actions: [["retry", "重新发布"]] }
    };
    var nextId = 1;
    var Operation2 = class {
      constructor({ kind, title, subject = "", file = null, scope = null, cancellable = false }) {
        Object.assign(this, { id: nextId++, kind, title, subject, file, scope, cancellable });
        this.steps = (STEP_SETS[kind] || [["run", title, []]]).map(([id, label, stages]) => ({ id, label, stages, status: "pending", detail: "", startedAt: 0, endedAt: 0 }));
        this.state = "running";
        this.message = "准备中…";
        this.lines = [];
        this.startedAt = Date.now();
        this.endedAt = 0;
        this.listeners = /* @__PURE__ */ new Set();
        this.cancelRequested = false;
        this.activate(this.steps[0].id);
      }
      on(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
      }
      emit() {
        for (const listener of this.listeners) try {
          listener(this);
        } catch (error) {
          console.error(error);
        }
      }
      get running() {
        return this.state === "running";
      }
      get elapsed() {
        return (this.endedAt || Date.now()) - this.startedAt;
      }
      get activeStep() {
        return this.steps.find((s) => s.status === "active");
      }
      get remedy() {
        return this.errorCode ? REMEDIES[this.errorCode] : null;
      }
      activate(id, detail = "") {
        const index = this.steps.findIndex((s) => s.id === id);
        if (index < 0) return;
        const now = Date.now();
        this.steps.forEach((step, i) => {
          if (i < index && step.status !== "done") {
            step.status = step.status === "pending" ? "skipped" : "done";
            step.endedAt ||= now;
          }
          if (i === index) {
            if (step.status !== "active") step.startedAt = now;
            step.status = "active";
            step.detail = detail;
          }
        });
      }
      log(line) {
        this.lines.push(line);
        if (this.lines.length > 2e3) this.lines.splice(0, this.lines.length - 2e3);
        this.emit();
      }
      // Maps a `@blog-progress` record from the scripts onto the visible steps.
      progress(record) {
        if (!this.running) return;
        const step = this.steps.find((s) => s.stages.includes(record.stage));
        if (step) {
          const detail = record.total ? `${record.current}/${record.total}` : "";
          this.activate(step.id, detail);
          step.fraction = record.total ? (record.current - 1) / record.total : null;
        }
        if (record.message && !["failed", "published", "pushed"].includes(record.stage)) this.message = record.message;
        if (record.stage === "pushing" || record.stage === "deploying") this.cancellable = false;
        if (record.stage === "pushed") this.partial = true;
        if (record.stage === "failed") {
          this.errorCode = record.code || this.errorCode;
          this.errorMessage = record.message;
        }
        this.emit();
      }
      finish(ok, { message, url, error, code } = {}) {
        if (!this.running) return;
        const now = Date.now();
        this.endedAt = now;
        if (this.cancelRequested && !ok) {
          this.state = "cancelled";
          code = "CANCELLED";
        } else this.state = ok ? "success" : "failed";
        for (const step of this.steps) {
          if (ok && (step.status === "active" || step.status === "pending")) {
            step.status = this.partial && step.id === "deploy" ? "skipped" : "done";
            step.endedAt ||= now;
          } else if (!ok && step.status === "active") {
            step.status = this.state === "cancelled" ? "skipped" : "failed";
            step.endedAt = now;
          }
        }
        this.message = message || (ok ? "完成" : this.state === "cancelled" ? "已取消" : "没有完成");
        this.url = url;
        if (!ok) {
          this.errorCode = code || this.errorCode || null;
          this.errorMessage = error || this.errorMessage || this.lines.filter((l) => /错误|失败|Error|✘/.test(l)).at(-1) || "查看日志了解原因";
        }
        this.emit();
      }
    };
    var formatDuration = (ms) => ms < 1e3 ? "<1 秒" : ms < 6e4 ? `${Math.round(ms / 1e3)} 秒` : `${Math.floor(ms / 6e4)} 分 ${Math.round(ms % 6e4 / 1e3)} 秒`;
    module2.exports = { Operation: Operation2, REMEDIES, formatDuration };
  }
});

// integrations/obsidian-blog-publisher/src/articles.js
var require_articles = __commonJS({
  "integrations/obsidian-blog-publisher/src/articles.js"(exports2, module2) {
    "use strict";
    var path2 = require("path");
    var fs2 = require("fs");
    var BLOG_DIR = "blog";
    var RESERVED = /* @__PURE__ */ new Set(["站点设置", "首页介绍", "关于", "使用说明", "站点管理使用说明"]);
    var SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    var isArticle2 = (file) => Boolean(file && file.extension === "md" && file.path.startsWith(`${BLOG_DIR}/`) && !file.path.startsWith(`${BLOG_DIR}/assets/`) && !RESERVED.has(file.basename));
    function frontmatter(app, file) {
      return app.metadataCache.getFileCache(file)?.frontmatter || {};
    }
    function articleInfo2(plugin, file) {
      const fm = frontmatter(plugin.app, file);
      const slug = typeof fm.slug === "string" ? fm.slug : "";
      const repo = plugin.config.repoPath;
      const published = Boolean(slug && repo && fs2.existsSync(path2.join(repo, "src/content/blog", `${slug}.md`)));
      const change = plugin.syncReport?.changes?.find((c) => c.id === `article:${slug}` || c.file === file.path);
      let status;
      if (change?.status === "conflict") status = { id: "conflict", label: "有冲突" };
      else if (change?.status === "remote") status = { id: "remote", label: "仓库有新版" };
      else if (!published) status = { id: "draft", label: "未发布" };
      else if (change?.status === "local") status = { id: "pending", label: "有修改未发布" };
      else status = { id: "published", label: "已发布" };
      return {
        file,
        slug,
        published,
        status,
        title: typeof fm.title === "string" && fm.title.trim() ? fm.title.trim() : file.basename,
        description: typeof fm.description === "string" ? fm.description : "",
        pubDate: fm.pubDate ? String(fm.pubDate) : "",
        tags: Array.isArray(fm.blogTags) ? fm.blogTags : Array.isArray(fm.tags) ? fm.tags : [],
        cover: typeof fm.heroImage === "string" ? fm.heroImage.trim() : "",
        url: plugin.siteUrl && slug ? new URL(`blog/${encodeURIComponent(slug)}/`, plugin.siteUrl).href : null
      };
    }
    function listArticles(plugin) {
      return plugin.app.vault.getMarkdownFiles().filter(isArticle2).map((f) => articleInfo2(plugin, f)).sort((a, b) => b.file.stat.mtime - a.file.stat.mtime);
    }
    function imageUrl(app, raw, sourcePath) {
      const target = String(raw || "").trim().replace(/^!?\[\[|\]\]$/g, "").split("|")[0];
      if (!target) return null;
      if (/^https?:\/\//i.test(target)) return target;
      const file = app.metadataCache.getFirstLinkpathDest(target, sourcePath) || app.vault.getAbstractFileByPath(target);
      return file && "extension" in file ? app.vault.getResourcePath(file) : null;
    }
    function checklist2(app, info) {
      const fm = frontmatter(app, info.file);
      const items = [];
      const add = (ok, label, detail, level = "error", field = null) => items.push({ ok, label, detail, level, field });
      add(typeof fm.title === "string" && fm.title.trim().length > 0, "标题", fm.title ? "" : "还没有标题", "error", "title");
      add(typeof fm.description === "string" && fm.description.trim().length > 0, "摘要", "显示在文章列表和分享卡片中", "error", "description");
      add(typeof fm.slug === "string" && SLUG.test(fm.slug), "网址", fm.slug ? SLUG.test(fm.slug) ? `/blog/${fm.slug}/` : "只能用小写字母、数字和短横线" : "还没有设置", "error", "slug");
      add(Boolean(fm.pubDate) && !Number.isNaN(Date.parse(String(fm.pubDate))), "发布日期", fm.pubDate ? String(fm.pubDate) : "还没有日期", "error", "pubDate");
      add(Boolean(info.cover), "封面", info.cover ? "" : "没有封面，将使用默认封面", "warn", "heroImage");
      const cache = app.metadataCache.getFileCache(info.file);
      const images = (cache?.embeds || []).filter((e) => /\.(png|jpe?g|webp|gif|avif|svg)$/i.test(e.link.split("|")[0]));
      const missing = images.filter((e) => !app.metadataCache.getFirstLinkpathDest(e.link.split("|")[0].split("#")[0], info.file.path));
      const noteLinks = (cache?.links || []).filter((l) => l.original.startsWith("[["));
      const noteEmbeds = (cache?.embeds || []).filter((e) => !images.includes(e));
      add(missing.length === 0, `图片 ${images.length} 张`, missing.length ? `找不到：${missing.map((m) => m.link).join("、")}` : "", "error");
      add(noteLinks.length === 0 && noteEmbeds.length === 0, "私人笔记链接", noteLinks.length + noteEmbeds.length ? `正文有 ${noteLinks.length + noteEmbeds.length} 处 [[双链]]，发布前需改成普通文字或公开链接` : "", "error");
      return items;
    }
    function suggestSlug(title, existing = /* @__PURE__ */ new Set()) {
      const ascii = title.normalize("NFKD").toLowerCase().replace(/[^a-z0-9\s-]/g, " ").trim().split(/[\s-]+/).filter(Boolean).slice(0, 8).join("-");
      const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(/* @__PURE__ */ new Date());
      let base = ascii.length >= 3 ? ascii : `post-${date}`;
      let slug = base, n = 2;
      while (existing.has(slug)) slug = `${base}-${n++}`;
      return slug;
    }
    function existingSlugs(plugin) {
      const slugs = new Set(listArticles(plugin).map((a) => a.slug).filter(Boolean));
      try {
        for (const name of fs2.readdirSync(path2.join(plugin.config.repoPath, "src/content/blog"))) slugs.add(name.replace(/\.mdx?$/, ""));
      } catch {
      }
      return slugs;
    }
    module2.exports = { BLOG_DIR, RESERVED, SLUG, isArticle: isArticle2, articleInfo: articleInfo2, listArticles, checklist: checklist2, imageUrl, suggestSlug, existingSlugs, frontmatter };
  }
});

// integrations/obsidian-blog-publisher/src/view.js
var require_view = __commonJS({
  "integrations/obsidian-blog-publisher/src/view.js"(exports2, module2) {
    "use strict";
    var { ItemView, setIcon, debounce } = require("obsidian");
    var { isArticle: isArticle2, articleInfo: articleInfo2, listArticles, checklist: checklist2, imageUrl } = require_articles();
    var { formatDuration } = require_operation();
    var VIEW_TYPE2 = "blog-publisher-panel";
    function button(parent, { text, icon, cls = "", onClick, disabled = false, tooltip }) {
      const b = parent.createEl("button", { cls: `blog-button ${cls}`.trim() });
      if (icon) setIcon(b.createSpan({ cls: "blog-button-icon" }), icon);
      if (text) b.createSpan({ text });
      if (tooltip) b.setAttribute("aria-label", tooltip);
      b.disabled = disabled;
      b.addEventListener("click", (event) => {
        event.preventDefault();
        if (!b.disabled) onClick(event);
      });
      return b;
    }
    var relative = (time) => {
      if (!time) return "";
      const diff = Date.now() - new Date(time).getTime();
      if (diff < 6e4) return "刚刚";
      if (diff < 36e5) return `${Math.floor(diff / 6e4)} 分钟前`;
      if (diff < 864e5) return `${Math.floor(diff / 36e5)} 小时前`;
      return new Date(time).toLocaleDateString();
    };
    var BlogView2 = class extends ItemView {
      constructor(leaf, plugin) {
        super(leaf);
        this.plugin = plugin;
        this.filter = "";
        this.listLimit = 30;
        this.requestRender = debounce(() => this.render(), 150, true);
      }
      getViewType() {
        return VIEW_TYPE2;
      }
      getDisplayText() {
        return "博客";
      }
      getIcon() {
        return "notebook-pen";
      }
      async onOpen() {
        this.containerEl.children[1].addClass("blog-panel");
        this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.requestRender()));
        this.registerEvent(this.app.workspace.on("file-open", () => this.requestRender()));
        this.registerEvent(this.app.metadataCache.on("changed", (file) => {
          if (isArticle2(file)) this.requestRender();
        }));
        this.registerEvent(this.app.vault.on("rename", () => this.requestRender()));
        this.registerEvent(this.app.vault.on("delete", () => this.requestRender()));
        this.registerInterval(window.setInterval(() => this.tick(), 1e3));
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
        const scroll = root.querySelector(".blog-list")?.scrollTop;
        root.empty();
        this.drawHeader(root);
        const problems = this.plugin.runner.diagnose();
        if (problems.length) {
          this.drawSetup(root, problems);
          return;
        }
        this.drawSync(root);
        this.opEl = root.createDiv({ cls: "blog-op-container" });
        this.drawOperation(this.opEl);
        this.drawCurrent(root);
        this.drawList(root);
        const list = root.querySelector(".blog-list");
        if (list && scroll) list.scrollTop = scroll;
      }
      drawHeader(root) {
        const header = root.createDiv({ cls: "blog-panel-header" });
        const title = header.createDiv({ cls: "blog-panel-title" });
        title.createSpan({ text: this.plugin.siteTitle || "博客" });
        if (this.plugin.siteUrl) {
          const link = title.createEl("a", { cls: "blog-site-link", text: new URL(this.plugin.siteUrl).host, href: this.plugin.siteUrl });
          link.setAttribute("aria-label", "打开网站");
        }
        const tools = header.createDiv({ cls: "blog-panel-tools" });
        button(tools, { icon: "plus", tooltip: "新建文章", cls: "clickable-icon", onClick: () => this.plugin.newPost() });
        button(tools, { icon: "settings", tooltip: "站点设置", cls: "clickable-icon", onClick: () => this.plugin.openSettings() });
      }
      drawSetup(root, problems) {
        const card = root.createDiv({ cls: "blog-card blog-card-warn" });
        card.createEl("strong", { text: "还差一步就能使用" });
        const list = card.createEl("ul");
        for (const p of problems) list.createEl("li", { text: p });
        button(card, { text: "打开连接设置", cls: "mod-cta", onClick: () => this.plugin.openSettings("connection") });
      }
      drawSync(root) {
        const p = this.plugin, report = p.syncReport, c = report?.counts || {};
        const bar = root.createDiv({ cls: "blog-sync" });
        let tone = "ok", text = "与 GitHub 同步", action = null;
        if (p.checking) {
          tone = "busy";
          text = "正在检查…";
        } else if (p.syncError) {
          tone = "warn";
          text = "检查没有完成";
        } else if (!report) {
          tone = "muted";
          text = "尚未检查";
        } else if (report.dirty) {
          tone = "warn";
          text = "仓库有未提交的改动";
          action = ["打开仓库", () => p.openRepo()];
        } else if (report.branch && report.branch !== "main") {
          tone = "warn";
          text = `仓库在 ${report.branch} 分支`;
        } else if (c.conflict) {
          tone = "warn";
          text = `${c.conflict} 项冲突`;
          action = ["处理", () => p.syncChanges()];
        } else if (c.remote || report.behind) {
          tone = "info";
          text = "仓库有新内容";
          action = ["同步", () => p.syncChanges()];
        } else if (c.local) {
          tone = "info";
          text = `${c.local} 项修改待发布`;
        }
        bar.addClass(`is-${tone}`);
        bar.createSpan({ cls: "blog-dot" });
        const label = bar.createDiv({ cls: "blog-sync-label" });
        label.createSpan({ text });
        const checked = report?.remoteCheckedAt || report?.checkedAt;
        if (checked && !p.checking) label.createEl("small", { text: `检查于 ${relative(checked)}` });
        if (p.syncError) bar.setAttribute("aria-label", p.syncError);
        if (action) button(bar, { text: action[0], cls: "blog-link-button", disabled: p.busy, onClick: action[1] });
        button(bar, { icon: "refresh-cw", cls: "clickable-icon", tooltip: "检查 GitHub 更新", disabled: p.busy || p.checking, onClick: () => p.refreshSync(true) });
      }
      drawOperation(container) {
        container.empty();
        this.elapsedEl = null;
        const op = this.plugin.operation;
        if (!op || op.dismissed) return;
        const card = container.createDiv({ cls: `blog-card blog-op is-${op.state}` });
        const head = card.createDiv({ cls: "blog-op-head" });
        const icon = head.createSpan({ cls: "blog-op-icon" });
        setIcon(icon, { running: "loader", success: "check-circle-2", failed: "alert-circle", cancelled: "circle-slash" }[op.state]);
        const titles = head.createDiv({ cls: "blog-op-titles" });
        titles.createEl("strong", { text: op.title });
        if (op.subject) titles.createEl("small", { text: op.subject });
        this.elapsedEl = head.createEl("small", { cls: "blog-op-time", text: formatDuration(op.elapsed) });
        if (!op.running) button(head, { icon: "x", cls: "clickable-icon", tooltip: "关闭", onClick: () => {
          op.dismissed = true;
          this.drawOperation(container);
        } });
        if (op.steps.length > 1 || op.running) {
          const steps = card.createEl("ol", { cls: "blog-steps" });
          for (const step of op.steps) {
            const li = steps.createEl("li", { cls: `is-${step.status}` });
            const marker = li.createSpan({ cls: "blog-step-marker" });
            if (step.status === "done") setIcon(marker, "check");
            else if (step.status === "failed") setIcon(marker, "x");
            else if (step.status === "skipped") setIcon(marker, "minus");
            li.createSpan({ cls: "blog-step-label", text: step.label });
            const meta = li.createSpan({ cls: "blog-step-meta" });
            if (step.status === "active" && step.detail) meta.setText(step.detail);
            else if (step.status === "done" && step.endedAt && step.startedAt) meta.setText(formatDuration(step.endedAt - step.startedAt));
            if (step.status === "active" && step.fraction != null) li.createDiv({ cls: "blog-progress" }).createDiv({ attr: { style: `width:${Math.max(4, step.fraction * 100)}%` } });
          }
        }
        if (op.running) {
          card.createDiv({ cls: "blog-op-message", text: op.message });
          const actions = card.createDiv({ cls: "blog-actions" });
          if (op.cancellable) button(actions, { text: op.cancelRequested ? "正在取消…" : "取消", disabled: op.cancelRequested, onClick: () => this.plugin.cancelOperation() });
        } else if (op.state === "success") {
          card.createDiv({ cls: "blog-op-message", text: op.message });
          const actions = card.createDiv({ cls: "blog-actions" });
          if (op.followUp) button(actions, { text: op.followUp[0], cls: "mod-cta", onClick: () => this.plugin.remedy("followUp", op) });
          if (op.url) button(actions, { text: op.kind === "preview" ? "打开预览" : op.file ? "查看文章" : "打开网站", icon: "external-link", cls: op.followUp ? "" : "mod-cta", onClick: () => window.open(op.url) });
        } else {
          const box = card.createDiv({ cls: "blog-op-error" });
          box.createDiv({ cls: "blog-op-error-message", text: op.errorMessage || op.message });
          if (op.remedy?.hint) box.createDiv({ cls: "blog-op-hint", text: op.remedy.hint });
          if (op.errorCode === "NETWORK") box.createDiv({ cls: "blog-op-hint", text: `当前网络：${this.plugin.runner.describeNetwork()}` });
          const actions = card.createDiv({ cls: "blog-actions" });
          const remedies = op.remedy?.actions || [["retry", "重试", true]];
          for (const [id, label, primary] of remedies) button(actions, { text: label, cls: primary ? "mod-cta" : "", onClick: () => this.plugin.remedy(id, op) });
        }
        if (op.lines.length) {
          const details = card.createEl("details", { cls: "blog-log" });
          details.open = Boolean(op.showLog);
          details.addEventListener("toggle", () => {
            op.showLog = details.open;
          });
          const summary = details.createEl("summary");
          summary.createSpan({ text: "日志" });
          button(summary, { icon: "copy", cls: "clickable-icon", tooltip: "复制日志", onClick: () => {
            navigator.clipboard.writeText(op.lines.join("\n"));
            this.plugin.notice("日志已复制");
          } });
          const pre = details.createEl("pre", { text: op.lines.slice(-300).join("\n") });
          if (details.open) requestAnimationFrame(() => pre.scrollTop = pre.scrollHeight);
        }
      }
      drawCurrent(root) {
        const file = this.app.workspace.getActiveFile();
        if (!isArticle2(file)) {
          const empty = root.createDiv({ cls: "blog-card blog-current-empty" });
          empty.createDiv({ text: "打开 blog 文件夹中的一篇文章，即可在这里预览和发布。", cls: "blog-muted" });
          button(empty, { text: "写一篇新文章", icon: "plus", onClick: () => this.plugin.newPost() });
          return;
        }
        const info = articleInfo2(this.plugin, file);
        const card = root.createDiv({ cls: "blog-card blog-current" });
        const cover = imageUrl(this.app, info.cover, file.path);
        if (cover) {
          const figure = card.createDiv({ cls: "blog-cover" });
          figure.createEl("img", { attr: { src: cover, alt: "封面" } });
          button(figure, { icon: "image", cls: "blog-cover-change", tooltip: "更换封面", onClick: () => this.plugin.chooseCover(file) });
        }
        const head = card.createDiv({ cls: "blog-current-head" });
        head.createEl("h3", { text: info.title });
        head.createSpan({ cls: `blog-badge is-${info.status.id}`, text: info.status.label });
        if (info.description) card.createEl("p", { cls: "blog-current-desc", text: info.description });
        if (info.url && info.published) {
          const link = card.createEl("a", { cls: "blog-current-url", text: `/blog/${info.slug}/`, href: info.url });
          setIcon(link.createSpan(), "arrow-up-right");
        }
        const items = checklist2(this.app, info);
        const blocking = items.filter((i) => !i.ok && i.level === "error");
        const checks = card.createDiv({ cls: "blog-checklist" });
        for (const item of items) {
          const row = checks.createDiv({ cls: `blog-check ${item.ok ? "is-ok" : `is-${item.level}`}` });
          setIcon(row.createSpan({ cls: "blog-check-icon" }), item.ok ? "check" : item.level === "error" ? "circle-alert" : "info");
          row.createSpan({ cls: "blog-check-label", text: item.label });
          if (!item.ok && item.detail) row.createSpan({ cls: "blog-check-detail", text: item.detail });
          if (!item.ok && item.field) {
            row.addClass("is-clickable");
            row.addEventListener("click", () => item.field === "heroImage" ? this.plugin.chooseCover(file) : this.plugin.editProperties(file, item.field));
          }
        }
        const busy = this.plugin.busy;
        const actions = card.createDiv({ cls: "blog-actions blog-current-actions" });
        button(actions, { text: "属性", icon: "pencil", onClick: () => this.plugin.editProperties(file) });
        button(actions, { text: "预览", icon: "eye", disabled: busy, onClick: () => this.plugin.preview(file) });
        const publishLabel = info.published ? info.status.id === "published" ? "重新发布" : "发布更新" : "发布";
        button(actions, { text: publishLabel, icon: "send", cls: "mod-cta", disabled: busy || blocking.length > 0, tooltip: blocking.length ? `先补全：${blocking.map((b) => b.label).join("、")}` : void 0, onClick: () => this.plugin.publish(file) });
      }
      drawList(root) {
        const section = root.createDiv({ cls: "blog-list-section" });
        const head = section.createDiv({ cls: "blog-list-head" });
        const articles = listArticles(this.plugin);
        head.createEl("h4", { text: `全部文章 · ${articles.length}` });
        const search = head.createEl("input", { type: "search", placeholder: "搜索", value: this.filter, cls: "blog-search" });
        const list = section.createDiv({ cls: "blog-list" });
        const active = this.app.workspace.getActiveFile();
        const draw = () => {
          list.empty();
          const q = this.filter.trim().toLowerCase();
          const shown = q ? articles.filter((a) => `${a.title} ${a.slug} ${a.tags.join(" ")}`.toLowerCase().includes(q)) : articles;
          if (!shown.length) list.createDiv({ cls: "blog-muted blog-list-empty", text: q ? "没有匹配的文章" : "还没有文章" });
          for (const a of shown.slice(0, this.listLimit)) {
            const row = list.createDiv({ cls: `blog-row${a.file === active ? " is-active" : ""}` });
            row.createDiv({ cls: "blog-row-title", text: a.title });
            const meta = row.createDiv({ cls: "blog-row-meta" });
            meta.createSpan({ cls: `blog-badge is-${a.status.id}`, text: a.status.label });
            if (a.pubDate) meta.createSpan({ text: a.pubDate.slice(0, 10) });
            row.addEventListener("click", (event) => this.app.workspace.getLeaf(event.metaKey || event.ctrlKey).openFile(a.file));
          }
          if (shown.length > this.listLimit) button(list, { text: `显示更多（还有 ${shown.length - this.listLimit} 篇）`, cls: "blog-link-button", onClick: () => {
            this.listLimit += 50;
            draw();
          } });
        };
        search.addEventListener("input", () => {
          this.filter = search.value;
          draw();
        });
        draw();
      }
    };
    module2.exports = { BlogView: BlogView2, VIEW_TYPE: VIEW_TYPE2 };
  }
});

// integrations/obsidian-blog-publisher/src/modals.js
var require_modals = __commonJS({
  "integrations/obsidian-blog-publisher/src/modals.js"(exports2, module2) {
    "use strict";
    var { Modal, Notice: Notice2, Setting, FuzzySuggestModal, setIcon } = require("obsidian");
    var { SLUG, suggestSlug, existingSlugs, frontmatter, imageUrl, BLOG_DIR } = require_articles();
    var today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(/* @__PURE__ */ new Date());
    var bytes = (n) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
    function fieldHint(setting, text, error = false) {
      setting.descEl.empty();
      setting.descEl.setText(text);
      setting.settingEl.toggleClass("blog-field-error", error);
    }
    var NewPostModal2 = class extends Modal {
      constructor(plugin) {
        super(plugin.app);
        this.plugin = plugin;
        this.values = { title: "", slug: "", description: "" };
        this.slugTouched = false;
      }
      onOpen() {
        this.modalEl.addClass("blog-modal");
        this.titleEl.setText("新建文章");
        const taken = existingSlugs(this.plugin);
        const { contentEl } = this;
        let slugSetting, slugInput, createButton;
        const validate = () => {
          const { slug, title } = this.values;
          let error = "";
          if (!SLUG.test(slug)) error = "只能用小写字母、数字和短横线，例如 agent-notes";
          else if (taken.has(slug)) error = "这个网址已经被另一篇文章使用";
          fieldHint(slugSetting, error || `发布后的网址：/blog/${slug}/ （发布后不建议再改）`, Boolean(error));
          createButton?.setDisabled(Boolean(error) || !title.trim());
          return !error && title.trim();
        };
        new Setting(contentEl).setName("标题").addText((t) => {
          t.setPlaceholder("这篇文章叫什么？").onChange((v) => {
            this.values.title = v;
            if (!this.slugTouched) {
              this.values.slug = suggestSlug(v, taken);
              slugInput.setValue(this.values.slug);
            }
            validate();
          });
          t.inputEl.addClass("blog-input-wide");
          setTimeout(() => t.inputEl.focus(), 0);
        });
        slugSetting = new Setting(contentEl).setName("网址").addText((t) => {
          slugInput = t;
          t.setPlaceholder("my-first-post").onChange((v) => {
            this.slugTouched = true;
            this.values.slug = v.trim();
            validate();
          });
        });
        new Setting(contentEl).setName("摘要").setDesc("一两句话，显示在文章列表中。也可以写完再补。").addTextArea((t) => {
          t.setPlaceholder("这篇文章讲了什么").onChange((v) => this.values.description = v);
          t.inputEl.rows = 3;
          t.inputEl.addClass("blog-input-wide");
        });
        new Setting(contentEl).addButton((b) => b.setButtonText("取消").onClick(() => this.close())).addButton((b) => {
          createButton = b;
          b.setButtonText("创建草稿").setCta().setDisabled(true).onClick(() => this.create());
        });
        this.values.slug = suggestSlug("", taken);
        slugInput.setValue(this.values.slug);
        validate();
        this.scope.register(["Mod"], "Enter", () => {
          if (validate()) this.create();
          return false;
        });
      }
      async create() {
        const { title, slug, description } = this.values;
        const { vault } = this.app;
        if (!vault.getAbstractFileByPath(BLOG_DIR)) await vault.createFolder(BLOG_DIR);
        const filePath = `${BLOG_DIR}/${title.trim().replace(/[\\/:*?"<>|#^[\]]/g, " ").trim() || slug}.md`;
        if (vault.getAbstractFileByPath(filePath)) return new Notice2("已有同名笔记，请换一个标题");
        const file = await vault.create(filePath, `---
title: ${JSON.stringify(title.trim())}
slug: ${slug}
description: ${JSON.stringify(description.trim())}
pubDate: ${today()}
blogTags: []
heroImage: ""
draft: true
---

`);
        this.close();
        await this.app.workspace.getLeaf(false).openFile(file);
        this.plugin.revealView();
      }
      onClose() {
        this.contentEl.empty();
      }
    };
    var PropertiesModal2 = class extends Modal {
      constructor(plugin, file, { focus, onSaved } = {}) {
        super(plugin.app);
        Object.assign(this, { plugin, file, focus, onSaved });
      }
      onOpen() {
        this.modalEl.addClass("blog-modal");
        this.titleEl.setText("文章属性");
        const fm = frontmatter(this.app, this.file);
        const values = {
          title: fm.title || "",
          description: fm.description || "",
          slug: fm.slug || "",
          pubDate: fm.pubDate ? String(fm.pubDate).slice(0, 10) : today(),
          tags: (Array.isArray(fm.blogTags) ? fm.blogTags : Array.isArray(fm.tags) ? fm.tags : []).join(", "),
          heroImage: fm.heroImage || ""
        };
        const published = this.plugin.isPublished(fm.slug);
        const taken = existingSlugs(this.plugin);
        taken.delete(fm.slug);
        const { contentEl } = this;
        const inputs = {};
        let saveButton, slugSetting;
        const valid = () => {
          let error = "";
          if (!SLUG.test(values.slug)) error = "只能用小写字母、数字和短横线";
          else if (taken.has(values.slug)) error = "这个网址已经被另一篇文章使用";
          fieldHint(slugSetting, error || (published ? "已发布的文章改网址会让旧链接失效" : `/blog/${values.slug}/`), Boolean(error));
          const ok = !error && values.title.trim() && values.description.trim() && !Number.isNaN(Date.parse(values.pubDate));
          saveButton?.setDisabled(!ok);
          return ok;
        };
        new Setting(contentEl).setName("标题").addText((t) => {
          inputs.title = t.inputEl;
          t.setValue(values.title).onChange((v) => {
            values.title = v;
            valid();
          });
          t.inputEl.addClass("blog-input-wide");
        });
        new Setting(contentEl).setName("摘要").setDesc("显示在文章列表、RSS 和分享卡片中").addTextArea((t) => {
          inputs.description = t.inputEl;
          t.setValue(values.description).onChange((v) => {
            values.description = v;
            valid();
          });
          t.inputEl.rows = 3;
          t.inputEl.addClass("blog-input-wide");
        });
        slugSetting = new Setting(contentEl).setName("网址").addText((t) => {
          inputs.slug = t.inputEl;
          t.setValue(values.slug).onChange((v) => {
            values.slug = v.trim();
            valid();
          });
        });
        if (!values.slug) slugSetting.addExtraButton((b) => b.setIcon("wand-2").setTooltip("根据标题生成").onClick(() => {
          values.slug = suggestSlug(values.title, taken);
          inputs.slug.value = values.slug;
          valid();
        }));
        new Setting(contentEl).setName("发布日期").addText((t) => {
          inputs.pubDate = t.inputEl;
          t.inputEl.type = "date";
          t.setValue(values.pubDate).onChange((v) => {
            values.pubDate = v;
            valid();
          });
        });
        new Setting(contentEl).setName("标签").setDesc("用逗号分隔").addText((t) => {
          inputs.tags = t.inputEl;
          t.setValue(values.tags).onChange((v) => values.tags = v);
          t.inputEl.addClass("blog-input-wide");
        });
        const cover = new Setting(contentEl).setName("封面");
        const preview = contentEl.createDiv({ cls: "blog-cover-field" });
        const showCover = () => {
          preview.empty();
          const url = imageUrl(this.app, values.heroImage, this.file.path);
          if (url) preview.createEl("img", { attr: { src: url, alt: "封面预览" } });
          cover.setDesc(values.heroImage ? values.heroImage : "没有封面时使用站点默认封面");
        };
        cover.addButton((b) => b.setButtonText(values.heroImage ? "更换" : "选择图片").onClick(() => new ImagePicker2(this.plugin, (image) => {
          values.heroImage = image.path;
          showCover();
        }).open()));
        cover.addExtraButton((b) => b.setIcon("x").setTooltip("移除封面").onClick(() => {
          values.heroImage = "";
          showCover();
        }));
        showCover();
        new Setting(contentEl).addButton((b) => b.setButtonText("取消").onClick(() => this.close())).addButton((b) => {
          saveButton = b;
          b.setButtonText("保存").setCta().onClick(async () => {
            if (!valid()) return;
            await this.app.fileManager.processFrontMatter(this.file, (data) => {
              data.title = values.title.trim();
              data.description = values.description.trim();
              data.slug = values.slug;
              data.pubDate = values.pubDate;
              data.blogTags = values.tags.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
              data.heroImage = values.heroImage;
            });
            this.close();
            new Notice2("文章属性已保存");
            this.onSaved?.();
          });
        });
        valid();
        const target = inputs[this.focus === "heroImage" ? "title" : this.focus] || inputs.title;
        setTimeout(() => target?.focus(), 0);
      }
      onClose() {
        this.contentEl.empty();
      }
    };
    var ConfirmModal2 = class extends Modal {
      constructor(app, { title, lines, confirm, danger = false, onConfirm, remember }) {
        super(app);
        Object.assign(this, { heading: title, lines, confirmText: confirm, danger, onConfirm, remember });
      }
      onOpen() {
        this.modalEl.addClass("blog-modal");
        this.titleEl.setText(this.heading);
        const list = this.contentEl.createEl("ul", { cls: "blog-confirm-list" });
        for (const [icon, text] of this.lines) {
          const li = list.createEl("li");
          setIcon(li.createSpan({ cls: "blog-confirm-icon" }), icon);
          li.createSpan({ text });
        }
        let skip = false;
        if (this.remember) new Setting(this.contentEl).setName("以后发布不再询问").setDesc("可以在设置中重新打开").addToggle((t) => t.onChange((v) => skip = v));
        new Setting(this.contentEl).addButton((b) => b.setButtonText("取消").onClick(() => this.close())).addButton((b) => {
          b.setButtonText(this.confirmText);
          if (this.danger) b.setWarning();
          else b.setCta();
          b.onClick(() => {
            this.close();
            if (skip) this.remember();
            this.onConfirm();
          });
          setTimeout(() => b.buttonEl.focus(), 0);
        });
      }
      onClose() {
        this.contentEl.empty();
      }
    };
    var ImagePicker2 = class extends FuzzySuggestModal {
      constructor(plugin, choose) {
        super(plugin.app);
        Object.assign(this, { plugin, choose });
        this.setPlaceholder("搜索知识库中的图片");
        this.modalEl.addClass("blog-image-picker");
      }
      getItems() {
        return this.app.vault.getFiles().filter((f) => /^(png|jpe?g|webp|gif|avif|svg)$/i.test(f.extension)).sort((a, b) => b.stat.mtime - a.stat.mtime);
      }
      getItemText(file) {
        return file.path;
      }
      renderSuggestion(match, el) {
        const file = match.item;
        el.addClass("blog-image-option");
        el.createEl("img", { attr: { src: this.app.vault.getResourcePath(file), alt: "", loading: "lazy" } });
        const text = el.createDiv();
        text.createDiv({ text: file.name });
        text.createEl("small", { text: `${file.parent?.path || "/"} · ${bytes(file.stat.size)}` });
      }
      onChooseItem(file) {
        new ImageDetails(this.plugin, file, this.choose).open();
      }
    };
    var ImageDetails = class extends Modal {
      constructor(plugin, file, choose) {
        super(plugin.app);
        Object.assign(this, { plugin, file, choose });
      }
      async onOpen() {
        this.modalEl.addClass("blog-modal");
        this.titleEl.setText(this.file.name);
        this.contentEl.createEl("img", { cls: "blog-image-detail", attr: { src: this.app.vault.getResourcePath(this.file), alt: this.file.name } });
        const info = this.contentEl.createEl("p", { cls: "blog-muted", text: "正在读取尺寸…" });
        new Setting(this.contentEl).addButton((b) => b.setButtonText("取消").onClick(() => this.close())).addButton((b) => b.setButtonText("使用这张图").setCta().onClick(() => {
          this.close();
          this.choose(this.file);
        }));
        try {
          const v = await this.plugin.runner.rpc("image-info", this.file.path, { timeout: 3e4 });
          const saved = v.optimizedBytes < v.originalBytes ? `，发布时压缩到 ${bytes(v.optimizedBytes)}（-${Math.round((1 - v.optimizedBytes / v.originalBytes) * 100)}%）` : "";
          info.setText(`${v.width || "?"} × ${v.height || "?"} · ${bytes(v.originalBytes)}${saved}${v.animated ? " · 动图保持原样" : ""}`);
        } catch {
          info.setText(bytes(this.file.stat.size));
        }
      }
      onClose() {
        this.contentEl.empty();
      }
    };
    function excerpt(local, repo) {
      const a = local.split("\n"), b = repo.split("\n");
      let start = 0, end = 0;
      while (start < Math.min(a.length, b.length) && a[start] === b[start]) start++;
      while (end < Math.min(a.length, b.length) - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
      const slice = (lines) => lines.slice(Math.max(0, start - 3), Math.min(lines.length, lines.length - end + 3)).join("\n");
      return [slice(a), slice(b)];
    }
    var ConflictsModal2 = class extends Modal {
      constructor(plugin, report) {
        super(plugin.app);
        Object.assign(this, { plugin, report, choices: {} });
      }
      onOpen() {
        this.modalEl.addClass("blog-modal", "blog-conflicts");
        this.titleEl.setText(`处理 ${this.report.conflicts.length} 项差异`);
        this.contentEl.createEl("p", { cls: "blog-muted", text: "本地和仓库都改过这些内容。逐项选择保留哪一边，应用前会自动备份。" });
        let apply;
        const refresh = () => apply.setDisabled(this.report.conflicts.some((c) => !this.choices[c.id]));
        for (const item of this.report.conflicts) {
          const card = this.contentEl.createDiv({ cls: "blog-conflict" });
          card.createEl("h4", { text: item.label });
          card.createEl("p", { cls: "blog-muted", text: item.reason });
          const show = (v) => v == null ? "（已删除）" : typeof v === "string" ? v : JSON.stringify(v, null, 2);
          const local = show(item.local), repo = show(item.repo), [a, b] = excerpt(local, repo);
          const columns = card.createDiv({ cls: "blog-diff-columns" });
          const options = [["local", "Obsidian 本地", a, local, item.local === null ? "保留本地的删除" : "保留本地版本"], ["repo", "仓库版本", b, repo, item.repo === null ? "接受仓库的删除" : "使用仓库版本"]];
          const buttons = [];
          for (const [choice, label, snippet, full, action] of options) {
            const col = columns.createDiv({ cls: "blog-diff-column" });
            col.createEl("strong", { text: label });
            col.createEl("pre", { text: snippet || "（空）" });
            const more = col.createEl("details");
            more.createEl("summary", { text: "完整内容" });
            more.createEl("pre", { text: full });
            const button = col.createEl("button", { text: action });
            buttons.push([button, choice, col]);
            button.addEventListener("click", () => {
              this.choices[item.id] = choice;
              for (const [b2, c, column] of buttons) {
                b2.toggleClass("mod-cta", c === choice);
                column.toggleClass("is-chosen", c === choice);
              }
              refresh();
            });
          }
        }
        new Setting(this.contentEl).addButton((b) => b.setButtonText("稍后处理").onClick(() => this.close())).addButton((b) => {
          apply = b;
          b.setButtonText("备份并应用").setCta().setDisabled(true).onClick(() => {
            this.close();
            this.plugin.syncChanges({ token: this.report.token, choices: this.choices });
          });
        });
      }
      onClose() {
        this.contentEl.empty();
      }
    };
    module2.exports = { NewPostModal: NewPostModal2, PropertiesModal: PropertiesModal2, ConfirmModal: ConfirmModal2, ImagePicker: ImagePicker2, ConflictsModal: ConflictsModal2, bytes };
  }
});

// integrations/obsidian-blog-publisher/src/settings.js
var require_settings = __commonJS({
  "integrations/obsidian-blog-publisher/src/settings.js"(exports2, module2) {
    "use strict";
    var { PluginSettingTab, Setting, Notice: Notice2, MarkdownRenderer, Component, setIcon } = require("obsidian");
    var path2 = require("path");
    var fs2 = require("fs");
    var { ImagePicker: ImagePicker2 } = require_modals();
    var { imageUrl } = require_articles();
    var SECTIONS = [
      ["site", "站点信息", "globe"],
      ["pages", "页面内容", "file-text"],
      ["images", "图片与图床", "image"],
      ["appearance", "导航与外观", "palette"],
      ["comments", "评论", "message-square"],
      ["connection", "连接与发布", "plug"]
    ];
    var GROUPS = {
      site: [["站点信息", ["title", "description", "author", "url", "language"]]],
      appearance: [
        ["导航与联系方式", ["navigation", "socialLinks"]],
        ["外观", ["accentLight", "accentDark", "contentWidth", "fontSize"]],
        ["文章显示", ["showDates", "showTags", "showListCovers", "showArticleCover"]],
        ["页脚", ["footerText", "copyrightStartYear", "showRss", "showPoweredBy"]]
      ],
      comments: [["Giscus 评论", ["commentsEnabled", "giscusRepo", "giscusRepoId", "giscusCategoryId"]]],
      images: [["站点图片", ["homeCover", "avatar", "defaultCover", "favicon"]]]
    };
    var PAGE_GROUPS = {
      home: [["首页", ["homeHeading"]], ["__home"], ["首页文章列表", ["latestHeading", "latestCount", "allPostsText"]]],
      about: [["关于页", ["aboutHeading", "aboutDescription"]], ["__about"]],
      list: [["文章列表页", ["blogHeading", "blogDescription"]]]
    };
    var BlogSettingTab2 = class extends PluginSettingTab {
      constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
        this.section = "site";
        this.page = "home";
        this.previews = [];
      }
      open(section) {
        if (section) this.section = section;
      }
      display() {
        this.cleanup();
        const el = this.containerEl;
        el.empty();
        el.addClass("blog-settings");
        const top = el.createDiv({ cls: "blog-settings-top" });
        const nav = top.createDiv({ cls: "blog-settings-nav" });
        for (const [id, label, icon] of SECTIONS) {
          const b = nav.createEl("button", { cls: this.section === id ? "is-active" : "" });
          setIcon(b.createSpan(), icon);
          b.createSpan({ text: label });
          b.addEventListener("click", () => {
            this.section = id;
            this.display();
          });
        }
        if (this.section !== "connection") this.drawSiteBar(top);
        const body = el.createDiv({ cls: "blog-settings-body" });
        if (this.section === "connection") return this.drawConnection(body);
        let draft;
        try {
          draft = this.plugin.loadSite();
        } catch (error) {
          body.createDiv({ cls: "blog-card blog-card-warn", text: error.message });
          return;
        }
        if (this.section === "pages") {
          const tabs = body.createDiv({ cls: "blog-segmented" });
          for (const [id, label] of [["home", "首页"], ["about", "关于页"], ["list", "文章列表页"]]) {
            const b = tabs.createEl("button", { text: label, cls: this.page === id ? "is-active" : "" });
            b.addEventListener("click", () => {
              this.page = id;
              this.display();
            });
          }
          for (const [title, keys] of PAGE_GROUPS[this.page]) {
            if (title === "__home") this.pageEditor(body, "首页介绍", "home", draft);
            else if (title === "__about") this.pageEditor(body, "关于页正文", "about", draft);
            else this.group(body, title, keys, draft);
          }
        } else {
          for (const [title, keys] of GROUPS[this.section]) this.group(body, title, keys, draft);
          if (this.section === "comments") body.createEl("p", { cls: "blog-muted", text: "评论由 Giscus 提供，访客使用 GitHub 账号登录留言。" });
          if (this.section === "images") this.drawMedia(body);
        }
        if (this.focusField) {
          const input = this.inputs?.get(this.focusField);
          input?.scrollIntoView({ block: "center" });
          input?.focus?.({ preventScroll: true });
          this.focusField = null;
        }
      }
      drawSiteBar(top) {
        const bar = top.createDiv({ cls: "blog-site-bar" });
        this.statusEl = bar.createDiv({ cls: "blog-site-status" });
        this.updateSiteStatus();
        const actions = bar.createDiv({ cls: "blog-actions" });
        const busy = this.plugin.busy;
        this.siteButtons = [
          actions.createEl("button", { text: "预览站点" }),
          actions.createEl("button", { text: "发布站点设置", cls: "mod-cta" })
        ];
        this.siteButtons[0].addEventListener("click", () => this.plugin.siteAction("preview"));
        this.siteButtons[1].addEventListener("click", () => this.plugin.siteAction("publish"));
        for (const b of this.siteButtons) b.disabled = busy;
      }
      updateSiteStatus(message) {
        if (!this.statusEl) return;
        const p = this.plugin;
        const pending = p.pendingSite || p.syncReport?.changes?.some((c) => c.id.startsWith("site") || c.id.startsWith("page"));
        this.statusEl.empty();
        this.statusEl.toggleClass("is-error", Boolean(p.siteSaveError));
        this.statusEl.setText(message || (p.siteSaveError ? "保存失败，请检查输入" : pending ? "修改已自动保存 · 发布后上线" : "与线上一致"));
        for (const b of this.siteButtons || []) b.disabled = p.busy;
      }
      changed() {
        try {
          this.plugin.saveSite();
          this.plugin.siteSaveError = false;
          this.plugin.pendingSite = true;
          this.updateSiteStatus();
          this.plugin.scheduleStatus();
        } catch (error) {
          this.plugin.siteSaveError = true;
          this.updateSiteStatus(`保存失败：${error.message}`);
        }
      }
      group(body, title, keys, draft) {
        body.createEl("h3", { text: title, cls: "blog-settings-group" });
        for (const key of keys) {
          const field = this.plugin.fields.find((f) => f.key === key);
          if (field) this.field(body, field, draft);
        }
      }
      field(el, f, draft) {
        this.inputs ??= /* @__PURE__ */ new Map();
        const setting = new Setting(el).setName(f.label);
        const value = draft.values[f.label] ?? f.default;
        const update = (v) => {
          draft.values[f.label] = v;
          this.changed();
        };
        this.inputs.set(f.label, setting.settingEl);
        if (f.type === "boolean") {
          setting.addToggle((t) => t.setValue(Boolean(value)).onChange(update));
          return;
        }
        if (f.type === "color") {
          setting.addColorPicker((c) => c.setValue(String(value)).onChange(update));
          return;
        }
        if (f.type === "links") {
          setting.setDesc("每行一项：名称 | 地址").addTextArea((t) => {
            t.setValue((value || []).map((v) => typeof v === "string" ? v : `${v.label} | ${v.href}`).join("\n")).onChange((v) => update(v.split("\n").filter((l) => l.trim())));
            t.inputEl.rows = 4;
            t.inputEl.addClass("blog-input-wide");
          });
          return;
        }
        if (f.type === "number") setting.setDesc(`${f.min ?? ""}–${f.max ?? ""}`);
        let preview;
        const showImage = (v) => {
          if (!preview) return;
          preview.empty();
          const url = imageUrl(this.app, v, "blog/首页介绍.md");
          if (url) preview.createEl("img", { attr: { src: url, alt: f.label } });
        };
        setting.addText((t) => {
          this.inputs.set(f.label, t.inputEl);
          t.setValue(String(value ?? "")).onChange((v) => {
            update(f.type === "number" ? v.trim() === "" ? "" : Number(v) : v);
            if (f.type === "image") showImage(v);
          });
          if (f.type === "number") {
            t.inputEl.type = "number";
            if (f.min != null) t.inputEl.min = f.min;
            if (f.max != null) t.inputEl.max = f.max;
          }
          if (f.type === "image") {
            t.setPlaceholder("知识库图片路径或 https:// 地址");
            setting.addButton((b) => b.setButtonText("选图").onClick(() => new ImagePicker2(this.plugin, (image) => {
              t.setValue(image.path);
              update(image.path);
              showImage(image.path);
            }).open()));
            setting.addExtraButton((b) => b.setIcon("x").setTooltip("清除").onClick(() => {
              t.setValue("");
              update("");
              showImage("");
            }));
          }
        });
        if (f.type === "image") {
          setting.settingEl.addClass("blog-image-field");
          preview = setting.infoEl.createDiv({ cls: "blog-setting-image" });
          showImage(value);
        }
      }
      pageEditor(el, label, key, draft) {
        el.createEl("h3", { text: label, cls: "blog-settings-group" });
        const wrap = el.createDiv({ cls: "blog-page-editor" });
        const textarea = wrap.createEl("textarea", { cls: "blog-page-text" });
        textarea.value = draft[key];
        textarea.rows = 12;
        textarea.setAttribute("aria-label", label);
        this.inputs ??= /* @__PURE__ */ new Map();
        this.inputs.set(label, textarea);
        const preview = wrap.createDiv({ cls: "blog-page-preview markdown-rendered" });
        const state = { timer: null, component: null, generation: 0 };
        this.previews.push(state);
        const render = async (text) => {
          const generation = ++state.generation;
          state.component?.unload();
          if (state.component) this.plugin.removeChild(state.component);
          state.component = new Component();
          this.plugin.addChild(state.component);
          const target = createDiv();
          try {
            await MarkdownRenderer.render(this.app, text, target, `blog/${key === "home" ? "首页介绍" : "关于"}.md`, state.component);
            if (generation === state.generation) preview.replaceChildren(...target.childNodes);
          } catch (error) {
            if (generation === state.generation) preview.setText(`预览失败：${error.message}`);
          }
        };
        textarea.addEventListener("input", () => {
          draft[key] = textarea.value;
          this.changed();
          clearTimeout(state.timer);
          state.timer = setTimeout(() => render(textarea.value), 250);
        });
        el.createEl("p", { cls: "blog-muted", text: "支持 Markdown 和 ![[图片]]。左侧编辑，右侧预览。" });
        render(draft[key]);
      }
      drawMedia(el) {
        el.createEl("h3", { text: "Cloudflare R2 图床", cls: "blog-settings-group" });
        const file = path2.join(this.plugin.config.repoPath, ".blog-media.json");
        let config = { enabled: false, accountId: "", bucket: "blog-images", publicBaseUrl: "" };
        try {
          if (fs2.existsSync(file)) config = { ...config, ...JSON.parse(fs2.readFileSync(file, "utf8")) };
        } catch (error) {
          el.createDiv({ cls: "blog-card blog-card-warn", text: `图床配置读取失败：${error.message}` });
          return;
        }
        el.createEl("p", { cls: "blog-muted", text: "在笔记里照常插入本地图片；发布时自动压缩成 WebP 上传到 R2，原图留在知识库。" });
        new Setting(el).setName("发布时上传到 R2").addToggle((t) => t.setValue(config.enabled === true).onChange((v) => config.enabled = v));
        for (const [key, label, hint] of [["accountId", "Cloudflare 账户 ID", "32 位十六进制"], ["bucket", "R2 存储桶", ""], ["publicBaseUrl", "图片公开地址", "例如 https://example.pages.dev/media"]]) {
          new Setting(el).setName(label).setDesc(hint).addText((t) => {
            t.setValue(config[key] || "").onChange((v) => config[key] = v.trim());
            t.inputEl.addClass("blog-input-wide");
          });
        }
        new Setting(el).addButton((b) => b.setButtonText("登录 Cloudflare").onClick(() => this.plugin.cloudflare("login"))).addButton((b) => b.setButtonText("检查连接").onClick(() => this.plugin.cloudflare("status"))).addButton((b) => b.setButtonText("保存").setCta().onClick(() => {
          if (config.enabled) {
            let u;
            try {
              u = new URL(config.publicBaseUrl);
            } catch {
            }
            if (!/^[a-f0-9]{32}$/.test(config.accountId) || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(config.bucket) || !u || u.protocol !== "https:" || u.hostname.endsWith(".r2.cloudflarestorage.com")) return new Notice2("请填写有效的账户 ID、存储桶和公开 HTTPS 地址");
          }
          try {
            fs2.writeFileSync(file, JSON.stringify(config, null, 2) + "\n", { mode: 384 });
            new Notice2("图床设置已保存");
          } catch (error) {
            new Notice2(error.message);
          }
        }));
      }
      drawConnection(el) {
        const p = this.plugin, problems = p.runner.diagnose();
        const status = el.createDiv({ cls: `blog-card ${problems.length ? "blog-card-warn" : "blog-card-ok"}` });
        status.createEl("strong", { text: problems.length ? "本机连接需要设置" : "本机连接正常" });
        for (const problem of problems) status.createDiv({ text: problem });
        el.createEl("h3", { text: "本机", cls: "blog-settings-group" });
        const save = async () => {
          await p.saveData(p.config);
          p.onConfigChanged();
        };
        new Setting(el).setName("博客仓库").setDesc("Astro 博客的本地 git 仓库").addText((t) => {
          t.setPlaceholder("/Users/你/Projects/blog").setValue(p.config.repoPath).onChange(async (v) => {
            p.config.repoPath = v.trim();
            await save();
          });
          t.inputEl.addClass("blog-input-wide");
          t.inputEl.addEventListener("blur", () => this.display());
        }).addExtraButton((b) => b.setIcon("folder-open").setTooltip("在 Finder 中打开").onClick(() => p.openRepo()));
        new Setting(el).setName("Node.js").setDesc("运行发布脚本的 node 可执行文件").addText((t) => {
          t.setValue(p.config.nodePath).onChange(async (v) => {
            p.config.nodePath = v.trim();
            await save();
          });
          t.inputEl.addClass("blog-input-wide");
          t.inputEl.addEventListener("blur", () => this.display());
        });
        el.createEl("h3", { text: "网络", cls: "blog-settings-group" });
        const network = new Setting(el).setName("代理").setDesc(`当前：${p.runner.describeNetwork()}`);
        network.addDropdown((d) => d.addOption("system", "跟随系统代理（推荐）").addOption("custom", "自定义").addOption("off", "不使用代理").setValue(p.config.proxyMode).onChange(async (v) => {
          p.config.proxyMode = v;
          await save();
          this.display();
        }));
        if (p.config.proxyMode === "custom") new Setting(el).setName("代理地址").setDesc("HTTP 代理，例如 http://127.0.0.1:7890").addText((t) => t.setValue(p.config.proxyUrl || "").onChange(async (v) => {
          p.config.proxyUrl = v.trim();
          await save();
        }));
        el.createEl("p", { cls: "blog-muted", text: "Obsidian 不会继承终端里的代理变量。这里的设置会传给 git、GitHub CLI、wrangler 和图片校验。" });
        el.createEl("h3", { text: "发布", cls: "blog-settings-group" });
        new Setting(el).setName("发布前确认").setDesc("点击发布后先显示将要发布的内容").addToggle((t) => t.setValue(p.config.confirmPublish).onChange(async (v) => {
          p.config.confirmPublish = v;
          await save();
        }));
        new Setting(el).setName("启动时检查 GitHub 更新").addToggle((t) => t.setValue(p.config.checkOnStartup).onChange(async (v) => {
          p.config.checkOnStartup = v;
          await save();
        }));
        new Setting(el).setName("Cloudflare").setDesc("图片上传和网站部署使用 wrangler 的登录授权").addButton((b) => b.setButtonText("检查连接").onClick(() => p.cloudflare("status"))).addButton((b) => b.setButtonText("登录 Cloudflare").onClick(() => p.cloudflare("login")));
        new Setting(el).setName("同步备份").setDesc("每次同步前保留的原内容").addButton((b) => b.setButtonText("打开备份文件夹").onClick(() => p.openBackups()));
      }
      cleanup() {
        for (const s of this.previews) {
          clearTimeout(s.timer);
          s.component?.unload();
          if (s.component) this.plugin.removeChild(s.component);
        }
        this.previews = [];
        this.inputs = /* @__PURE__ */ new Map();
        this.statusEl = null;
        this.siteButtons = null;
      }
      hide() {
        this.cleanup();
      }
    };
    module2.exports = { BlogSettingTab: BlogSettingTab2, SECTIONS };
  }
});

// integrations/obsidian-blog-publisher/src/main.js
var { Plugin, Notice, MarkdownView } = require("obsidian");
var { spawn } = require("child_process");
var path = require("path");
var fs = require("fs");
var siteStore = require_site_store();
var fields = require_site_fields();
var { Runner } = require_runner();
var { Operation } = require_operation();
var { BlogView, VIEW_TYPE } = require_view();
var { BlogSettingTab } = require_settings();
var { NewPostModal, PropertiesModal, ConfirmModal, ImagePicker, ConflictsModal } = require_modals();
var { isArticle, articleInfo, checklist } = require_articles();
var DEFAULTS = { repoPath: "", nodePath: "/usr/local/bin/node", proxyMode: "system", proxyUrl: "", confirmPublish: true, checkOnStartup: true };
module.exports = class BlogPublisher extends Plugin {
  async onload() {
    this.fields = fields;
    this.config = Object.assign({}, DEFAULTS, await this.loadData());
    this.runner = new Runner(this);
    this.readSiteInfo();
    this.registerView(VIEW_TYPE, (leaf) => new BlogView(leaf, this));
    this.settingsTab = new BlogSettingTab(this.app, this);
    this.addSettingTab(this.settingsTab);
    this.addRibbonIcon("notebook-pen", "博客", () => this.revealView());
    this.statusBar = this.addStatusBarItem();
    this.statusBar.addClass("blog-statusbar", "mod-clickable");
    this.statusBar.addEventListener("click", () => this.revealView());
    const articleCommand = (id, name, run) => this.addCommand({
      id,
      name,
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!isArticle(file)) return false;
        if (!checking) run(file);
        return true;
      }
    });
    this.addCommand({ id: "open-panel", name: "打开博客面板", callback: () => this.revealView() });
    this.addCommand({ id: "new", name: "新建文章", callback: () => this.newPost() });
    articleCommand("publish", "发布当前文章", (file) => this.publish(file));
    articleCommand("preview", "预览当前文章", (file) => this.preview(file));
    articleCommand("properties", "编辑当前文章属性", (file) => this.editProperties(file));
    articleCommand("cover", "更换当前文章封面", (file) => this.chooseCover(file));
    this.addCommand({ id: "check", name: "检查 GitHub 更新", callback: () => this.refreshSync(true) });
    this.addCommand({ id: "settings", name: "打开博客设置", callback: () => this.openSettings() });
    this.registerEvent(this.app.vault.on("modify", (file) => {
      if (file.path.startsWith("blog/") && file.extension === "md") this.scheduleStatus();
    }));
    this.app.workspace.onLayoutReady(() => {
      this.cleanupStaleState();
      if (this.runner.diagnose().length === 0) this.refreshSync(this.config.checkOnStartup, true);
    });
    this.updateStatusBar();
  }
  onunload() {
    clearTimeout(this.statusTimer);
    this.settingsTab?.cleanup();
  }
  // ---------- helpers ----------
  get vaultPath() {
    return this.app.vault.adapter.getBasePath();
  }
  get stateDir() {
    return path.dirname(siteStore.storagePath(this.vaultPath));
  }
  notice(text, timeout) {
    return new Notice(text, timeout);
  }
  get view() {
    return this.app.workspace.getLeavesOfType(VIEW_TYPE)[0]?.view;
  }
  rerender() {
    this.view?.requestRender();
    this.settingsTab?.updateSiteStatus();
    this.updateStatusBar();
  }
  readSiteInfo() {
    try {
      const site = JSON.parse(fs.readFileSync(path.join(this.config.repoPath, "src/config/site.json"), "utf8"));
      const url = new URL(site.url);
      this.siteUrl = url.protocol === "https:" ? url.href.replace(/\/?$/, "/") : null;
      this.siteTitle = site.title;
    } catch {
      this.siteUrl = null;
      this.siteTitle = null;
    }
  }
  onConfigChanged() {
    this.readSiteInfo();
    this.rerender();
  }
  isPublished(slug) {
    return Boolean(slug && fs.existsSync(path.join(this.config.repoPath, "src/content/blog", `${slug}.md`)));
  }
  // A crashed or force-quit Obsidian could leave a stale cancel request behind.
  cleanupStaleState() {
    try {
      fs.rmSync(path.join(this.stateDir, "cancel-request"), { force: true });
    } catch {
    }
  }
  async revealView() {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false);
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    this.app.workspace.revealLeaf(leaf);
  }
  openSettings(section) {
    if (section && ["site", "pages", "images", "appearance", "comments", "connection"].includes(section)) this.settingsTab.section = section;
    else if (section) {
      this.settingsTab.focusField = section;
    }
    this.app.setting.open();
    this.app.setting.openTabById(this.manifest.id);
  }
  openRepo() {
    if (this.config.repoPath) spawn("open", [this.config.repoPath], { shell: false });
  }
  openBackups() {
    const dir = path.join(this.stateDir, "sync-backups");
    fs.mkdirSync(dir, { recursive: true });
    spawn("open", [dir], { shell: false });
  }
  async saveEditor(file) {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (view?.file && (!file || view.file.path === file.path)) await view.save();
  }
  updateStatusBar() {
    const bar = this.statusBar;
    if (!bar) return;
    const op = this.operation;
    bar.empty();
    if (op?.running) {
      const step = op.activeStep;
      bar.setText(`博客 · ${step ? step.label : op.title}${step?.detail ? ` ${step.detail}` : ""}…`);
      bar.show();
    } else if (op && op.state === "failed" && !op.dismissed) {
      bar.setText("博客 · 上次操作未完成");
      bar.show();
    } else bar.hide();
  }
  // ---------- site draft (shared with scripts via site-store.cjs) ----------
  loadSite() {
    if (!fs.existsSync(siteStore.storagePath(this.vaultPath))) throw new Error("还没有站点草稿。请在博客仓库运行 npm run obsidian:setup -- <知识库路径> 导入站点配置。");
    this.siteDraft = siteStore.readSite(this.vaultPath);
    this.siteBase = JSON.parse(JSON.stringify(this.siteDraft));
    return this.siteDraft;
  }
  saveSite() {
    const result = siteStore.patchSite(this.vaultPath, this.siteBase, this.siteDraft);
    Object.assign(this.siteDraft, result.value);
    this.siteBase = JSON.parse(JSON.stringify(result.value));
    if (result.external.length) new Notice(`已合并别处更新的设置：${result.external.join("、")}`);
  }
  // ---------- sync status ----------
  scheduleStatus() {
    clearTimeout(this.statusTimer);
    this.statusTimer = setTimeout(() => this.refreshSync(false, true), 1500);
  }
  async refreshSync(fetchRemote = false, quiet = false) {
    if (this.busy) return;
    if (this.checkPromise) return this.checkPromise;
    this.checking = true;
    this.rerender();
    this.checkPromise = (async () => {
      try {
        this.syncReport = await this.runner.rpc(fetchRemote ? "check" : "status", void 0, { timeout: fetchRemote ? 12e4 : 6e4 });
        this.syncError = "";
        this.pendingSite = false;
      } catch (error) {
        this.syncError = error.message;
        if (!quiet) new Notice(`检查没有完成：${error.message}`);
      } finally {
        this.checking = false;
        this.checkPromise = null;
        this.rerender();
      }
    })();
    return this.checkPromise;
  }
  // ---------- operations ----------
  async begin(options) {
    if (this.busy) {
      new Notice("还有一个博客操作在进行，请等它完成");
      this.revealView();
      return null;
    }
    if (this.checkPromise) await this.checkPromise;
    this.busy = true;
    const op = new Operation(options);
    this.operation = op;
    let last = 0;
    op.on(() => {
      const now = Date.now();
      if (now - last > 120 || !op.running) {
        last = now;
        this.view?.renderOperation();
        this.updateStatusBar();
      }
    });
    this.cleanupStaleState();
    await this.revealView();
    this.rerender();
    return op;
  }
  end(op) {
    this.busy = false;
    this.child = null;
    this.rerender();
    if (!this.view) new Notice(op.state === "success" ? `${op.title}：${op.message}` : `${op.title}没有完成，打开博客面板查看原因`);
    this.scheduleStatus();
  }
  // Spawns a script for `op`, wiring logs, progress and the final state.
  async runScript(op, script, args, { timeout = 0 } = {}) {
    const { child, done } = this.runner.start(script, args, { onLine: (line) => op.log(line), onProgress: (record) => op.progress(record), timeout });
    this.child = child;
    const result = await done;
    if (result.startError) op.log(result.startError);
    let status = null;
    if (result.code !== 0) {
      try {
        status = JSON.parse(fs.readFileSync(path.join(this.stateDir, "publish-status.json"), "utf8"));
      } catch {
      }
    }
    const fresh = status && Date.parse(status.at) >= op.startedAt && status.stage === "failed";
    return { ok: result.code === 0, error: result.startError || (fresh ? status.message : null), code: fresh ? status.code : null };
  }
  async validate(op, relative) {
    try {
      const result = await this.runner.rpc("validate", relative, { timeout: 6e4 });
      if (!result.ok) {
        op.finish(false, { error: result.issues.map((i) => i.message).join("；"), code: "VALIDATION" });
        return false;
      }
      op.log("内容检查通过");
      return true;
    } catch (error) {
      op.finish(false, { error: error.message });
      return false;
    }
  }
  articleBlocking(file) {
    const info = articleInfo(this, file);
    return checklist(this.app, info).filter((i) => !i.ok && i.level === "error");
  }
  async publish(file) {
    try {
      await this.saveEditor(file);
    } catch (error) {
      return new Notice(`保存文章失败：${error.message}`);
    }
    const blocking = this.articleBlocking(file);
    if (blocking.length) {
      const field = blocking.find((b) => b.field)?.field;
      if (field) {
        new Notice(`发布前请先补全：${blocking.map((b) => b.label).join("、")}`);
        return this.editProperties(file, field);
      }
      return new Notice(blocking.map((b) => b.detail || b.label).join("\n"), 8e3);
    }
    const info = articleInfo(this, file);
    const go = () => this.runPublish(file);
    if (!this.config.confirmPublish) return go();
    const images = (this.app.metadataCache.getFileCache(file)?.embeds || []).length;
    new ConfirmModal(this.app, {
      title: info.published ? "发布更新" : "发布文章",
      confirm: info.published ? "发布更新" : "发布",
      lines: [
        ["file-text", `「${info.title}」`],
        ["link", this.siteUrl ? new URL(`blog/${info.slug}/`, this.siteUrl).href : `/blog/${info.slug}/`],
        ["image", images ? `${images} 张图片会压缩后上传到图床` : "没有正文图片"],
        ["shield-check", "只发布这一篇文章和它引用的图片，其他笔记不会离开本机"]
      ],
      remember: async () => {
        this.config.confirmPublish = false;
        await this.saveData(this.config);
      },
      onConfirm: go
    }).open();
  }
  async runPublish(file) {
    const info = articleInfo(this, file);
    const op = await this.begin({ kind: "publish", title: info.published ? "发布更新" : "发布文章", subject: info.title, file, cancellable: true });
    if (!op) return;
    op.retry = () => this.runPublish(file);
    try {
      if (!await this.validate(op, file.path)) return;
      const result = await this.runScript(op, "scripts/obsidian.mjs", ["publish", this.vaultPath, path.join(this.vaultPath, file.path)]);
      if (result.ok) {
        op.finish(true, { message: op.partial ? "已推送到 GitHub，Cloudflare 会自动部署（通常 1–2 分钟）" : "已发布到网站", url: this.siteUrl ? new URL(`blog/${encodeURIComponent(info.slug)}/`, this.siteUrl).href : null });
        new Notice(`「${info.title}」已发布`);
      } else op.finish(false, { error: result.error, code: result.code });
    } finally {
      this.end(op);
    }
  }
  async preview(file) {
    try {
      await this.saveEditor(file);
    } catch (error) {
      return new Notice(`保存文章失败：${error.message}`);
    }
    const info = articleInfo(this, file);
    const op = await this.begin({ kind: "preview", title: "本地预览", subject: info.title, file, cancellable: true });
    if (!op) return;
    op.retry = () => this.preview(file);
    try {
      if (!await this.validate(op, file.path)) return;
      op.activate("preview");
      op.emit();
      const result = await this.runScript(op, "scripts/obsidian.mjs", ["preview", this.vaultPath, path.join(this.vaultPath, file.path)], { timeout: 18e4 });
      if (result.ok) op.finish(true, { message: "预览已在浏览器打开，正式网站没有变化", url: `http://127.0.0.1:4322/blog/${encodeURIComponent(info.slug)}/` });
      else op.finish(false, { error: result.error, code: result.code });
    } finally {
      this.end(op);
    }
  }
  async siteAction(action) {
    if (this.siteSaveError) return new Notice("站点设置有未保存的错误，请先修正");
    const run = async () => {
      const op = await this.begin({ kind: action === "publish" ? "publish" : "preview", title: action === "publish" ? "发布站点设置" : "预览站点", subject: "首页、关于页和站点设置", cancellable: true });
      if (!op) return;
      op.retry = () => this.siteAction(action);
      try {
        if (!await this.validate(op)) return;
        if (action === "preview") {
          op.activate("preview");
          op.emit();
        }
        const result = await this.runScript(op, "scripts/site.mjs", [action, this.vaultPath], action === "preview" ? { timeout: 18e4 } : {});
        if (result.ok) op.finish(true, action === "publish" ? { message: op.partial ? "已推送到 GitHub，等待 Cloudflare 部署" : "站点设置已上线", url: this.siteUrl } : { message: "预览已在浏览器打开", url: "http://127.0.0.1:4322/" });
        else op.finish(false, { error: result.error, code: result.code });
      } finally {
        this.end(op);
        if (action === "publish") this.pendingSite = false;
      }
    };
    if (action === "publish" && this.config.confirmPublish) {
      new ConfirmModal(this.app, { title: "发布站点设置", confirm: "发布", lines: [["layout", "站点信息、首页介绍、关于页、导航与外观"], ["shield-check", "文章不会一起发布"]], onConfirm: run }).open();
    } else run();
  }
  async syncChanges(options) {
    try {
      await this.saveEditor();
    } catch {
    }
    const op = await this.begin({ kind: "sync", title: options ? "应用差异选择" : "同步仓库变化" });
    if (!op) return;
    op.retry = () => this.syncChanges(options);
    try {
      const result = await this.runner.rpc(options ? "resolve" : "sync", options, { timeout: 18e4 });
      this.syncReport = result;
      this.syncError = "";
      if (result.needsReview) {
        op.finish(true, { message: "两边都有修改，请逐项选择" });
        new ConflictsModal(this, result).open();
      } else op.finish(true, { message: result.imported ? `已导入 ${result.imported} 项变化，原内容已备份` : "没有需要导入的变化" });
    } catch (error) {
      op.finish(false, { error: error.message });
    } finally {
      this.end(op);
    }
  }
  async cloudflare(action) {
    const op = await this.begin({ kind: action === "login" ? "login" : "media", title: action === "login" ? "登录 Cloudflare" : "检查图床连接", cancellable: action === "login" });
    if (!op) return;
    const previous = this.lastFailed;
    try {
      if (action === "login") op.message = "浏览器会打开 Cloudflare 授权页，点击 Allow 后回到这里";
      op.emit();
      const result = await this.runScript(op, "scripts/media.mjs", [action], { timeout: action === "login" ? 3e5 : 9e4 });
      if (result.ok) {
        op.finish(true, { message: action === "login" ? "登录成功" : "连接正常" });
        if (action === "login" && previous?.retry) op.followUp = ["重新发布", previous.retry];
      } else op.finish(false, { error: result.error || (action === "login" ? "授权没有完成。若浏览器提示 CSRF 错误，先在浏览器登录 dash.cloudflare.com 再重试。" : "无法访问 R2，请检查授权和网络"), code: action === "login" ? null : "AUTH_CLOUDFLARE" });
      op.retry = () => this.cloudflare(action);
    } finally {
      this.end(op);
    }
  }
  cancelOperation() {
    const op = this.operation;
    if (!op?.running || !op.cancellable) return;
    op.cancelRequested = true;
    op.message = "正在安全地停止…";
    op.emit();
    if (op.kind === "publish") {
      try {
        fs.mkdirSync(this.stateDir, { recursive: true });
        fs.writeFileSync(path.join(this.stateDir, "cancel-request"), String(Date.now()));
      } catch {
      }
    } else this.child?.kill("SIGTERM");
  }
  remedy(id, op) {
    if (op.state === "failed") this.lastFailed = op;
    switch (id) {
      case "retry":
        return op.retry?.();
      case "login":
        return this.cloudflare("login");
      case "sync":
        return this.syncChanges();
      case "network":
        return this.openSettings("connection");
      case "media":
        return this.openSettings("images");
      case "repo":
        return this.openRepo();
      case "edit":
        return op.file ? this.editProperties(op.file) : this.openSettings();
      case "open":
        return op.file && this.app.workspace.getLeaf(false).openFile(op.file);
      case "log":
        op.showLog = true;
        return this.view?.renderOperation();
      case "followUp":
        return op.followUp?.[1]();
    }
  }
  // ---------- article helpers ----------
  newPost() {
    new NewPostModal(this).open();
  }
  editProperties(file, focus) {
    new PropertiesModal(this, file, { focus, onSaved: () => this.rerender() }).open();
  }
  chooseCover(file) {
    new ImagePicker(this, async (image) => {
      await this.app.fileManager.processFrontMatter(file, (fm) => {
        fm.heroImage = image.path;
      });
      new Notice("封面已更新");
      this.rerender();
    }).open();
  }
};

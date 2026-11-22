// Builds a tiny, site-specific subset of LXGW WenKai for headings.
//
// Chinese fonts are 20MB+; even the usual unicode-range splitting made an article page fetch ~950KB
// across 19 requests. After `astro build` this integration collects the characters that are actually
// rendered in the display face (headings, titles, quotes…), subsets the font to exactly those glyphs
// (≈80KB, one request), names it by content hash for long-term caching, and adds a preload plus
// @font-face to every page. Body text keeps the system font, so it costs nothing.
//
// If the source font or fonttools is missing the build still succeeds and headings fall back to the
// system Kaiti face declared in global.css.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const FAMILY = 'LXGW WenKai Site';
// Elements styled with var(--font-display); keep in sync with the stylesheets.
const TAGS = /<(h[1-6]|blockquote)\b[^>]*>([\s\S]*?)<\/\1>/g;
const CLASSES = /<(\w+)\b[^>]*class="[^"]*\b(?:site-title|title|subtitle|year-label|colophon|fin)\b[^"]*"[^>]*>([\s\S]*?)<\/\1>/g;
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = s => s.replace(/<[^>]+>/g, '').replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) =>
	e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e] ?? m);

export function collectCharacters(htmlFiles) {
	const chars = new Set();
	for (let c = 0x20; c < 0x7f; c++) chars.add(String.fromCharCode(c)); // ASCII for Latin words in titles
	for (const ch of '，。、：；！？「」『』（）《》—…·“”‘’') chars.add(ch);
	for (const html of htmlFiles) {
		for (const re of [TAGS, CLASSES]) for (const m of html.matchAll(re)) for (const ch of decode(m[2])) if (!/\s/.test(ch)) chars.add(ch);
	}
	return [...chars].sort().join('');
}

function findSource() {
	const candidates = [process.env.BLOG_DISPLAY_FONT, path.join(os.homedir(), 'Library/Fonts/LXGWWenKai-Medium.ttf'), '/Library/Fonts/LXGWWenKai-Medium.ttf'];
	return candidates.find(f => f && fs.existsSync(f));
}

// Obsidian launches the build with a minimal PATH, where `python3` may lack fonttools; try the usual installs.
function findPython() {
	const home = os.homedir();
	const candidates = [process.env.BLOG_PYTHON, 'python3', ...['miniconda3', 'anaconda3', 'miniforge3', '.pyenv/shims'].map(d => path.join(home, d, 'bin/python3')), path.join(home, '.pyenv/shims/python3'), '/opt/homebrew/bin/python3', '/usr/local/bin/python3', '/usr/bin/python3'];
	return candidates.find(py => py && spawnSync(py, ['-c', 'import fontTools.subset, brotli'], { stdio: 'ignore' }).status === 0);
}

function htmlFiles(dir) {
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
		const p = path.join(dir, e.name);
		return e.isDirectory() ? htmlFiles(p) : e.name.endsWith('.html') ? [p] : [];
	});
}

export function injectFont(html, href) {
	if (html.includes(`/fonts/`) && html.includes(FAMILY)) return html;
	const tags = `<link rel="preload" href="${href}" as="font" type="font/woff2" crossorigin>` +
		`<style>@font-face{font-family:'${FAMILY}';src:url(${href}) format('woff2');font-weight:100 900;font-display:swap}</style>`;
	return html.replace('</head>', `${tags}</head>`);
}

export default function displayFont() {
	return {
		name: 'display-font',
		hooks: {
			'astro:build:done': ({ dir, logger }) => {
				const out = fileURLToPath(dir);
				const pages = htmlFiles(out);
				const source = findSource();
				if (!source) return logger.warn('找不到 LXGWWenKai-Medium.ttf（可用 BLOG_DISPLAY_FONT 指定），标题将使用系统楷体。');
				const python = findPython();
				if (!python) return logger.warn('没有找到装了 fonttools 的 Python（pip install fonttools brotli，或用 BLOG_PYTHON 指定），标题将使用系统楷体。');
				const text = collectCharacters(pages.map(p => fs.readFileSync(p, 'utf8')));
				const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'display-font-'));
				try {
					const textFile = path.join(tmp, 'chars.txt'), fontFile = path.join(tmp, 'font.woff2');
					fs.writeFileSync(textFile, text);
					const r = spawnSync(python, ['-m', 'fontTools.subset', source, `--text-file=${textFile}`, '--flavor=woff2', '--layout-features=kern,liga,vert,vrt2', `--output-file=${fontFile}`], { encoding: 'utf8' });
					if (r.status !== 0 || !fs.existsSync(fontFile)) return logger.warn(`字体裁剪失败（需要 python3 -m pip install fonttools brotli），标题将使用系统楷体。${(r.stderr || r.error?.message || '').trim().split('\n').at(-1)}`);
					const data = fs.readFileSync(fontFile);
					const name = `wenkai.${crypto.createHash('sha256').update(data).digest('hex').slice(0, 10)}.woff2`;
					fs.mkdirSync(path.join(out, 'fonts'), { recursive: true });
					fs.writeFileSync(path.join(out, 'fonts', name), data);
					for (const p of pages) fs.writeFileSync(p, injectFont(fs.readFileSync(p, 'utf8'), `/fonts/${name}`));
					logger.info(`标题字体：${[...text].length} 个字，${Math.round(data.length / 1024)} KB，已注入 ${pages.length} 个页面`);
				} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
			},
		},
	};
}

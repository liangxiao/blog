// Bundles the Obsidian plugin sources into the single main.js that Obsidian loads.
import {build} from 'esbuild';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../integrations/obsidian-blog-publisher');
await build({
 entryPoints:[path.join(dir,'src/main.js')],
 outfile:path.join(dir,'main.js'),
 bundle:true,format:'cjs',platform:'node',target:'es2022',
 external:['obsidian','electron'],
 banner:{js:'/* 博客发布 — generated from src/ by `npm run plugin:build`; edit the sources instead. */'},
 charset:'utf8',logLevel:'info',
});

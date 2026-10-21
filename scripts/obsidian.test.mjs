import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prepare } from './obsidian.mjs';
function fixture(body) {
 const vault=fs.mkdtempSync(path.join(os.tmpdir(),'blog-export-'));
 fs.mkdirSync(path.join(vault,'blog'));fs.mkdirSync(path.join(vault,'assets'));
 fs.writeFileSync(path.join(vault,'assets','pic.png'),Buffer.from('test-image'));
 fs.writeFileSync(path.join(vault,'private.md'),'SECRET_PRIVATE_NOTE');
 const source=path.join(vault,'blog','article.md');
 fs.writeFileSync(source,`---\ntitle: Test\nslug: test-post\ndescription: Test post\npubDate: 2026-10-20\ntags: [AI, test]\nsource: SECRET_PRIVATE_PROPERTY\ndraft: true\n---\n${body}`);
 return {vault,source,clean:()=>fs.rmSync(vault,{recursive:true,force:true})};
}
test('exports only selected content and referenced images, strips private metadata',()=>{
 const f=fixture('![one](../assets/pic.png)\n![[pic.png|300]]\n');
 try {const p=prepare(f.vault,f.source);assert.equal(p.assets.size,1);assert.match(p.build(false),/draft: false/);assert.match(p.build(true),/draft: true/);assert.doesNotMatch(p.build(false),/SECRET|!\[\[/);assert.match(p.build(false),/tags:/);} finally {f.clean();}
});
test('code examples remain literal and external images are not copied',()=>{
 const f=fixture('```md\n![[private.md]]\n```\n`[[private]]`\n![remote](https://example.com/a.png)');
 try {const p=prepare(f.vault,f.source);assert.equal(p.assets.size,0);assert.match(p.build(false),/!\[\[private.md\]\]/);} finally {f.clean();}
});
test('private note embeds and links fail closed',()=>{
 for(const body of ['![[private.md]]','[[private]]']){const f=fixture(body);try{assert.throws(()=>prepare(f.vault,f.source));}finally{f.clean();}}
});
test('rejects articles outside blog and missing images',()=>{
 const f=fixture('![[missing.png]]');try{assert.throws(()=>prepare(f.vault,f.source));assert.throws(()=>prepare(f.vault,path.join(f.vault,'private.md')));}finally{f.clean();}
});
test('rejects image symlinks outside vault',()=>{
 const f=fixture('![[escape.png]]');const other=fs.mkdtempSync(path.join(os.tmpdir(),'blog-private-'));
 try{fs.writeFileSync(path.join(other,'secret.png'),'private');fs.symlinkSync(path.join(other,'secret.png'),path.join(f.vault,'escape.png'));assert.throws(()=>prepare(f.vault,f.source));}finally{f.clean();fs.rmSync(other,{recursive:true,force:true});}
});

import { spawnSync } from 'node:child_process';
import { root } from './obsidian.mjs';
function publicationFixture() {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'blog-publish-'));
 const repo=path.join(dir,'repo'), remote=path.join(dir,'remote.git');
 fs.mkdirSync(repo);fs.mkdirSync(path.join(repo,'scripts'));
 const git=(args,cwd=repo)=>{const r=spawnSync('git',args,{cwd,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
 git(['init','--bare',remote],dir);git(['init','-b','main']);git(['config','user.name','Test']);git(['config','user.email','test@example.invalid']);
 fs.copyFileSync(path.join(root,'scripts/obsidian.mjs'),path.join(repo,'scripts/obsidian.mjs'));
 fs.copyFileSync(path.join(root,'scripts/media.mjs'),path.join(repo,'scripts/media.mjs'));
 fs.copyFileSync(path.join(root,'scripts/deploy.mjs'),path.join(repo,'scripts/deploy.mjs'));
 fs.symlinkSync(path.join(root,'node_modules'),path.join(repo,'node_modules'),'dir');
 fs.writeFileSync(path.join(repo,'.gitignore'),'node_modules\n');
 fs.writeFileSync(path.join(repo,'package.json'),JSON.stringify({type:'module',scripts:{build:'node -e "process.exit(Number(process.env.TEST_BUILD_EXIT || 0))"'}}));
 git(['add','.']);git(['commit','-m','setup']);git(['remote','add','origin',remote]);git(['push','-u','origin','main']);
 const f=fixture('![[pic.png]]');
 const invoke=(env={})=>spawnSync(process.execPath,[path.join(repo,'scripts/obsidian.mjs'),'publish',f.vault,f.source],{cwd:repo,encoding:'utf8',env:{...process.env,...env}});
 return {dir,repo,remote,git,f,invoke,clean:()=>{f.clean();fs.rmSync(dir,{recursive:true,force:true});}};
}
test('publication pushes only selected article and referenced images to a local test remote',()=>{
 const t=publicationFixture();try{const r=t.invoke();assert.equal(r.status,0,r.stderr);const names=t.git(['diff-tree','--no-commit-id','--name-only','-r','HEAD']).split('\n');assert.equal(names.length,2);assert.ok(names.every(n=>n.startsWith('src/assets/blog/test-post/')||n==='src/content/blog/test-post.md'));assert.equal(t.git(['status','--porcelain']),'');assert.match(fs.readFileSync(t.f.source,'utf8'),/draft: false/);assert.equal(t.git(['rev-parse','HEAD']),t.git(['rev-parse','refs/heads/main'],t.remote));}finally{t.clean();}
});
test('failed build restores clean repository and leaves source draft unchanged',()=>{
 const t=publicationFixture();try{const before=fs.readFileSync(t.f.source,'utf8');const r=t.invoke({TEST_BUILD_EXIT:'1'});assert.notEqual(r.status,0);assert.equal(t.git(['status','--porcelain']),'');assert.equal(fs.readFileSync(t.f.source,'utf8'),before);assert.equal(t.git(['rev-parse','HEAD']),t.git(['rev-parse','refs/heads/main'],t.remote));}finally{t.clean();}
});
test('failed push keeps a retryable local commit, without marking the source published',()=>{
 const t=publicationFixture();try{const hook=path.join(t.remote,'hooks','pre-receive');fs.writeFileSync(hook,'#!/bin/sh\nexit 1\n',{mode:0o755});const before=fs.readFileSync(t.f.source,'utf8');assert.notEqual(t.invoke().status,0);assert.equal(fs.readFileSync(t.f.source,'utf8'),before);assert.equal(t.git(['status','--porcelain']),'');fs.unlinkSync(hook);const r=t.invoke();assert.equal(r.status,0,r.stderr);assert.equal(t.git(['rev-parse','HEAD']),t.git(['rev-parse','refs/heads/main'],t.remote));}finally{t.clean();}
});
test('R2 public access failure after build rolls back the article without publishing the source',()=>{
 const t=publicationFixture();
 try{
  fs.appendFileSync(path.join(t.repo,'.gitignore'),'.blog-media.json\n');t.git(['add','.gitignore']);t.git(['commit','-m','ignore local media config']);t.git(['push']);
  fs.writeFileSync(path.join(t.repo,'.blog-media.json'),JSON.stringify({enabled:true,accountId:'a'.repeat(32),bucket:'blog-images',publicBaseUrl:'https://images.example.invalid'}));
  const preload=path.join(t.dir,'fetch.mjs');fs.writeFileSync(preload,'globalThis.fetch = async () => new Response("", {status:403});');
  const original=fs.readFileSync(t.f.source,'utf8'),head=t.git(['rev-parse','HEAD']);
  const r=t.invoke({NODE_OPTIONS:`--import=${preload}`});assert.notEqual(r.status,0);assert.match(r.stderr,/图床公开访问失败/);
  assert.equal(t.git(['rev-parse','HEAD']),head);assert.equal(t.git(['status','--porcelain']),'');assert.equal(fs.readFileSync(t.f.source,'utf8'),original);
 }finally{t.clean();}
});
test('failed Pages deployment preserves the GitHub commit and can be retried before marking the source published',()=>{
 const t=publicationFixture();
 try{
  fs.appendFileSync(path.join(t.repo,'.gitignore'),'.blog-deploy.json\n');t.git(['add','.gitignore']);t.git(['commit','-m','ignore local deployment config']);t.git(['push']);
  fs.writeFileSync(path.join(t.repo,'.blog-deploy.json'),JSON.stringify({enabled:true,accountId:'a'.repeat(32),project:'test-blog',branch:'main'}));
  fs.unlinkSync(path.join(t.repo,'node_modules'));fs.mkdirSync(path.join(t.repo,'node_modules/wrangler/bin'),{recursive:true});fs.symlinkSync(path.join(root,'node_modules/yaml'),path.join(t.repo,'node_modules/yaml'),'dir');
  const wrangler=path.join(t.repo,'node_modules/wrangler/bin/wrangler.js');fs.writeFileSync(wrangler,'process.exit(1);');
  const original=fs.readFileSync(t.f.source,'utf8');const r=t.invoke();assert.notEqual(r.status,0);assert.match(r.stderr,/Cloudflare 部署未完成/);
  assert.equal(t.git(['rev-parse','HEAD']),t.git(['rev-parse','refs/heads/main'],t.remote));assert.equal(t.git(['status','--porcelain']),'');assert.equal(fs.readFileSync(t.f.source,'utf8'),original);
  fs.writeFileSync(wrangler,'process.exit(0);');const retried=t.invoke();assert.equal(retried.status,0,retried.stderr);assert.match(fs.readFileSync(t.f.source,'utf8'),/draft: false/);
 }finally{t.clean();}
});

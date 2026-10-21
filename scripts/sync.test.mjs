import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {prepare,root} from './obsidian.mjs';
import {prepareSite,fields} from './site.mjs';
import store from '../integrations/obsidian-blog-publisher/site-store.cjs';
import {checkSync,synchronize,assertPublishSafe,withSyncLock} from './sync.mjs';

function fixture(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'blog-sync-')),repo=path.join(dir,'repo'),remote=path.join(dir,'remote.git'),other=path.join(dir,'other'),vault=path.join(dir,'vault');
 fs.mkdirSync(repo);fs.mkdirSync(path.join(vault,'blog'),{recursive:true});
 const git=(args,cwd=repo)=>{const r=spawnSync('git',args,{cwd,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
 git(['init','--bare',remote],dir);git(['init','-b','main']);git(['config','user.name','Test']);git(['config','user.email','test@example.invalid']);
 fs.cpSync(path.join(root,'scripts'),path.join(repo,'scripts'),{recursive:true});fs.cpSync(path.join(root,'integrations'),path.join(repo,'integrations'),{recursive:true});
 fs.symlinkSync(path.join(root,'node_modules'),path.join(repo,'node_modules'),'dir');fs.writeFileSync(path.join(repo,'.gitignore'),'node_modules\n');fs.writeFileSync(path.join(repo,'package.json'),JSON.stringify({type:'module',scripts:{build:'node -e "process.exit(0)"'}}));
 const draft={version:1,values:Object.fromEntries(fields.map(f=>[f.label,f.default])),home:'原首页',about:'原关于'};store.saveSite(vault,draft);
 const source=path.join(vault,'blog/writing.md');fs.writeFileSync(source,'---\ntitle: 原文章\nslug: example\ndescription: 一句话简介\npubDate: 2026-10-20\ndraft: false\nsource: PRIVATE_METADATA\n---\n原正文\n');
 const write=(file,data)=>{const dest=path.join(repo,file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,data);};
 for(const [f,d]of prepareSite(vault).entries)write(f,d);write('src/content/blog/example.md',prepare(vault,source).build(false));
 git(['add','.']);git(['commit','-m','setup']);git(['remote','add','origin',remote]);git(['push','-u','origin','main']);git(['clone','-b','main',remote,other],dir);git(['config','user.name','Other'],other);git(['config','user.email','other@example.invalid'],other);
 const outside=(file,change)=>{const dest=path.join(other,file);fs.mkdirSync(path.dirname(dest),{recursive:true});const before=fs.existsSync(dest)?fs.readFileSync(dest,'utf8'):'';const after=change(before);if(after===null)fs.unlinkSync(dest);else fs.writeFileSync(dest,after);git(['add','.'],other);git(['commit','-m','outside change'],other);git(['push'],other);};
 return {repo,remote,vault,source,git,outside,check:()=>checkSync(vault,{base:repo,fetchRemote:true}),sync:options=>synchronize(vault,{base:repo,...options}),clean:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
test('remote-only page and field changes are imported after a fast-forward, with a recoverable backup',async()=>{
 const t=fixture();try{
  assert.equal((await t.check()).counts.conflict,0);
  t.outside('src/content/pages/home.md',s=>s.replace('原首页','远程新首页'));
  const checked=await t.check();assert.equal(checked.behind,1);assert.equal(checked.changes.find(c=>c.id==='site:home').status,'remote');
  assert.equal(store.readSite(t.vault).home,'原首页');
  const result=await t.sync();assert.equal(result.applied,true);assert.equal(store.readSite(t.vault).home,'远程新首页');assert.ok(fs.existsSync(path.join(t.vault,result.backup,'site.json')));assert.equal(t.git(['rev-parse','HEAD']),t.git(['rev-parse','origin/main']));
 }finally{t.clean();}
});
test('local changes in a different site field are kept while importing an outside page',async()=>{
 const t=fixture();try{
  await t.check();const draft=store.readSite(t.vault);draft.home='本地首页草稿';store.saveSite(t.vault,draft);
  t.outside('src/content/pages/about.md',s=>s.replace('原关于','外部关于'));
  const result=await t.sync();assert.equal(result.applied,true);assert.equal(store.readSite(t.vault).home,'本地首页草稿');assert.equal(store.readSite(t.vault).about,'外部关于');
  assert.equal(result.changes.find(c=>c.id==='site:home').status,'local');
 }finally{t.clean();}
});
test('a manually pulled external edit cannot be overwritten by publication',async()=>{
 const t=fixture();try{
  await t.check();t.outside('src/content/pages/home.md',s=>s.replace('原首页','手动拉取的新首页'));t.git(['fetch','origin','main']);t.git(['merge','--ff-only','origin/main']);
  await assert.rejects(assertPublishSafe(t.vault,'site',{base:t.repo}),/外部修改/);assert.equal(store.readSite(t.vault).home,'原首页');
 }finally{t.clean();}
});
test('two-sided edits require explicit review; choosing local leaves an unpublished change',async()=>{
 const t=fixture();try{
  await t.check();const draft=store.readSite(t.vault);draft.home='本地新首页';store.saveSite(t.vault,draft);t.outside('src/content/pages/home.md',s=>s.replace('原首页','外部新首页'));
  const review=await t.sync();assert.equal(review.needsReview,true);assert.equal(review.conflicts[0].id,'site:home');assert.equal(store.readSite(t.vault).home,'本地新首页');
  const applied=await t.sync({token:review.token,choices:{'site:home':'local'}});assert.equal(applied.applied,true);assert.equal(applied.changes.find(c=>c.id==='site:home').status,'local');
  await assertPublishSafe(t.vault,'site',{base:t.repo});
 }finally{t.clean();}
});
test('conflict choices become stale when either side changes while the review is open',async()=>{
 const t=fixture();try{
  await t.check();const draft=store.readSite(t.vault);draft.home='本地新首页';store.saveSite(t.vault,draft);t.outside('src/content/pages/home.md',s=>s.replace('原首页','外部新首页'));
  const review=await t.sync();draft.home='打开差异后继续编辑';store.saveSite(t.vault,draft);
  await assert.rejects(t.sync({token:review.token,choices:{'site:home':'repo'}}),/又发生变化/);assert.equal(store.readSite(t.vault).home,'打开差异后继续编辑');
 }finally{t.clean();}
});
test('outside article changes import into the matching note and preserve private metadata',async()=>{
 const t=fixture();try{
  await t.check();t.outside('src/content/blog/example.md',s=>s.replace('原正文','外部新正文'));
  await t.sync();const source=fs.readFileSync(t.source,'utf8');assert.match(source,/外部新正文/);assert.match(source,/PRIVATE_METADATA/);assert.match(source,/slug: example/);
  assert.equal((await t.check()).counts.conflict,0);
 }finally{t.clean();}
});
test('public tags with spaces survive Obsidian tag normalization and round-trip unchanged',async()=>{
 const t=fixture();try{
  await t.check();t.outside('src/content/blog/example.md',s=>s.replace('draft: false','tags: [AI Agent, Loop Engineering]\ndraft: false'));
  await t.sync();const text=fs.readFileSync(t.source,'utf8');assert.match(text,/blogTags:/);assert.match(text,/AI-Agent/);assert.match(prepare(t.vault,t.source).build(false),/AI Agent/);assert.equal((await t.check()).counts.conflict,0);
 }finally{t.clean();}
});
test('edits to image bytes are detected even when the Markdown text does not change',async()=>{
 const t=fixture();try{
  fs.mkdirSync(path.join(t.vault,'blog/assets'));const image=path.join(t.vault,'blog/assets/pic.png');fs.writeFileSync(image,'original image');fs.appendFileSync(t.source,'\n![](assets/pic.png)');
  const p=prepare(t.vault,t.source);for(const [file,data]of p.assets){fs.mkdirSync(path.dirname(path.join(t.repo,file)),{recursive:true});fs.writeFileSync(path.join(t.repo,file),data);}fs.writeFileSync(path.join(t.repo,'src/content/blog/example.md'),p.build(false));t.git(['add','.']);t.git(['commit','-m','add image']);t.git(['push']);t.git(['pull','--ff-only'],path.join(t.repo,'../other'));
  await t.check();fs.writeFileSync(image,'new local image');assert.equal((await t.check()).changes.find(c=>c.id==='article:example').status,'local');fs.writeFileSync(image,'original image');
  const remoteImage=[...p.assets.keys()][0];t.outside(remoteImage,()=> 'changed repository image');assert.equal((await t.check()).changes.find(c=>c.id==='article:example').status,'remote');
 }finally{t.clean();}
});
test('new remote articles and repository images are imported without downloading remote URLs',async()=>{
 const t=fixture();try{
  await t.check();
  const image=path.join(t.repo,'..','other/public/pic.png');fs.mkdirSync(path.dirname(image),{recursive:true});fs.writeFileSync(image,'image bytes');
  t.outside('src/content/blog/new-post.md',()=> '---\ntitle: 新文章\ndescription: 简介\npubDate: 2026-10-21\nheroImage: /pic.png\n---\n![](/pic.png)\n```md\n![](/not-an-image.png)\n```\n');
  await t.sync();const imported=fs.readFileSync(path.join(t.vault,'blog/new-post.md'),'utf8');assert.match(imported,/slug: new-post/);assert.match(imported,/blog\/assets\/imported\//);assert.match(imported,/!\[\]\(\/not-an-image.png\)/);assert.equal(fs.readdirSync(path.join(t.vault,'blog/assets/imported')).length,1);
 }finally{t.clean();}
});
test('remote deletions are reviewed and originals remain available in the backup',async()=>{
 const t=fixture();try{
  await t.check();t.outside('src/content/blog/example.md',()=>null);
  const review=await t.sync();assert.equal(review.needsReview,true);assert.ok(fs.existsSync(t.source));
  const result=await t.sync({token:review.token,choices:{'article:example':'repo'}});assert.equal(fs.existsSync(t.source),false);assert.match(fs.readFileSync(path.join(t.vault,result.backup,'blog/writing.md'),'utf8'),/PRIVATE_METADATA/);
 }finally{t.clean();}
});
test('dirty worktrees, divergent branches and simultaneous operations cannot be silently synchronized',async()=>{
 const t=fixture();try{
  await t.check();fs.appendFileSync(path.join(t.repo,'package.json'),' ');await assert.rejects(t.sync(),/干净的 main/);t.git(['restore','package.json']);
  await withSyncLock(t.vault,async()=>assert.rejects(t.sync(),/另一个同步或发布/));
  fs.writeFileSync(path.join(t.repo,'local.txt'),'local');t.git(['add','.']);t.git(['commit','-m','local change']);t.outside('src/content/pages/home.md',s=>s+'outside');await assert.rejects(t.sync(),/分叉/);
 }finally{t.clean();}
});
test('symlink import targets and missing repository images leave existing notes untouched',async()=>{
 const t=fixture();try{
  await t.check();t.outside('src/content/blog/example.md',s=>s+'\n![](/missing.png)');
  const original=fs.readFileSync(t.source,'utf8');await assert.rejects(t.sync(),/图片不存在/);assert.equal(fs.readFileSync(t.source,'utf8'),original);
 }finally{t.clean();}
});

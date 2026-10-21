import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse, stringify } from 'yaml';
import siteStore from '../integrations/obsidian-blog-publisher/site-store.cjs';
import { fields, prepareSite } from './site.mjs';
import { root } from './obsidian.mjs';
function fixture(overrides={}){
 const vault=fs.mkdtempSync(path.join(os.tmpdir(),'blog-site-'));fs.mkdirSync(path.join(vault,'blog'));
 const values=Object.fromEntries(fields.map(f=>[f.label,f.type==='links'?f.default.map(l=>`${l.label} | ${l.href}`):f.default]));
 Object.assign(values,overrides);
 fs.writeFileSync(path.join(vault,'blog/站点设置.md'),`---\n${stringify(values)}---\n操作说明不应发布`);
 fs.writeFileSync(path.join(vault,'blog/首页介绍.md'),'# 欢迎\n\n我的首页');
 fs.writeFileSync(path.join(vault,'blog/关于.md'),'## 我是谁\n\n我的介绍');
 fs.writeFileSync(path.join(vault,'blog/private.md'),'PRIVATE_DRAFT');
 return {vault,clean:()=>fs.rmSync(vault,{recursive:true,force:true})};
}
test('site export contains settings and pages only, supports Markdown without frontmatter',()=>{
 const f=fixture({'博客标题':'测试博客','正文字号':20,'导航链接':['首页 | /','GitHub | https://github.com/liangxiao']});
 try{const p=prepareSite(f.vault);assert.equal(p.entries.size,3);assert.equal(p.site.title,'测试博客');assert.equal(p.site.fontSize,20);assert.match(p.entries.get('src/content/pages/about.md').toString(),/我的介绍/);assert.doesNotMatch([...p.entries.values()].join(''),/PRIVATE_DRAFT|操作说明不应发布/);}finally{f.clean();}
});
test('site image selection and page images share scoped exported assets',()=>{
 const f=fixture({'首页封面':'blog/cover.png','默认文章封面':'blog/cover.png'});
 try{fs.writeFileSync(path.join(f.vault,'blog/cover.png'),'image');fs.appendFileSync(path.join(f.vault,'blog/关于.md'),'\n![[cover.png]]');const p=prepareSite(f.vault);assert.equal(p.entries.size,4);assert.equal(p.site.homeCover,p.site.defaultCover);assert.match(p.site.homeCover,/^\/site\//);assert.match(p.entries.get('src/content/pages/about.md').toString(),/!\[cover\]\(\/site\//);}finally{f.clean();}
});
test('migration preserves existing settings, Markdown and relative images outside the article list',()=>{
 const f=fixture({'博客标题':'保留原博客','首页封面':'assets/pic.png','启用评论':true,'评论仓库ID':'R_abcdef','评论分类ID':'DIC_abcdef'});
 try{
  fs.mkdirSync(path.join(f.vault,'blog/assets'));fs.writeFileSync(path.join(f.vault,'blog/assets/pic.png'),'picture');
  fs.writeFileSync(path.join(f.vault,'blog/首页介绍.md'),'---\ntitle: 首页介绍\n---\n原来的首页\n![](assets/pic.png)');
  fs.writeFileSync(path.join(f.vault,'blog/使用说明.md'),'PRIVATE_GUIDE');
  const before=prepareSite(f.vault);
  siteStore.migrateSite(f.vault,parse,{values:{},home:'fallback',about:'fallback'});
  const after=prepareSite(f.vault);
  assert.deepEqual(after,before);
  assert.equal(fs.existsSync(path.join(f.vault,'blog/首页介绍.md')),false);
  assert.match(fs.readFileSync(path.join(f.vault,'.obsidian/plugins/local-blog-publisher/legacy-site-notes/首页介绍.md'),'utf8'),/原来的首页/);
  assert.equal(fs.readFileSync(path.join(f.vault,'blog/private.md'),'utf8'),'PRIVATE_DRAFT');
  const draft=siteStore.readSite(f.vault);draft.home='设置窗口中的新介绍';draft.values['博客标题']='新标题';siteStore.saveSite(f.vault,draft);
  siteStore.migrateSite(f.vault,parse,{values:{},home:'wrong',about:'wrong'});
  const updated=prepareSite(f.vault);assert.equal(updated.site.title,'新标题');assert.match(updated.entries.get('src/content/pages/home.md').toString(),/设置窗口中的新介绍/);
  assert.doesNotMatch([...updated.entries.values()].join(''),/PRIVATE_GUIDE|PRIVATE_DRAFT|原来的首页/);
 }finally{f.clean();}
});
test('invalid stored drafts never fall back to stale notes, and failed migration leaves originals intact',()=>{
 const f=fixture();
 try{
  const settings=path.join(f.vault,'blog/站点设置.md');fs.writeFileSync(settings,'not frontmatter');
  assert.throws(()=>siteStore.migrateSite(f.vault,parse,{values:{},home:'',about:''}));assert.equal(fs.readFileSync(settings,'utf8'),'not frontmatter');
  fs.mkdirSync(path.dirname(siteStore.storagePath(f.vault)),{recursive:true});fs.writeFileSync(siteStore.storagePath(f.vault),'{broken');
  assert.throws(()=>prepareSite(f.vault));assert.throws(()=>siteStore.migrateSite(f.vault,parse,{}));assert.ok(fs.existsSync(settings));
 }finally{f.clean();}
});
test('settings autosave preserves unrelated external edits and refuses same-field overwrites',()=>{
 const f=fixture();try{
  const base=siteStore.migrateSite(f.vault,parse,{values:{},home:'',about:''}),desired=JSON.parse(JSON.stringify(base)),outside=JSON.parse(JSON.stringify(base));
  desired.values['作者名称']='本地作者';outside.home='别处更新的首页';siteStore.saveSite(f.vault,outside);
  const saved=siteStore.patchSite(f.vault,base,desired);assert.equal(saved.value.home,'别处更新的首页');assert.equal(saved.value.values['作者名称'],'本地作者');
  desired.home='本地也改了首页';assert.throws(()=>siteStore.patchSite(f.vault,base,desired),/别处也有修改/);assert.equal(siteStore.readSite(f.vault).home,'别处更新的首页');
 }finally{f.clean();}
});
test('invalid CSS, links, domain, boolean, dimensions and incomplete comments fail before export',()=>{
 for(const overrides of [{'浅色强调色':'red;display:none'},{'导航链接':['Bad | javascript:alert(1)']},{'正式网址':'https://example.com/subpath'},{'页面宽度':20000},{'显示RSS入口':'false'},{'启用评论':true}]){
  const f=fixture(overrides);try{assert.throws(()=>prepareSite(f.vault));}finally{f.clean();}
 }
});
function remoteFixture(){
 const f=fixture({'博客标题':'站点发布测试'});const dir=fs.mkdtempSync(path.join(os.tmpdir(),'site-publish-'));const repo=path.join(dir,'repo'),remote=path.join(dir,'remote.git');fs.mkdirSync(repo);fs.mkdirSync(path.join(repo,'scripts'));
 const git=(args,cwd=repo)=>{const r=spawnSync('git',args,{cwd,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
 git(['init','--bare',remote],dir);git(['init','-b','main']);git(['config','user.name','Test']);git(['config','user.email','test@example.invalid']);
 for(const file of ['obsidian.mjs','site.mjs','media.mjs','deploy.mjs','sync.mjs','github-transport.mjs'])fs.copyFileSync(path.join(root,'scripts',file),path.join(repo,'scripts',file));
 fs.cpSync(path.join(root,'integrations'),path.join(repo,'integrations'),{recursive:true});fs.symlinkSync(path.join(root,'node_modules'),path.join(repo,'node_modules'),'dir');fs.writeFileSync(path.join(repo,'.gitignore'),'node_modules\n');fs.writeFileSync(path.join(repo,'package.json'),JSON.stringify({type:'module',scripts:{build:'node -e "process.exit(Number(process.env.TEST_BUILD_EXIT || 0))"'}}));
 git(['add','.']);git(['commit','-m','setup']);git(['remote','add','origin',remote]);git(['push','-u','origin','main']);
 return {git,repo,remote,vault:f.vault,invoke:(env={})=>spawnSync(process.execPath,[path.join(repo,'scripts/site.mjs'),'publish',f.vault],{cwd:repo,encoding:'utf8',env:{...process.env,...env}}),clean:()=>{f.clean();fs.rmSync(dir,{recursive:true,force:true});}};
}
test('publication reads the saved settings form with no configuration notes in blog',()=>{
 const t=remoteFixture();
 try{
  const draft=siteStore.migrateSite(t.vault,parse,{values:{},home:'',about:''});draft.home='设置窗口里填写的新首页';draft.values['博客标题']='表单发布';siteStore.saveSite(t.vault,draft);
  const r=t.invoke();assert.equal(r.status,0,r.stderr);assert.match(fs.readFileSync(path.join(t.repo,'src/content/pages/home.md'),'utf8'),/设置窗口里填写的新首页/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(t.repo,'src/config/site.json'),'utf8')).title,'表单发布');
  assert.equal(t.git(['rev-parse','HEAD']),t.git(['rev-parse','refs/heads/main'],t.remote));
  assert.equal(t.git(['status','--porcelain']),'');
 }finally{t.clean();}
});
test('site publication pushes exactly the three site files',()=>{const t=remoteFixture();try{const r=t.invoke();assert.equal(r.status,0,r.stderr);assert.deepEqual(t.git(['diff-tree','--no-commit-id','--name-only','-r','HEAD']).split('\n'),['src/config/site.json','src/content/pages/about.md','src/content/pages/home.md']);assert.equal(t.git(['status','--porcelain']),'');}finally{t.clean();}});
test('site preview stays unchanged on failure and refreshes after successful publication',()=>{
 const t=remoteFixture();
 try{
  fs.appendFileSync(path.join(t.repo,'.gitignore'),'.writing-preview/\n');t.git(['add','.gitignore']);t.git(['commit','-m','ignore local preview']);t.git(['push']);
  const preview=path.join(t.repo,'.writing-preview/src/content/pages/home.md');fs.mkdirSync(path.dirname(preview),{recursive:true});fs.writeFileSync(preview,'旧的首页介绍');
  assert.notEqual(t.invoke({TEST_BUILD_EXIT:'1'}).status,0);assert.equal(fs.readFileSync(preview,'utf8'),'旧的首页介绍');
  const r=t.invoke();assert.equal(r.status,0,r.stderr);
  assert.equal(fs.readFileSync(preview,'utf8'),fs.readFileSync(path.join(t.repo,'src/content/pages/home.md'),'utf8'));
  assert.match(r.stdout,/正式网站：https:\/\//);assert.equal(t.git(['status','--porcelain']),'');
 }finally{t.clean();}
});
test('site build failure rolls back files and index',()=>{const t=remoteFixture();try{assert.notEqual(t.invoke({TEST_BUILD_EXIT:'1'}).status,0);assert.equal(t.git(['status','--porcelain']),'');assert.equal(t.git(['rev-parse','HEAD']),t.git(['rev-parse','refs/heads/main'],t.remote));}finally{t.clean();}});
test('site push failure leaves a clean, retryable commit',()=>{const t=remoteFixture();try{const hook=path.join(t.remote,'hooks/pre-receive');fs.writeFileSync(hook,'#!/bin/sh\nexit 1\n',{mode:0o755});assert.notEqual(t.invoke().status,0);assert.equal(t.git(['status','--porcelain']),'');fs.unlinkSync(hook);const r=t.invoke();assert.equal(r.status,0,r.stderr);assert.equal(t.git(['rev-parse','HEAD']),t.git(['rev-parse','refs/heads/main'],t.remote));}finally{t.clean();}});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { stringify } from 'yaml';
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
test('invalid CSS, links, domain, boolean, dimensions and incomplete comments fail before export',()=>{
 for(const overrides of [{'浅色强调色':'red;display:none'},{'导航链接':['Bad | javascript:alert(1)']},{'正式网址':'https://example.com/subpath'},{'页面宽度':20000},{'显示RSS入口':'false'},{'启用评论':true}]){
  const f=fixture(overrides);try{assert.throws(()=>prepareSite(f.vault));}finally{f.clean();}
 }
});
function remoteFixture(){
 const f=fixture({'博客标题':'站点发布测试'});const dir=fs.mkdtempSync(path.join(os.tmpdir(),'site-publish-'));const repo=path.join(dir,'repo'),remote=path.join(dir,'remote.git');fs.mkdirSync(repo);fs.mkdirSync(path.join(repo,'scripts'));
 const git=(args,cwd=repo)=>{const r=spawnSync('git',args,{cwd,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
 git(['init','--bare',remote],dir);git(['init','-b','main']);git(['config','user.name','Test']);git(['config','user.email','test@example.invalid']);
 for(const file of ['obsidian.mjs','site.mjs'])fs.copyFileSync(path.join(root,'scripts',file),path.join(repo,'scripts',file));
 fs.cpSync(path.join(root,'integrations'),path.join(repo,'integrations'),{recursive:true});fs.symlinkSync(path.join(root,'node_modules'),path.join(repo,'node_modules'),'dir');fs.writeFileSync(path.join(repo,'.gitignore'),'node_modules/\n');fs.writeFileSync(path.join(repo,'package.json'),JSON.stringify({type:'module',scripts:{build:'node -e "process.exit(Number(process.env.TEST_BUILD_EXIT || 0))"'}}));
 git(['add','.']);git(['commit','-m','setup']);git(['remote','add','origin',remote]);git(['push','-u','origin','main']);
 return {git,repo,remote,invoke:(env={})=>spawnSync(process.execPath,[path.join(repo,'scripts/site.mjs'),'publish',f.vault],{cwd:repo,encoding:'utf8',env:{...process.env,...env}}),clean:()=>{f.clean();fs.rmSync(dir,{recursive:true,force:true});}};
}
test('site publication pushes exactly the three site files',()=>{const t=remoteFixture();try{const r=t.invoke();assert.equal(r.status,0,r.stderr);assert.deepEqual(t.git(['diff-tree','--no-commit-id','--name-only','-r','HEAD']).split('\n'),['src/config/site.json','src/content/pages/about.md','src/content/pages/home.md']);assert.equal(t.git(['status','--porcelain']),'');}finally{t.clean();}});
test('site build failure rolls back files and index',()=>{const t=remoteFixture();try{assert.notEqual(t.invoke({TEST_BUILD_EXIT:'1'}).status,0);assert.equal(t.git(['status','--porcelain']),'');assert.equal(t.git(['rev-parse','HEAD']),t.git(['rev-parse','refs/heads/main'],t.remote));}finally{t.clean();}});
test('site push failure leaves a clean, retryable commit',()=>{const t=remoteFixture();try{const hook=path.join(t.remote,'hooks/pre-receive');fs.writeFileSync(hook,'#!/bin/sh\nexit 1\n',{mode:0o755});assert.notEqual(t.invoke().status,0);assert.equal(t.git(['status','--porcelain']),'');fs.unlinkSync(hook);const r=t.invoke();assert.equal(r.status,0,r.stderr);assert.equal(t.git(['rev-parse','HEAD']),t.git(['rev-parse','refs/heads/main'],t.remote));}finally{t.clean();}});

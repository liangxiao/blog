import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {commitBytes,fetchViaAPI,pushViaAPI} from './github-transport.mjs';
function fixture(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'blog-github-')),local=path.join(dir,'local'),server=path.join(dir,'server');fs.mkdirSync(local);
 const call=(cwd,args,input,env={})=>{const r=spawnSync('git',args,{cwd,input,env:{...process.env,...env},maxBuffer:32*1024*1024});assert.equal(r.status,0,r.stderr.toString());return r.stdout;};
 const git=(cwd,args)=>call(cwd,args).toString().trim();
 git(local,['init','-b','main']);git(local,['config','user.name','Test']);git(local,['config','user.email','test@example.invalid']);fs.writeFileSync(path.join(local,'hello.txt'),'original');git(local,['add','.']);git(local,['commit','-m','initial']);git(dir,['clone',local,server]);git(server,['config','user.name','Other']);git(server,['config','user.email','other@example.invalid']);git(local,['remote','add','origin','https://github.com/example/blog.git']);git(local,['update-ref','refs/remotes/origin/main',git(local,['rev-parse','HEAD'])]);
 const updates=[];
 const commit=sha=>{
  const info=git(server,['show','-s','--format=%an%x00%ae%x00%aI%x00%cn%x00%ce%x00%cI',sha]).split('\0'),raw=call(server,['cat-file','-p',sha]).toString();
  return {sha,tree:{sha:git(server,['rev-parse',`${sha}^{tree}`])},parents:git(server,['rev-list','--parents','-n','1',sha]).split(' ').slice(1).map(sha=>({sha})),author:{name:info[0],email:info[1],date:info[2]},committer:{name:info[3],email:info[4],date:info[5]},message:raw.slice(raw.indexOf('\n\n')+2).trimEnd(),verification:{}};
 };
 const api=(endpoint,method='GET',value)=>{
  let m;
  if(method==='GET'&&(m=endpoint.match(/^git\/ref\/heads\/(.+)$/))){const r=spawnSync('git',['rev-parse','--verify',`refs/heads/${m[1]}`],{cwd:server,encoding:'utf8'});return r.status===0?{object:{sha:r.stdout.trim()}}:null;}
  if(method==='GET'&&(m=endpoint.match(/^git\/commits\/(.+)$/)))return commit(m[1]);
  if(method==='GET'&&(m=endpoint.match(/^git\/trees\/(.+)$/)))return {tree:git(server,['ls-tree',m[1]]).split('\n').filter(Boolean).map(line=>{const [meta,name]=line.split('\t'),[mode,type,sha]=meta.split(' ');return {path:name,mode,type,sha};})};
  if(method==='GET'&&(m=endpoint.match(/^git\/blobs\/(.+)$/)))return {encoding:'base64',content:call(server,['cat-file','blob',m[1]]).toString('base64')};
  if(endpoint==='git/blobs'&&method==='POST')return {sha:call(server,['hash-object','-w','--stdin'],Buffer.from(value.content,'base64')).toString().trim()};
  if(endpoint==='git/trees'&&method==='POST'){
   const index=path.join(dir,'api-index'),env={GIT_INDEX_FILE:index};fs.rmSync(index,{force:true});call(server,['read-tree',value.base_tree],undefined,env);
   for(const item of value.tree)call(server,item.sha===null?['update-index','--force-remove',item.path]:['update-index','--add','--cacheinfo',`${item.mode},${item.sha},${item.path}`],undefined,env);
   return {sha:call(server,['write-tree'],undefined,env).toString().trim()};
  }
  if(endpoint==='git/commits'&&method==='POST'){
   const env={GIT_AUTHOR_NAME:value.author.name,GIT_AUTHOR_EMAIL:value.author.email,GIT_AUTHOR_DATE:new Date(value.author.date).toISOString(),GIT_COMMITTER_NAME:value.committer.name,GIT_COMMITTER_EMAIL:value.committer.email,GIT_COMMITTER_DATE:new Date(value.committer.date).toISOString()};
   return {sha:call(server,['commit-tree',value.tree,...value.parents.flatMap(p=>['-p',p])],value.message,env).toString().trim()};
  }
  if(method==='PATCH'&&(m=endpoint.match(/^git\/refs\/heads\/(.+)$/))){assert.equal(value.force,false);updates.push(value);git(server,['merge-base','--is-ancestor',git(server,['rev-parse',m[1]]),value.sha]);git(server,['update-ref',`refs/heads/${m[1]}`,value.sha]);return {object:{sha:value.sha}};}
  throw new Error(`Unexpected mock API request: ${method} ${endpoint}`);
 };
 return {dir,local,server,git,call,api,commit,updates,clean:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
test('verified API fetch imports real Git objects without changing the worktree',()=>{
 const t=fixture();try{
  fs.mkdirSync(path.join(t.server,'nested'));fs.writeFileSync(path.join(t.server,'nested/new.txt'),'from other machine');t.git(t.server,['add','.']);t.git(t.server,['commit','-m','outside edit']);const head=t.git(t.server,['rev-parse','HEAD']),old=t.git(t.local,['rev-parse','HEAD']);
  assert.equal(fetchViaAPI(t.local,{invoke:t.api}),head);assert.equal(t.git(t.local,['rev-parse','origin/main']),head);assert.equal(t.git(t.local,['rev-parse','HEAD']),old);assert.equal(fs.existsSync(path.join(t.local,'nested/new.txt')),false);
  t.git(t.local,['merge','--ff-only','origin/main']);assert.equal(fs.readFileSync(path.join(t.local,'nested/new.txt'),'utf8'),'from other machine');
 }finally{t.clean();}
});
test('API push verifies tree content, never forces refs and preserves a recoverable local commit',()=>{
 const t=fixture();try{
  fs.writeFileSync(path.join(t.local,'hello.txt'),'published content');t.git(t.local,['add','.']);t.call(t.local,['commit','-m','content: publish example'],undefined,{GIT_AUTHOR_DATE:'2026-10-21T10:00:00+08:00',GIT_COMMITTER_DATE:'2026-10-21T10:00:00+08:00'});
  const tree=t.git(t.local,['rev-parse','HEAD^{tree}']),published=pushViaAPI(t.local,'main',{invoke:t.api});
  assert.equal(t.git(t.local,['rev-parse','HEAD']),published);assert.equal(t.git(t.server,['rev-parse','main']),published);assert.equal(t.git(t.local,['rev-parse','HEAD^{tree}']),tree);assert.equal(t.git(t.local,['status','--porcelain']),'');assert.equal(t.updates[0].force,false);
 }finally{t.clean();}
});
test('API push refuses a remote update and leaves the local branch intact',()=>{
 const t=fixture();try{
  fs.writeFileSync(path.join(t.local,'hello.txt'),'local change');t.git(t.local,['add','.']);t.git(t.local,['commit','-m','local']);const before=t.git(t.local,['rev-parse','HEAD']);
  fs.writeFileSync(path.join(t.server,'hello.txt'),'outside change');t.git(t.server,['add','.']);t.git(t.server,['commit','-m','remote']);
  assert.throws(()=>pushViaAPI(t.local,'main',{invoke:t.api}),/不会强制覆盖/);assert.equal(t.git(t.local,['rev-parse','HEAD']),before);assert.equal(t.updates.length,0);
 }finally{t.clean();}
});
test('commit metadata reconstruction rejects unverifiable objects',()=>{assert.throws(()=>commitBytes({sha:'0'.repeat(40),tree:{sha:'1'.repeat(40)},parents:[],author:{name:'A',email:'a@example.invalid',date:'2026-10-21T00:00:00Z'},committer:{name:'A',email:'a@example.invalid',date:'2026-10-21T00:00:00Z'},message:'wrong'}),/无法完整校验/);});

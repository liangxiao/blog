// GitHub API fallback for networks where Git's smart HTTP transport is unavailable.
// Every downloaded object is verified against its Git object ID before refs change.
import {spawnSync} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function git(base,args,input,optional=false){const r=spawnSync('git',args,{cwd:base,input,encoding:input===undefined?'utf8':null,maxBuffer:32*1024*1024});if(r.status!==0||r.error){if(optional)return null;throw new Error('无法读取本地 Git 对象。');}return typeof r.stdout==='string'?r.stdout.trim():r.stdout;}
const preferenceFile=base=>path.resolve(base,git(base,['rev-parse','--git-path','blog-publisher-transport.json']));
export function preferAPI(base){try{return JSON.parse(fs.readFileSync(preferenceFile(base),'utf8')).preferAPI===true;}catch{return false;}}
function rememberAPI(base){fs.writeFileSync(preferenceFile(base),JSON.stringify({preferAPI:true})+'\n');}
function repository(base){
 const origin=git(base,['remote','get-url','origin']);
 const match=origin.match(/^(?:https:\/\/github\.com\/|git@github\.com:)([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/);
 if(!match)throw new Error('API 备用通道仅支持当前 origin 指向的 GitHub 仓库。');return match[1];
}
function client(base,invoke){
 const repo=repository(base);
 return (endpoint,method='GET',value)=>{
  if(invoke)return invoke(endpoint,method,value);
  const args=['api',`repos/${repo}/${endpoint}`,'--method',method];if(value!==undefined)args.push('--input','-');
  const r=spawnSync('gh',args,{cwd:base,input:value===undefined?undefined:JSON.stringify(value),encoding:'utf8',timeout:25000,maxBuffer:32*1024*1024});
  if(r.error||r.status!==0){if(r.status!==0&&/HTTP 404/.test(r.stderr||''))return null;throw new Error('GitHub API 备用通道未完成，请检查网络和 GitHub CLI 登录状态。本地提交已保留。');}
  return JSON.parse(r.stdout);
 };
}
const objectId=(type,data)=>crypto.createHash('sha1').update(Buffer.from(`${type} ${data.length}\0`)).update(data).digest('hex');
function putObject(base,type,data,expected){
 data=Buffer.from(data);if(objectId(type,data)!==expected)throw new Error(`GitHub ${type} 对象校验失败，未更新仓库引用。`);
 const actual=git(base,['hash-object','-w','-t',type,'--stdin'],data).toString().trim();if(actual!==expected)throw new Error('Git 对象写入校验失败。');
}
export function commitBytes(value){
 const {sha,tree,parents,author,committer,message,verification}=value,candidates=[];
 if(verification?.payload&&verification.signature){
  const boundary=verification.payload.indexOf('\n\n');
  for(const signature of [verification.signature,verification.signature.trimEnd()]){
   const header='gpgsig '+signature.replace(/\n/g,'\n ');
   candidates.push(verification.payload.slice(0,boundary)+'\n'+header+verification.payload.slice(boundary));
  }
 }
 const zones=['+0000',...Array.from({length:105},(_,i)=>{const n=(i-48)*15;return `${n<0?'-':'+'}${String(Math.floor(Math.abs(n)/60)).padStart(2,'0')}${String(Math.abs(n)%60).padStart(2,'0')}`})];
 const header=`tree ${tree.sha}\n${parents.map(p=>`parent ${p.sha}\n`).join('')}`;
 const line=(who,person,zone)=>`${who} ${person.name} <${person.email}> ${Math.floor(Date.parse(person.date)/1000)} ${zone}\n`;
 for(const suffix of ['', '\n'])for(const zone of zones)candidates.push(header+line('author',author,zone)+line('committer',committer,zone)+'\n'+message+suffix);
 for(const text of candidates){const data=Buffer.from(text);if(objectId('commit',data)===sha)return data;}
 // Author and committer may have used different time zones.
 for(const a of zones)for(const c of zones)for(const suffix of ['', '\n']){const data=Buffer.from(header+line('author',author,a)+line('committer',committer,c)+'\n'+message+suffix);if(objectId('commit',data)===sha)return data;}
 throw new Error('无法完整校验 GitHub 提交；保留本地内容，不更新引用。');
}
function importer(base,api){
 const exists=sha=>Boolean(git(base,['cat-file','-e',sha],undefined,true)!==null);
 const tree=sha=>{
  if(exists(sha))return;const value=api(`git/trees/${sha}`);if(!value||value.truncated)throw new Error('GitHub 目录读取不完整。');
  const entries=value.tree.slice().sort((a,b)=>Buffer.compare(Buffer.from(a.path+(a.type==='tree'?'/':'')),Buffer.from(b.path+(b.type==='tree'?'/':''))));
  const chunks=[];
  for(const item of entries){
   if(item.type==='tree')tree(item.sha);
   else if(item.type==='blob'&&!exists(item.sha)){
    const data=api(`git/blobs/${item.sha}`);if(data?.encoding!=='base64')throw new Error('GitHub 文件编码不受支持。');putObject(base,'blob',Buffer.from(data.content,'base64'),item.sha);
   }
   if(/[\/\0]/.test(item.path))throw new Error('GitHub 目录条目不合法。');
   chunks.push(Buffer.from(`${item.mode.replace(/^0+/,'')} ${item.path}\0`),Buffer.from(item.sha,'hex'));
  }
  putObject(base,'tree',Buffer.concat(chunks),sha);
 };
 const commit=sha=>{if(exists(sha))return;const value=api(`git/commits/${sha}`);if(!value)throw new Error('GitHub 提交不存在。');for(const parent of value.parents)commit(parent.sha);tree(value.tree.sha);putObject(base,'commit',commitBytes(value),sha);};
 return commit;
}
export function fetchViaAPI(base,{invoke}={}){
 const api=client(base,invoke),ref=api('git/ref/heads/main');if(!ref)throw new Error('GitHub main 分支不存在。');
 importer(base,api)(ref.object.sha);
 const previous=git(base,['rev-parse','--verify','refs/remotes/origin/main'],undefined,true);
 git(base,['update-ref','refs/remotes/origin/main',ref.object.sha,...(previous?[previous]:[])]);rememberAPI(base);return ref.object.sha;
}
export function pushViaAPI(base,branch,{invoke,create=false}={}){
 if(!/^[\w./-]+$/.test(branch)||branch.includes('..'))throw new Error('分支名不合法。');
 if(git(base,['branch','--show-current'])!==branch||git(base,['status','--porcelain']))throw new Error('API 推送需要当前分支和工作区保持干净。');
 const api=client(base,invoke),existing=api(`git/ref/heads/${branch}`),head=git(base,['rev-parse','HEAD']);
 if(!existing&&!create)throw new Error('目标分支不存在，尚未推送。');
 let parent;
 if(existing){parent=existing.object.sha;importer(base,api)(parent);}
 else parent=git(base,['merge-base','HEAD','origin/main']);
 if(git(base,['merge-base','--is-ancestor',parent,'HEAD'],undefined,true)===null)throw new Error('GitHub 有更新，请先同步；不会强制覆盖。');
 const commits=git(base,['rev-list','--reverse',`${parent}..HEAD`]).split('\n').filter(Boolean),uploaded=new Set();
 let published=parent;
 for(const sha of commits){
  const raw=git(base,['show','-s','--format=%an%x00%ae%x00%aI%x00%cn%x00%ce%x00%cI',sha]).split('\0');
  const data=git(base,['cat-file','-p',sha]),split=data.indexOf('\n\n'),message=data.slice(split+2),parents=(data.slice(0,split).match(/^parent /gm)||[]).length;
  if(parents!==1)throw new Error('API 备用推送暂不处理未推送的合并提交。');
  const priorTree=git(base,['rev-parse',`${sha}^^{tree}`]);
  const names=git(base,['diff-tree','--no-commit-id','--name-only','-r','--no-renames',sha]).split('\n').filter(Boolean),tree=[];
  for(const file of names){
   const entry=git(base,['ls-tree',sha,'--',file]);
   if(!entry){tree.push({path:file,sha:null});continue;}
   const match=entry.match(/^(\d+) (\w+) ([a-f0-9]+)\t/);if(!match||match[2]!=='blob')throw new Error('API 推送暂不处理子模块变化。');
   if(!uploaded.has(match[3])){const bytes=spawnSync('git',['cat-file','blob',match[3]],{cwd:base,maxBuffer:32*1024*1024}).stdout;const blob=api('git/blobs','POST',{content:bytes.toString('base64'),encoding:'base64'});if(blob?.sha!==match[3])throw new Error('GitHub 上传文件校验失败。');uploaded.add(match[3]);}
   tree.push({path:file,mode:match[1],type:'blob',sha:match[3]});
  }
  const createdTree=api('git/trees','POST',{base_tree:priorTree,tree}),expectedTree=git(base,['rev-parse',`${sha}^{tree}`]);
  if(createdTree?.sha!==expectedTree)throw new Error('GitHub 上传目录校验失败。');
  const created=api('git/commits','POST',{message,tree:expectedTree,parents:[published],author:{name:raw[0],email:raw[1],date:raw[2]},committer:{name:raw[3],email:raw[4],date:raw[5]}});
  if(!created?.sha)throw new Error('GitHub 提交创建失败。');importer(base,api)(created.sha);published=created.sha;
 }
 if(published===head&&existing?.object.sha===head)return head;
 const updated=existing?api(`git/refs/heads/${branch}`,'PATCH',{sha:published,force:false}):api('git/refs','POST',{ref:`refs/heads/${branch}`,sha:published});
 if(updated?.object?.sha!==published)throw new Error('GitHub 分支更新未完成；本地提交已保留。');
 if(published!==head){
  if(git(base,['rev-parse',`${published}^{tree}`])!==git(base,['rev-parse',`${head}^{tree}`]))throw new Error('提交内容校验不一致，本地分支未变更。');
  git(base,['update-ref',`refs/blog-publisher/backups/${Date.now()}`,head]);git(base,['update-ref',`refs/heads/${branch}`,published,head]);
 }
 git(base,['update-ref',`refs/remotes/origin/${branch}`,published]);rememberAPI(base);return published;
}

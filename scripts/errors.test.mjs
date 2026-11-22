import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {classify,isNetworkError,BlogError} from './errors.mjs';
test('errors are classified into actionable codes for the plugin',()=>{
 assert.equal(classify(new BlogError('x','DEPLOY')),'DEPLOY');
 assert.equal(classify(new Error('图片上传失败。请先在本机运行 npm run media:login 完成 Cloudflare 授权')),'AUTH_CLOUDFLARE');
 assert.equal(classify(new Error('检测到外部修改：首页介绍。请先在博客设置中「同步变化」')),'REMOTE_CHANGED');
 assert.equal(classify(new Error('博客仓库存在未提交的修改，请先处理后再发布。')),'REPO_STATE');
 assert.equal(classify(new Error('The operation was aborted due to timeout')),'NETWORK');
 assert.equal(classify(new Error('请填写文章属性 description。')),'VALIDATION');
 assert.equal(classify(new Error('something odd')),null);
 assert.ok(isNetworkError(Object.assign(new TypeError('fetch failed'),{cause:{code:'UND_ERR_CONNECT_TIMEOUT'}})));
 assert.ok(!isNetworkError(new Error('HTTP 403')));
});
test('cancellation is honoured only at safe checkpoints and consumes the request',async()=>{
 const vault=fs.mkdtempSync(path.join(os.tmpdir(),'blog-cancel-'));
 try{
  const sync=await import('./sync.mjs');
  fs.mkdirSync(path.dirname(sync.cancelFile(vault)),{recursive:true});fs.writeFileSync(sync.cancelFile(vault),'');
  sync.progress(vault,'pushing','正在推送');assert.ok(fs.existsSync(sync.cancelFile(vault)));
  assert.throws(()=>sync.progress(vault,'images','正在上传图片 1/3'),{code:'CANCELLED'});
  assert.ok(!fs.existsSync(sync.cancelFile(vault)));
  sync.progress(vault,'images','正在上传图片 2/3');
 }finally{fs.rmSync(vault,{recursive:true,force:true});}
});

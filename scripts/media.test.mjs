import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {readMediaConfig,articleMedia,siteMedia,uploadMedia} from './media.mjs';
const config={enabled:true,accountId:'a'.repeat(32),bucket:'blog-images',publicBaseUrl:'https://images.example.com'};
const image=Buffer.from('test-image');
const response=(bytes,status=200)=>new Response(bytes,{status});
test('article images become content-addressed public links without copying image binaries to Git',()=>{
 const plan={assets:new Map([['src/assets/blog/test/a.png',image]]),build:draft=>`heroImage: ../../assets/blog/test/a.png\n![image](../../assets/blog/test/a.png)\ndraft: ${draft}`};
 const result=articleMedia(plan,config);
 assert.equal(result.plan.assets.size,0);assert.equal(result.uploads.size,1);
 assert.match(result.plan.build(false),/https:\/\/images.example.com\/blog\/[a-f0-9]{64}\.png/);
 assert.doesNotMatch(result.plan.build(false),/\.\.\/\.\.\/assets/);
 assert.equal(plan.assets.size,1);
});
test('site images deduplicate by content and only exported page/config images are rewritten',()=>{
 const p={entries:new Map([['public/site/a.png',image],['public/site/b.png',image],['src/config/site.json',Buffer.from('{"avatar":"/site/a.png"}')],['src/content/pages/home.md',Buffer.from('![image](/site/b.png)')]])};
 const result=siteMedia(p,config);assert.equal(result.uploads.size,1);assert.equal(result.plan.entries.size,2);
 for(const data of result.plan.entries.values())assert.match(data.toString(),/https:\/\/images.example.com\/blog\//);
 assert.equal(p.entries.size,4);
});
test('R2 uploading checks content-addressed keys with HEAD, retries uploads, and fails closed on 404 or forbidden endpoints',async()=>{
 const {uploads}=articleMedia({assets:new Map([['src/assets/blog/test/a.png',image]]),build:()=>''},config);
 const methods=[];let writes=0;
 await uploadMedia(uploads,config,{fetcher:async(url,init)=>{methods.push(init.method);return response(null);},put:async()=>writes++,wait:0});assert.equal(writes,0);assert.deepEqual(methods,['HEAD']);
 let exists=false;
 const result=await uploadMedia(uploads,config,{fetcher:async()=>exists?response(null):response(null,404),put:async()=>{writes++;exists=true;},wait:0});assert.equal(writes,1);assert.equal(result.uploaded,1);
 await assert.rejects(uploadMedia(uploads,config,{fetcher:async()=>response(null,403),put:async()=>writes++,wait:0}),/公开访问失败/);assert.equal(writes,1);
 await assert.rejects(uploadMedia(uploads,config,{fetcher:async()=>response(null,404),put:async()=>{writes++;},wait:0}),/仍返回 404/);
 let attempts=0;exists=false;
 await uploadMedia(uploads,config,{fetcher:async()=>exists?response(null):response(null,404),put:async()=>{if(++attempts<3)throw new Error('upload failed');exists=true;},wait:0});assert.equal(attempts,3);
 attempts=0;
 await assert.rejects(uploadMedia(uploads,config,{fetcher:async()=>response(null,404),put:async()=>{attempts++;throw new Error('upload failed');},wait:0}),/upload failed/);assert.equal(attempts,3);
 attempts=0;
 const auth=Object.assign(new Error('Cloudflare 授权已过期'),{code:'AUTH_CLOUDFLARE'});
 await assert.rejects(uploadMedia(uploads,config,{fetcher:async()=>response(null,404),put:async()=>{attempts++;throw auth;},wait:0}),{code:'AUTH_CLOUDFLARE'});assert.equal(attempts,1);
});
test('an unreachable public endpoint does not block publishing once Cloudflare confirmed the upload',async()=>{
 const {uploads}=articleMedia({assets:new Map([['src/assets/blog/test/a.png',image]]),build:()=>''},config);
 let writes=0;const progress=[];
 const timeout=async()=>{throw Object.assign(new Error('The operation was aborted due to timeout'),{name:'TimeoutError'});};
 const result=await uploadMedia(uploads,config,{fetcher:timeout,put:async()=>writes++,wait:0,report:p=>progress.push(p)});
 assert.equal(writes,1);assert.equal(result.unverified,1);assert.deepEqual(progress.map(p=>[p.current,p.total]),[[1,1]]);
 const failing=async()=>{throw Object.assign(new TypeError('fetch failed'),{cause:{code:'UND_ERR_CONNECT_TIMEOUT'}});};
 assert.equal((await uploadMedia(uploads,config,{fetcher:failing,put:async()=>writes++,wait:0})).unverified,1);
});
test('machine-only configuration rejects invalid endpoints, account IDs and large/nonimage attachments',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'blog-media-'));
 try{
  assert.equal(readMediaConfig(dir),null);
  for(const invalid of [{...config,publicBaseUrl:'https://key:secret@example.com'},{...config,accountId:'bad'},{...config,publicBaseUrl:'https://account.r2.cloudflarestorage.com'}]){fs.writeFileSync(path.join(dir,'.blog-media.json'),JSON.stringify(invalid));assert.throws(()=>readMediaConfig(dir));}
  fs.writeFileSync(path.join(dir,'.blog-media.json'),JSON.stringify(config));assert.equal(readMediaConfig(dir).bucket,'blog-images');
  assert.throws(()=>articleMedia({assets:new Map([['src/assets/private.md',image]])},config));
  assert.throws(()=>articleMedia({assets:new Map([['src/assets/large.png',Buffer.alloc(21*1024*1024)]])},config));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('static images are resized and compressed before R2 naming, while animated images and SVG remain unchanged',async()=>{
 const sharp=(await import('sharp')).default;
 const {optimizeAssets}=await import('./media.mjs');
 const pixels=Buffer.alloc(2400*1200*3);let seed=42;for(let i=0;i<pixels.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;pixels[i]=seed>>>24;}
 const png=await sharp(pixels,{raw:{width:2400,height:1200,channels:3}}).png().toBuffer();
 const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>');
 const result=await optimizeAssets(new Map([['src/assets/image.png',png],['src/assets/icon.svg',svg]]));
 assert.equal(result.get('src/assets/icon.svg'),svg);
 const image=result.get('src/assets/image.png');assert.equal(image.extension,'.webp');assert.ok(image.data.length<png.length);
 const meta=await sharp(image.data).metadata();assert.equal(meta.width,2000);
 const media=articleMedia({assets:new Map(),build:()=>'![pic](../../assets/image.png)'},config,result);
 assert.match(media.plan.build(false),/https:\/\/images.example.com\/blog\/[a-f0-9]{64}\.webp/);
 assert.equal([...media.uploads.values()].find(v=>v.key.endsWith('.webp')).contentType,'image/webp');
});

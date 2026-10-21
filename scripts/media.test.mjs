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
test('R2 uploading skips existing content, verifies uploaded content, and fails closed on an inaccessible public endpoint',async()=>{
 const {uploads}=articleMedia({assets:new Map([['src/assets/blog/test/a.png',image]]),build:()=>''},config);
 let writes=0;
 await uploadMedia(uploads,config,{fetcher:async()=>response(image),put:async()=>writes++});assert.equal(writes,0);
 let exists=false;
 await uploadMedia(uploads,config,{fetcher:async()=>exists?response(image):response('',404),put:async()=>{writes++;exists=true;}});assert.equal(writes,1);
 await assert.rejects(uploadMedia(uploads,config,{fetcher:async()=>response('',403),put:async()=>writes++}),/公开访问失败/);assert.equal(writes,1);
 await assert.rejects(uploadMedia(uploads,config,{fetcher:async()=>response('',404),put:async()=>{throw new Error('upload failed');}}),/upload failed/);
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

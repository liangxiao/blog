import {test} from 'node:test';
import assert from 'node:assert/strict';
import {serveImage} from '../integrations/r2-image-host.mjs';
const key=`blog/${'a'.repeat(64)}.png`;
function fixture(method='GET',headers={},pathname=`/media/${key}`){
 let reads=0;const tasks=[];
 const context={request:new Request(`https://example.com${pathname}`,{method,headers}),env:{BLOG_IMAGES:{get:async k=>{reads++;assert.equal(k,key);return {body:'image',size:5,httpEtag:'"version-1"'};}}},waitUntil:task=>tasks.push(task)};
 return {context,tasks,reads:()=>reads};
}
test('public image requests return R2 bytes, image metadata and immutable caching',async()=>{
 const f=fixture();let stored;
 const response=await serveImage(f.context,{match:async()=>null,put:async(k,v)=>stored={key:k,body:await v.text()}});
 assert.equal(response.status,200);assert.equal(await response.text(),'image');assert.equal(response.headers.get('Content-Type'),'image/png');assert.match(response.headers.get('Cache-Control'),/immutable/);
 await Promise.all(f.tasks);assert.equal(stored.body,'image');assert.equal(f.reads(),1);
});
test('HEAD and conditional requests avoid returning a body and cache hits avoid R2 reads',async()=>{
 const f=fixture('HEAD');let response=await serveImage(f.context);assert.equal(await response.text(),'');assert.equal(response.headers.get('Content-Length'),'5');
 const conditional=fixture('GET',{'If-None-Match':'W/"version-1"'});response=await serveImage(conditional.context);assert.equal(response.status,304);assert.equal(await response.text(),'');
 const hit=fixture();response=await serveImage(hit.context,{match:async()=>new Response('cached',{headers:{ETag:'"cached-version"'}})});assert.equal(await response.text(),'cached');assert.equal(hit.reads(),0);
});
test('only public content-addressed images can be read; uploads and private keys are rejected',async()=>{
 for(const name of ['/media/private.md','/media/blog/not-a-hash.png','/media/blog/'+ 'a'.repeat(64)+'.html']){
  const f=fixture('GET',{},name),r=await serveImage(f.context);assert.equal(r.status,404);assert.equal(f.reads(),0);assert.equal(r.headers.get('Cache-Control'),'no-store');
 }
 const f=fixture('PUT');assert.equal((await serveImage(f.context)).status,405);assert.equal(f.reads(),0);
 const missing=fixture();missing.context.env.BLOG_IMAGES.get=async()=>null;assert.equal((await serveImage(missing.context)).status,404);
 const unavailable=fixture();delete unavailable.context.env.BLOG_IMAGES;assert.equal((await serveImage(unavailable.context)).status,503);
});

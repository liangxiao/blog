const imageTypes={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',avif:'image/avif',svg:'image/svg+xml'};
const noCache={'Cache-Control':'no-store'};
function respond(request,response){
 const etag=response.headers.get('ETag');
 const matches=request.headers.get('If-None-Match')?.split(',').some(value=>value.trim()==='*'||value.trim().replace(/^W\//,'')===etag);
 if(matches)return new Response(null,{status:304,headers:response.headers});
 return request.method==='HEAD'?new Response(null,{status:response.status,headers:response.headers}):response;
}
export async function serveImage({request,env,waitUntil},cache){
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{...noCache,Allow:'GET, HEAD'}});
 const url=new URL(request.url);
 const match=url.pathname.match(/^\/media\/(blog\/[a-f0-9]{64}\.(png|jpe?g|webp|gif|avif|svg))$/);
 if(!match)return new Response('Image not found',{status:404,headers:noCache});
 url.search='';
 const cacheKey=new Request(url.toString(),{method:'GET'});
 const cached=await cache?.match(cacheKey);
 if(cached)return respond(request,cached);
 if(!env.BLOG_IMAGES)return new Response('Image storage unavailable',{status:503,headers:noCache});
 const object=await env.BLOG_IMAGES.get(match[1]);
 if(!object)return new Response('Image not found',{status:404,headers:noCache});
 const headers=new Headers({
  'Content-Type':imageTypes[match[2]],
  'Content-Length':String(object.size),
  'Cache-Control':'public, max-age=31536000, immutable',
  'ETag':object.httpEtag,
  'X-Content-Type-Options':'nosniff',
  'Access-Control-Allow-Origin':'*',
  'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
 });
 const response=new Response(object.body,{headers});
 if(cache&&waitUntil)waitUntil(cache.put(cacheKey,response.clone()).catch(()=>{}));
 return respond(request,response);
}

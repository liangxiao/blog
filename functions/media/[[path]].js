import {serveImage} from '../../integrations/r2-image-host.mjs';
export function onRequest(context){
 return serveImage(context,caches.default);
}

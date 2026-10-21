import {test} from 'node:test';import assert from 'node:assert/strict';
import {deployPages} from './deploy.mjs';
test('direct deployment targets the configured project and main branch, and reports failure instead of publication success',()=>{
 const config={accountId:'a'.repeat(32),project:'old-rookie',branch:'main'};let called;
 assert.equal(deployPages({config,invoke:args=>{called=args;return {status:0};}}),true);
 assert.deepEqual(called,['pages','deploy','dist','--project-name','old-rookie','--branch','main']);
 assert.throws(()=>deployPages({config,invoke:()=>({status:1})}),/GitHub 内容已保留，但 Cloudflare 部署未完成/);
 assert.equal(deployPages({config:null}),false);
});

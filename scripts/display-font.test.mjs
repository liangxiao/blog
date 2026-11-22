import {test} from 'node:test';
import assert from 'node:assert/strict';
import {collectCharacters, injectFont, FAMILY} from '../integrations/display-font.mjs';
test('only characters rendered in the display face are collected, plus ASCII and CJK punctuation',()=>{
 const chars=collectCharacters(['<h1>企业级 Agent</h1><p>正文不收</p><span class="title">落地&amp;思考</span><blockquote><p>引用</p></blockquote><a class="site-title" href="/">没有终点</a>']);
 for(const ch of '企业级落地思考引用没有终点AZaz&，。「」')assert.ok(chars.includes(ch),ch);
 for(const ch of '正文不收')assert.ok(!chars.includes(ch),ch);
});
test('font preload and @font-face are injected once into the head',()=>{
 const once=injectFont('<html><head><title>x</title></head><body></body></html>','/fonts/wenkai.abc.woff2');
 assert.match(once,/<link rel="preload" href="\/fonts\/wenkai.abc.woff2" as="font" type="font\/woff2" crossorigin>/);
 assert.match(once,new RegExp(`font-family:'${FAMILY}'.*font-display:swap`));
 assert.equal(injectFont(once,'/fonts/wenkai.abc.woff2'),once);
});

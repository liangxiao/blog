import {test} from 'node:test';
import assert from 'node:assert/strict';
import {markdownToHtml} from 'satteri';
import {obsidianParagraphs, obsidianLineBreaks} from '../src/lib/obsidian-line-breaks.mjs';
const render = md => markdownToHtml(md, {mdastPlugins: [obsidianParagraphs, obsidianLineBreaks]}).html;
test('each line of body text and quotes becomes a paragraph, keeping inline formatting',()=>{
 const html=render('第一行\n第二行 **粗体** 和 [链接](https://x.com) `a\nb`\n第三行\n\n> 引用一\n> 引用二');
 assert.match(html,/<p>第一行<\/p>\n<p>第二行 <strong>粗体<\/strong> 和 <a href="https:\/\/x.com">链接<\/a> <code>a b<\/code><\/p>\n<p>第三行<\/p>/);
 assert.match(html,/<blockquote>\n<p>引用一<\/p>\n<p>引用二<\/p>\n<\/blockquote>/);
});
test('list items keep a compact line break and code blocks stay literal',()=>{
 const html=render('- 列表\n  续行\n\n```\n一\n二\n```');
 assert.match(html,/<li>列表<br>\n续行<\/li>/);
 assert.match(html,/<code>一\n二\n<\/code>/);
});

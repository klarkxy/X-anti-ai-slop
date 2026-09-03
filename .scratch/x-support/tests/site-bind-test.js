'use strict';
// 站点绑定 + 知乎 findCards 去重回归 + 作者/覆盖键格式
// 运行：node .scratch/x-support/tests/site-bind-test.js
const fs = require('fs');
const path = require('path');
const { el, documentOf } = require('./mini-dom');

const ROOT = path.join(__dirname, '../../..');
globalThis.chrome = {
  storage: {
    local: { async get() { return {}; }, async set() {} },
    session: { async get() { return {}; }, async set() {} },
  },
};
eval(fs.readFileSync(path.join(ROOT, 'src/shared/constants.js'), 'utf8'));
eval(fs.readFileSync(path.join(ROOT, 'src/content/prose.js'), 'utf8'));
eval(fs.readFileSync(path.join(ROOT, 'src/content/sites/zhihu.js'), 'utf8'));
eval(fs.readFileSync(path.join(ROOT, 'src/content/sites/twitter.js'), 'utf8'));
eval(fs.readFileSync(path.join(ROOT, 'src/content/extract.js'), 'utf8'));

const ZD = globalThis.ZhihuDetector;
const fails = [];
function assert(name, cond, detail) {
  if (cond) console.log('  PASS', name);
  else {
    console.log('  FAIL', name, detail || '');
    fails.push(name);
  }
}

console.log('bindExtract');
assert('默认（无 location）绑知乎', ZD.extract.siteId === 'zhihu');
ZD.bindExtract('x.com');
assert('切到 X', ZD.extract.siteId === 'x' && ZD.extract.noun() === '推文');
ZD.bindExtract('www.zhihu.com');
assert('切回知乎', ZD.extract.siteId === 'zhihu' && ZD.extract.noun() === '回答');

console.log('\n知乎 findCards：外层套内层只留最内层');
const inner = el(
  'div',
  { class: 'ContentItem AnswerItem' },
  el('div', { class: 'RichContent' }, el('p', {}, '回答正文足够长'))
);
const outer = el('div', { class: 'List-item' }, inner);
const page = documentOf(outer);
const cards = ZD.extract.findCards(page);
assert('只返回内层 AnswerItem', cards.length === 1 && cards[0] === inner, String(cards.length));
assert('外层 List-item 被跳过', !cards.includes(outer));

console.log('\n知乎作者仍是裸 people token');
const zCard = el(
  'div',
  { class: 'ContentItem AnswerItem' },
  el(
    'div',
    { class: 'AuthorInfo' },
    el('meta', { itemprop: 'url', content: 'https://www.zhihu.com/people/alice' }),
    el('meta', { itemprop: 'name', content: '爱丽丝' }),
    el('a', { href: '/people/alice' }, '爱丽丝')
  ),
  el('div', { class: 'RichContent' }, el('p', {}, '知乎回答正文'))
);
const author = ZD.extract.getAuthor(zCard);
assert('知乎 token 无 x: 前缀', author && author.token === 'alice', author && author.token);
assert('formatAuthorKey 知乎', ZD.formatAuthorKey('alice') === 'people/alice');
assert('formatAuthorKey X', ZD.formatAuthorKey('x:alice') === '@alice');
assert('formatOverrideKey 推文', ZD.formatOverrideKey('x:123') === '推文 123');
assert('formatOverrideKey 文章', ZD.formatOverrideKey('p99') === '文章 99');
assert('formatOverrideKey 回答', ZD.formatOverrideKey('456') === '回答 456');

if (fails.length) {
  console.log('\nFAIL', fails.length, fails.join(', '));
  process.exit(1);
}
console.log('\nALL SITE-BIND CASES PASS');

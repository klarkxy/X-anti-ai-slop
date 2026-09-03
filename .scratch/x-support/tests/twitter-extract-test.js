'use strict';
// X 提取 / 观察：嵌套不重复、作者键隔离、独立 minChars、SPA 新增节点
// 运行：node .scratch/x-support/tests/twitter-extract-test.js
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
ZD.bindExtract('x.com');
const X = ZD.extract;

function tweet({ handle, name, id, text, extra }) {
  const user = el(
    'div',
    { 'data-testid': 'User-Name' },
    el('a', { href: `/${handle}` }, name || handle),
    el('a', { href: `/${handle}` }, `@${handle}`)
  );
  const body = el('div', { 'data-testid': 'tweetText' }, text);
  const time = el('a', { href: `/${handle}/status/${id}` }, el('time', { datetime: '2026-01-01' }, '1h'));
  const art = el('article', { 'data-testid': 'tweet' }, user, body, time);
  if (extra) art.appendChild(extra);
  return art;
}

const fails = [];
function assert(name, cond, detail) {
  if (cond) console.log('  PASS', name);
  else {
    console.log('  FAIL', name, detail || '');
    fails.push(name);
  }
}

console.log('detectSite / bind');
assert('x.com → x', ZD.detectSite('x.com') === 'x');
assert('twitter.com → x', ZD.detectSite('www.twitter.com') === 'x');
assert('zhihu.com → zhihu', ZD.detectSite('www.zhihu.com') === 'zhihu');
assert('bound siteId x', X.siteId === 'x');

console.log('\nfindCards: 顶层 + 嵌套引用 + 轮播');
const nested = tweet({ handle: 'quoted', name: 'Quoted', id: '99', text: 'quoted body that is long enough' });
const outer = tweet({
  handle: 'alice',
  name: 'Alice',
  id: '11',
  text: 'my comment on the quote is definitely long enough to score',
  extra: nested,
});
const carouselInner = tweet({ handle: 'carol', name: 'Carol', id: '33', text: 'carousel tweet text here is long' });
const carousel = el('div', { 'aria-roledescription': 'carousel' }, carouselInner);
const sibling = tweet({ handle: 'bob', name: 'Bob', id: '22', text: 'a regular timeline tweet that should be scored for sure' });
const root = documentOf(outer, sibling, carousel);

const found = X.findCards(root);
const ids = found.map((c) => X.getTweetId(c)).sort();
assert('两张顶层卡（外层引用 + 普通），不含嵌套/轮播', ids.join(',') === '11,22', ids.join(','));
assert('嵌套 article 不单独入列', !found.includes(nested));
assert('轮播内推文不入列', !found.includes(carouselInner));
assert('root 自身是推文时也能找到', X.findCards(sibling).length === 1);

console.log('\n作者 / 覆盖键隔离');
const author = X.getAuthor(outer);
assert('作者 token 带 x: 前缀', author && author.token === 'x:alice', author && author.token);
assert('作者 name 是展示名', author && author.name === 'Alice', author && author.name);
assert('覆盖键 x:<snowflake>', X.getContentId(outer) === 'x:11');
assert('与知乎 people token 不同键', author.token !== 'alice');

const zhihuPeople = ZD.parseAuthorKey('https://www.zhihu.com/people/alice');
const xHandle = ZD.parseAuthorKey('@alice');
assert('同名 handle 与 people 不同键', zhihuPeople.token === 'alice' && xHandle.token === 'x:alice');
assert('裸 token 仍视为知乎（兼容旧输入）', ZD.parseAuthorKey('alice').site === 'zhihu');
assert('x.com/bob 解析为 X', ZD.parseAuthorKey('https://x.com/bob').token === 'x:bob');
assert('保留路径不当 handle', ZD.parseAuthorKey('https://x.com/home') === null);

console.log('\n文本与 minChars');
const short = tweet({ handle: 's', name: 'S', id: '1', text: 'gm' });
const long = tweet({
  handle: 's',
  name: 'S',
  id: '2',
  text: '这是一条足够长的推文，用来确认不会被知乎 300 字下限误 skip。常见长推应当能打分。',
});
assert('短推 rawLength < 10', X.rawLength(short) < 10);
assert('长推 rawLength > 40', X.rawLength(long) > 40, String(X.rawLength(long)));
assert('默认 xMinChars=40', X.minChars(ZD.DEFAULTS) === 40);
assert('知乎回答下限仍是 300', ZD.DEFAULTS.minChars === 300);
assert('短推应 skip', X.minChars(ZD.DEFAULTS) > X.rawLength(short));
assert('长推能打分', X.rawLength(long) >= X.minChars(ZD.DEFAULTS));
assert('xMinChars=0 关闭下限', X.minChars({ xMinChars: 0 }) === 0);
assert('提取不含引用正文', X.extractCardText(outer, { maxChars: 2000 }).includes('my comment'));
assert('提取不含 quoted body', !X.extractCardText(outer, { maxChars: 2000 }).includes('quoted body'));

console.log('\n观察器：新增节点 / 祖先回退');
const incoming = tweet({ handle: 'new', name: 'New', id: '55', text: 'a newly inserted timeline tweet that must be observed' });
const fromSelf = X.collectFromAdded([incoming]);
assert('整卡插入能被观察到', fromSelf.length === 1 && X.getTweetId(fromSelf[0]) === '55');

const lateText = el('div', { 'data-testid': 'tweetText' }, 'late hydrated tweet text that is long enough');
const shell = el('article', { 'data-testid': 'tweet' },
  el('div', { 'data-testid': 'User-Name' }, el('a', { href: '/late' }, 'Late')),
  el('a', { href: '/late/status/77' }, el('time', {}, 'now'))
);
// 模拟正文后至：added node 是 tweetText，祖先是卡壳
shell.appendChild(lateText);
lateText.parentElement = shell;
lateText.parentNode = shell;
const fromChild = X.collectFromAdded([lateText]);
assert('正文后至能回退到祖先卡', fromChild.length === 1 && fromChild[0] === shell, String(fromChild.length));

const quoteAdded = X.collectFromAdded([nested]);
assert('只插入嵌套引用时不把内层当新卡（外层已在树内则内层 isNested）', quoteAdded.length === 0 || quoteAdded[0] === outer, String(quoteAdded.length));

if (fails.length) {
  console.log('\nFAIL', fails.length, fails.join(', '));
  process.exit(1);
}
console.log('\nALL X EXTRACT/OBSERVE CASES PASS');

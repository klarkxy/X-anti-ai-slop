'use strict';
/**
 * 中文 humanizer 新痕迹：命中、短文本门、旧 traces 不回退、v4 分数不变。
 * 运行：node .scratch/zh-humanizer-signals/tests/new-traces-test.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../../..');
globalThis.chrome = {
  storage: {
    local: { async get() { return {}; }, async set() {} },
    session: { async get() { return {}; }, async set() {} },
  },
};
for (const rel of [
  'src/shared/constants.js',
  'src/engine/traces.js',
  'src/engine/calibrated-weights.js',
  'src/engine/stat-features.js',
  'src/engine/rules.js',
]) {
  eval(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

const ZD = globalThis.ZhihuDetector;
const fails = [];
function assert(name, cond, detail) {
  if (cond) console.log('  PASS', name);
  else {
    console.log('  FAIL', name, detail == null ? '' : String(detail));
    fails.push(name);
  }
}

function byId(id) {
  return ZD.traces.find((t) => t.id === id);
}

function hitsOf(text) {
  return ZD.engine.score(text).hits;
}

function hitIds(text) {
  return hitsOf(text).map((h) => h.id);
}

console.log('清单与计分出口');
assert('共 26 条 traces', ZD.traces.length === 26, ZD.traces.length);
const NEW = ['evidence-overclaim', 'fake-anecdote', 'translationese', 'god-perspective', 'manual-outline'];
assert('5 条 post-sigmoid', NEW.every((id) => ZD.isPostSigmoidTrace(byId(id))));
assert('旧 21 条仍走校准', ZD.traces.filter((t) => !ZD.isPostSigmoidTrace(t)).length === 21);
assert('v4 权重表不含新维', NEW.every((id) => ZD.calibratedWeights.weights[id] === undefined));
assert('v4 权重 version 仍为 4', ZD.calibratedWeights.version === 4);
assert('intercept 未改', ZD.calibratedWeights.intercept === -0.497462);

console.log('\n新痕迹命中');
assert(
  '证据越界：这证明了市场需求',
  byId('evidence-overclaim').test('众筹金额这证明了市场需求已经存在。') >= 1
);
assert(
  '证据越界：充分说明 + 无出处百分比',
  byId('evidence-overclaim').test('转化率提升了 85%，充分说明产品已被市场验证。') >= 1
);
assert(
  '证据越界：有出处百分比放过',
  byId('evidence-overclaim').test('根据统计局报告，转化率提升了 85%，充分说明趋势。') === 0
);
assert(
  '假案例：上周跟某团队聊',
  byId('fake-anecdote').test('上周跟某团队聊，他们说需求已经验证。') >= 1
);
assert(
  '假案例：有位朋友跟我说',
  byId('fake-anecdote').test('有位朋友跟我说这件事其实很简单。') >= 1
);
assert(
  '假案例：真同事不误伤',
  byId('fake-anecdote').test('我上周跟同事吃饭，他把报表改完了。') === 0
);
assert(
  '翻译腔：对于…而言 / 在…的过程中',
  byId('translationese').test('对于用户而言，在使用产品的过程中会感到流畅。') >= 2
);
assert(
  '翻译腔：使得…得以 / 被…所',
  byId('translationese').test('这一安排使得团队得以被市场所认可。') >= 2
);
assert(
  '解释腔：她不知道的是',
  byId('god-perspective').test('她不知道的是，门后已经有人等了很久。') >= 1
);
assert(
  '解释腔：之所以…是因为',
  byId('god-perspective').test('之所以选择这条路，是因为成本更低。') >= 1
);
assert(
  '空洞归纳仍只覆盖这意味着',
  byId('hollow-summary').test('这意味着公司默认不追查。') === 1 &&
    byId('god-perspective').test('这意味着公司默认不追查。') === 0
);

const pad = '（这段只为凑够 200 字门槛，避免短文本统计量误触发。）';
const manual = [
  '核心观点：先把问题说清楚，再谈方案。',
  '背景分析：行业里已经有三家在做同类事。',
  '实践建议：本周只改登录慢和导出失败。',
  '总结展望：先看两周留存，再决定要不要加功能。',
  '补充说明：以上四条都是可执行的下一步，不是口号。',
  pad, pad, pad, pad,
].join('\n');
assert('说明书：段段标签冒号', byId('manual-outline').test(manual) === 1, `${manual.length} ${byId('manual-outline').test(manual)}`);

const mdManual = [
  '下面把方案拆开看，先列事实再写动作，避免空话。',
  '- **核心观点**：先写事实，再写读者要做什么。',
  '- **背景分析**：再写约束，以及为什么现在不能铺开。',
  '- **实践建议**：最后写本周能改的两件事。',
  '这样读起来像说明书，不像一段话，所以应当计说明书结构。',
  pad, pad, pad,
].join('\n');
assert('说明书：加粗+项目符号', byId('manual-outline').test(mdManual) === 1, mdManual.length);

console.log('\n短文本门与非目标词');
const shortTweet = '对于我而言这事没那么复杂，哈哈。';
assert('短推文不计说明书结构', byId('manual-outline').test(shortTweet) === 0);
assert('短于 200 字的清单不计', byId('manual-outline').test('- **A**：x\n- **B**：y\n- **C**：z') === 0);
assert(
  '网文禁用词不入库',
  NEW.every((id) => byId(id).test('他眼中闪过一丝犹豫，然后深吸一口气。') === 0)
);
assert(
  '第一第二第三不当新铁律',
  NEW.every((id) => byId(id).test('第一，价格。第二，质量。第三，服务。') === 0)
);
assert(
  '冒号/破折号不当新铁律',
  NEW.every((id) => byId(id).test('结论：可以做——但要慢一点——再看数据。') === 0)
);

console.log('\n计入分数：sigmoid 后小扣分');
const clean = '今天把报表改完了，数字对得上，晚上早点睡。';
const overText = '众筹刚结束。这证明了市场需求已经起来了。';
const base = ZD.engine.score(clean);
const over = ZD.engine.score(overText);
assert('干净短文无新痕迹', !base.hits.some((h) => NEW.includes(h.id)));
assert('证据越界进入 hits', over.hits.some((h) => h.id === 'evidence-overclaim'));
const ev = over.hits.find((h) => h.id === 'evidence-overclaim');
assert('贡献为负整数扣分', ev && ev.contribution === -4 && ev.scoring === 'post-sigmoid', ev && ev.contribution);
const zCal = over.hits.reduce((s, h) => (h.scoring === 'post-sigmoid' ? s : s + h.contribution), ZD.calibratedWeights.intercept);
const calScore = Math.round(1 / (1 + Math.exp(-zCal)) * 100);
assert('分数 = 同文校准分 − 4（不拼进旧权重）', over.score === Math.max(0, calScore - 4), `${calScore} -> ${over.score}`);

const x40 = '上周跟某团队聊了一下方向。';
assert('X 默认 40 字附近假案例仍可计（词法）', byId('fake-anecdote').test(x40) >= 1);
assert('X 默认 40 字不计说明书', byId('manual-outline').test(x40) === 0);

console.log('\n旧 traces 行为不回退');
assert('开场套话', byId('opening-boilerplate').test('在当今信息爆炸的时代，变化很快。') === 1);
assert('单独最后不误报', byId('connector-skeleton').test('最后我们吃饭去了。') === 0);
assert('首先其次成链', byId('connector-skeleton').test('首先要看数据。其次要看成本。') >= 2);
assert('空洞强调', byId('empty-emphatic').test('值得注意的是，这里有坑。') === 1);
assert('排比模板', byId('tricolon').test('这是工具，是伙伴，更是入口。') === 1);
assert('句号当顿号', byId('period-as-comma').test('苹果。香蕉。橘子。还要买奶。') === 1);
assert('破折号反复', byId('dash-repetition').test('他来了——又走了——没说话。') === 1);
assert('冒号仍计数（人类加分，非禁令）', byId('colon-overuse').test('结论：可以做：分两步。') === 2);
assert('编号式仍计数', byId('numbered-list').test('第一，价格。第二，质量。') === 2);

const literary = '豫章故郡，洪都新府。星分翼轸，地接衡庐。襟三江而带五湖，控蛮荆而引瓯越。';
const lit = ZD.engine.score(literary);
assert('文学短句无新痕迹', !lit.hits.some((h) => NEW.includes(h.id)));

const caseText = fs.readFileSync(
  path.join(ROOT, '.scratch/calibrated-scoring/eval/case-zhihu-answer.txt'),
  'utf8'
);
const caseResult = ZD.engine.score(caseText);
assert('误报案仍 44', caseResult.score === 44, caseResult.score);
assert(
  '误报案不吃新扣分',
  !caseResult.hits.some((h) => NEW.includes(h.id)),
  caseResult.hits.map((h) => h.id).join(',')
);

const humanKol = '亲爱的读者，家人们，朋友们，苹果。香蕉。橘子。结论：可以做。';
const kol = ZD.engine.score(humanKol);
assert(
  '人类信号痕迹仍在权重里（伪亲密/句号当顿号/冒号）',
  ['fake-intimacy', 'period-as-comma', 'colon-overuse'].every((id) => hitIds(humanKol).includes(id)),
  hitIds(humanKol).join(',')
);
assert('人类信号贡献为正', kol.hits.filter((h) => ['fake-intimacy', 'period-as-comma'].includes(h.id)).every((h) => h.contribution > 0));

if (fails.length) {
  console.log('\nFAIL', fails.length, fails.join(', '));
  process.exit(1);
}
console.log('\nALL NEW-TRACE CASES PASS');

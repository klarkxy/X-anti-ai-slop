#!/usr/bin/env node
/**
 * v5 联合拟合入口：21 校准维 + 5 条中文 humanizer 新痕迹 + 4 统计特征。
 *
 * 数据齐（dataset.jsonl 人类 + answers.jsonl flash）时：
 *   7 种子分层切分 baked 均值，与 v4b 同一套 C-ReD+flash。
 *   方向不稳（跨种子 sd > |mean|）或基率近 0 的新维置零，禁止硬塞正权重。
 * 数据不齐时：退出码 2，不改 src/engine/calibrated-weights.js。
 *
 * 运行：node .scratch/calibrated-scoring/eval/pilot/fit-v5-new-traces.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '../../../..');
require(path.join(ROOT, 'src/shared/constants.js'));
require(path.join(ROOT, 'src/engine/traces.js'));
require(path.join(ROOT, 'src/engine/stat-features.js'));
const ZD = globalThis.ZhihuDetector;

const HUMAN = path.join(__dirname, '..', 'dataset.jsonl');
const FLASH = path.join(__dirname, 'answers.jsonl');
const WEIGHTS_OUT = path.join(ROOT, 'src/engine/calibrated-weights.js');

const EXISTING_ZERO = new Set([
  'meta-commentary', 'inspirational-closer', 'idiom-cluster', 'dead-metaphor', 'fake-colloquial',
]);
const NEW_IDS = ZD.traces.filter((t) => ZD.isPostSigmoidTrace(t)).map((t) => t.id);

function dataReady() {
  return fs.existsSync(HUMAN) && fs.existsSync(FLASH);
}

function rng(s) {
  let a = s >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(a, r) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const sig = (z) => 1 / (1 + Math.exp(-z));

function fitLogistic(X, y) {
  const n = X.length;
  const d = X[0].length;
  const w = new Array(d).fill(0);
  let b = 0;
  const lr = 0.5;
  const lambda = 0.01;
  const epochs = 400;
  for (let e = 0; e < epochs; e++) {
    const gw = new Array(d).fill(0);
    let gb = 0;
    for (let k = 0; k < n; k++) {
      const z = b + X[k].reduce((s, x, i) => s + w[i] * x, 0);
      const p = sig(z);
      const df = p - y[k];
      for (let i = 0; i < d; i++) gw[i] += df * X[k][i];
      gb += df;
    }
    for (let i = 0; i < d; i++) {
      gw[i] = gw[i] / n + lambda * w[i];
      w[i] -= lr * gw[i];
    }
    b -= lr * (gb / n);
  }
  return { w, b };
}

function rowX(text) {
  return [...ZD.traces.map((t) => t.test(text)), ...ZD.computeStatFeatures(text)];
}

async function loadJsonl(file, label) {
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  const rows = [];
  for await (const line of rl) {
    if (!line.trim()) continue;
    const r = JSON.parse(line);
    if (label === 1 && r.label !== 1) continue;
    rows.push({ label: label === 0 ? 0 : r.label, x: rowX(r.text) });
  }
  return rows;
}

async function main() {
  if (!dataReady()) {
    console.log('v5 联合拟合跳过：缺少 C-ReD dataset.jsonl 或 flash answers.jsonl。');
    console.log('  需要：');
    console.log('    ' + HUMAN);
    console.log('    ' + FLASH);
    console.log('生产权重保持 v4；新痕迹走 scoring:post-sigmoid 小扣分。');
    console.log('数据齐后重跑本脚本：方向不稳 / 基率近 0 的新维置零，不硬塞正权重。');
    process.exit(2);
  }

  const humans = await loadJsonl(HUMAN, 1);
  const flash = await loadJsonl(FLASH, 0);
  const D = humans[0].x.length;
  const D_LEX = ZD.traces.length;
  const seeds = [20260828, 1, 42, 7, 123, 999, 5555];
  const wsum = new Array(D).fill(0);
  const wsq = new Array(D).fill(0);
  let bsum = 0;

  for (const s of seeds) {
    const rand = rng(s);
    const h = shuffle([...humans], rand);
    const f = shuffle([...flash], rand);
    const nHt = Math.round(h.length * 0.2);
    const nFt = Math.round(f.length * 0.2);
    const train = [...h.slice(nHt), ...f.slice(nFt)];
    const mean = new Array(D).fill(0);
    const std = new Array(D).fill(0);
    for (const r of train) for (let i = 0; i < D; i++) mean[i] += r.x[i];
    for (let i = 0; i < D; i++) mean[i] /= train.length;
    for (const r of train) for (let i = 0; i < D; i++) std[i] += (r.x[i] - mean[i]) ** 2;
    for (let i = 0; i < D; i++) std[i] = Math.sqrt(std[i] / train.length) || 1;
    const trS = train.map((r) => ({
      label: r.label,
      x: r.x.map((v, i) => (v - mean[i]) / std[i]),
    }));
    const fitM = fitLogistic(trS.map((r) => r.x), trS.map((r) => r.label));
    for (let i = 0; i < D; i++) {
      const baked = fitM.w[i] / std[i];
      wsum[i] += baked;
      wsq[i] += baked * baked;
    }
    bsum += fitM.b - fitM.w.reduce((s, wv, i) => s + (wv * mean[i]) / std[i], 0);
  }

  const w = wsum.map((v) => v / seeds.length);
  const sd = wsum.map((_, i) => {
    const m = w[i];
    const v = wsq[i] / seeds.length - m * m;
    return Math.sqrt(Math.max(0, v));
  });
  const b = bsum / seeds.length;

  const hit = (rows, i) => rows.filter((r) => r.x[i] > 0).length / rows.length;
  ZD.traces.forEach((t, i) => {
    if (EXISTING_ZERO.has(t.id)) {
      w[i] = 0;
      return;
    }
    if (!NEW_IDS.includes(t.id)) return;
    const hr = hit(humans, i);
    const fr = hit(flash, i);
    const unstable = sd[i] > Math.abs(w[i]);
    const nearZero = hr < 0.01 && fr < 0.01;
    if (unstable || nearZero) {
      console.log('ZERO', t.id, { w: +w[i].toFixed(4), sd: +sd[i].toFixed(4), hr, fr, unstable, nearZero });
      w[i] = 0;
    } else {
      console.log('KEEP', t.id, { w: +w[i].toFixed(4), sd: +sd[i].toFixed(4), hr, fr });
    }
  });

  const wMap = {};
  ZD.traces.forEach((t, i) => {
    wMap[t.id] = +w[i].toFixed(6);
  });
  const statWeights = w.slice(D_LEX).map((v) => +v.toFixed(6));
  const js = `/**
 * 校准打分权重（v5：v4 词法+统计 + 中文 humanizer 新维联合拟合）
 * 拟合数据：C-ReD question-answer 人类 + deepseek-v4-flash
 * 拟合日期：${new Date().toISOString().slice(0, 10)} · 模型：逻辑回归（L2，平衡训练，7 种子 baked 均值）
 * 新维不稳 / 基率近 0 已置零。
 */
(() => {
'use strict';
const ZD = globalThis.ZhihuDetector;
ZD.calibratedWeights = {
  version: 5,
  fittedOn: 'C-ReD question-answer (human + deepseek-v4-flash) + humanizer traces + statistical features',
  fittedAt: '${new Date().toISOString().slice(0, 10)}',
  samples: { human: ${humans.length}, ai: ${flash.length} },
  intercept: ${+b.toFixed(6)},
  weights: ${JSON.stringify(wMap, null, 2)},
  statWeights: ${JSON.stringify(statWeights)},
};
})();
`;
  fs.writeFileSync(WEIGHTS_OUT, js);
  console.log('weights ->', WEIGHTS_OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

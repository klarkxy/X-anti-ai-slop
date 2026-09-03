#!/usr/bin/env node
/**
 * 特征提取（单一事实源）：直接加载扩展自身的 constants.js + traces.js，
 * 对每条样本计算与内容脚本完全一致的命中数向量（cap 前）与现扣分制基线分。
 * 输出 features.jsonl：{ label, x: number[21], baseline: number }
 * （只含 v4 校准维；post-sigmoid 新痕迹不进向量）
 */
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '../../..');
require(path.join(ROOT, 'src/shared/constants.js'));
require(path.join(ROOT, 'src/engine/traces.js'));
const ZD = globalThis.ZhihuDetector;
const LEX = ZD.traces.filter((t) => !(ZD.isPostSigmoidTrace && ZD.isPostSigmoidTrace(t)));

const IN = path.join(__dirname, 'dataset.jsonl');
const OUT = path.join(__dirname, 'features.jsonl');

/** 与 src/engine/rules.js score() 相同的加性扣分逻辑（基线；仅 v4 校准维） */
function baselineScore(text) {
  let total = 0;
  for (const trace of LEX) {
    const count = trace.test(text);
    if (count > 0) total += Math.min(count, trace.cap) * trace.weight;
  }
  return Math.max(0, 100 - total);
}

async function main() {
  const rl = readline.createInterface({ input: fs.createReadStream(IN), crlfDelay: Infinity });
  const out = fs.createWriteStream(OUT);
  let n = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    const { text, label } = JSON.parse(line);
    // 只抽 v4 校准维：post-sigmoid 新痕迹不进旧 21 维，避免误跑 fit.js 打坏权重表
    const x = LEX.map((t) => t.test(text)); // cap 前命中数
    out.write(JSON.stringify({ label, x, baseline: baselineScore(text) }) + '\n');
    n++;
  }
  out.end();
  await new Promise((r) => out.on('finish', r));
  console.log(`features written: ${n} rows -> ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

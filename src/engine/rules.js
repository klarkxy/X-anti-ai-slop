/**
 * 知乎照妖镜 — 规则引擎（初审）
 * 校准打分（票 02，默认启用）：score = round(σ(Σ w_i·x_i + Σ sw_j·stat_j + b) × 100)，
 * 权重来自 C-ReD 逻辑回归拟合（src/engine/calibrated-weights.js），
 * 统计特征来自 src/engine/stat-features.js（票 10，方案 B）。
 * 标了 scoring:'post-sigmoid' 的内置痕迹（本轮 5 条中文 humanizer 信号）
 * 不进 v4 权重向量，sigmoid 之后按 weight/cap 小幅扣分——与自定义正则同一出口，
 * 避免把未拟合新维拼进旧 21 维权重。短于 minChars 的统计型新痕迹不计。
 * 回退开关 USE_CALIBRATED = false 时回到旧加性扣分制（score = 100 − Σ deduct）。
 * 统计特征开关 USE_STAT_FEATURES = false 时退回纯词法 v3 语义。
 * 输出 { score, hits }，hits 为命中清单（用于"点击看理由"）。
 * 依赖：constants.js、traces.js、calibrated-weights.js、stat-features.js（先加载）。
 */
(() => {
'use strict';
const ZD = globalThis.ZhihuDetector;

/** 代码级回退开关：false = 旧加性扣分制（与校准上线前行为完全一致） */
const USE_CALIBRATED = true;
/** 代码级统计特征开关：false = 纯词法（v3 语义），true = 词法+统计（v4） */
const USE_STAT_FEATURES = true;

const sigmoid = (z) => 1 / (1 + Math.exp(-z));

ZD.engine = {
  /**
   * @param {string} text 输入窗口文本
   * @param {Array<{id,name,pattern,weight,cap}>} [extraTraces] 用户自定义正则规则
   * @returns {{ score: number, hits: Array<{id,name,deduct|contribution,count}> }}
   */
  score(text, extraTraces) {
    if (USE_CALIBRATED && ZD.calibratedWeights) return scoreCalibrated(text, extraTraces);
    return scoreDeduct(text, extraTraces);
  },

  /**
   * 把分数映射为等级（依赖阈值设置）。
   * @returns {{level: string, label: string}} level 取 ZD.LEVEL
   */
  levelOf(score, settings) {
    if (score <= settings.thresholdConfirm) return { level: ZD.LEVEL.CONFIRM_AI, label: '确定 AI' };
    if (score <= settings.thresholdSuspect) return { level: ZD.LEVEL.SUSPECT_AI, label: '疑似 AI' };
    return { level: ZD.LEVEL.NORMAL, label: '正常' };
  },
};

/** 短文本门：说明书结构等统计量在 X 默认 40 字上不稳 */
function longEnough(trace, text) {
  return !trace.minChars || text.length >= trace.minChars;
}

/** 统计每条痕迹的命中数（内置 test 函数 / 用户正则全局匹配，共用实现） */
function countHits(trace, text) {
  if (!longEnough(trace, text)) return 0;
  if (typeof trace.test === 'function') return trace.test(text);
  if (trace.pattern) {
    // 用户自定义规则：正则全局匹配计数；无效正则在保存时已被拦截，此处兜底忽略
    try {
      return (text.match(new RegExp(trace.pattern, 'g')) || []).length;
    } catch {
      return 0;
    }
  }
  return 0;
}

/** 校准打分：内置痕迹按学习权重贡献 logit，统计特征贡献 logit，自定义规则按原扣分叠加 */
function scoreCalibrated(text, extraTraces) {
  const W = ZD.calibratedWeights;
  const builtin = ZD.traces;
  const custom = extraTraces && extraTraces.length ? extraTraces : [];
  const hits = [];
  let z = W.intercept;
  for (const trace of builtin) {
    // 未拟合新维不得拼进旧权重：无表项 / 置零 / post-sigmoid 一律跳过 logit
    if (ZD.isPostSigmoidTrace && ZD.isPostSigmoidTrace(trace)) continue;
    const w = W.weights[trace.id] || 0;
    if (w === 0) continue; // 置零的噪声特征跳过 test()（推理侧减负，不影响 eval 流水线）
    const count = countHits(trace, text);
    if (count === 0) continue;
    const contribution = count * w;
    hits.push({ id: trace.id, name: trace.name, count, contribution });
    z += contribution;
  }
  // 统计特征（票 10，方案 B）：连续值 × 权重贡献 logit，与词法命中并列
  if (USE_STAT_FEATURES && W.statWeights && ZD.computeStatFeatures) {
    const stats = ZD.computeStatFeatures(text);
    const names = ZD.statFeatureNames || [];
    for (let i = 0; i < stats.length; i++) {
      const sw = W.statWeights[i] || 0;
      if (sw === 0) continue;
      const contribution = stats[i] * sw;
      // 统计特征无"命中次数"，count 字段省略；面板显示数值与贡献
      hits.push({ id: 'stat-' + i, name: names[i] || ('统计' + i), value: +stats[i].toFixed(3), contribution });
      z += contribution;
    }
  }
  let score = Math.round(sigmoid(z) * 100);
  // 待联合拟合的内置新痕迹：与自定义正则同一出口（sigmoid 后小幅扣分）
  for (const trace of builtin) {
    if (!(ZD.isPostSigmoidTrace && ZD.isPostSigmoidTrace(trace))) continue;
    const count = countHits(trace, text);
    if (count === 0) continue;
    const deduct = Math.min(count, trace.cap) * trace.weight;
    hits.push({ id: trace.id, name: trace.name, count, contribution: -deduct, scoring: 'post-sigmoid' });
    score = Math.max(0, score - deduct);
  }
  // 用户自定义正则 = 显式强信号：保留原扣分语义（分数尺度叠加，不稀释）
  for (const trace of custom) {
    const count = countHits(trace, text);
    if (count === 0) continue;
    const deduct = Math.min(count, trace.cap) * trace.weight;
    hits.push({ id: trace.id, name: trace.name, count, contribution: -deduct });
    score = Math.max(0, score - deduct);
  }
  return { score, hits };
}

/** 旧加性扣分制（回退开关用，与校准上线前行为一致） */
function scoreDeduct(text, extraTraces) {
  const hits = [];
  let total = 0;
  const all = extraTraces && extraTraces.length ? [...ZD.traces, ...extraTraces] : ZD.traces;
  for (const trace of all) {
    const count = countHits(trace, text);
    if (count > 0) {
      const capped = Math.min(count, trace.cap);
      const deduct = capped * trace.weight;
      hits.push({ id: trace.id, name: trace.name, deduct, count });
      total += deduct;
    }
  }
  return { score: Math.max(0, 100 - total), hits };
}
})();

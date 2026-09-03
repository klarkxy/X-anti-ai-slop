/**
 * 照妖镜 — 站点适配绑定
 * 按 hostname 选择知乎 / X 适配器，挂到 ZD.extract（内容脚本统一入口）。
 * 依赖：constants.js、prose.js、sites/zhihu.js、sites/twitter.js（先加载）。
 */
(() => {
'use strict';
const ZD = globalThis.ZhihuDetector;

ZD.detectSite = function detectSite(host) {
  const raw = host !== undefined && host !== null
    ? host
    : (typeof location !== 'undefined' ? location.hostname : '');
  const h = String(raw).replace(/^www\./, '').toLowerCase();
  if (h === 'x.com' || h === 'twitter.com' || h.endsWith('.x.com') || h.endsWith('.twitter.com')) {
    return ZD.SITE.X;
  }
  return ZD.SITE.ZHIHU;
};

/**
 * 绑定当前站点的 DOM 提取实现。测试可传入 host 覆盖。
 * @param {string} [host]
 */
ZD.bindExtract = function bindExtract(host) {
  const siteId = ZD.detectSite(host);
  const adapter = (ZD.adapters && ZD.adapters[siteId]) || (ZD.adapters && ZD.adapters.zhihu) || {};
  const prose = ZD.prose || {};
  ZD.extract = Object.assign({}, prose, adapter, { siteId });
  return ZD.extract;
};

ZD.bindExtract();
})();

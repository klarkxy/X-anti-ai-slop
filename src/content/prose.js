/**
 * 照妖镜 — 站点无关的散文提取
 * 段落切分、代码/嵌入剔除、输入窗口抽样。知乎与 X 适配器共用。
 * 依赖：constants.js（先加载）。
 */
(() => {
'use strict';
const ZD = globalThis.ZhihuDetector;

ZD.prose = {
  /** 真实正文块元素：跳过内嵌卡片/图片占位(noscript)/元数据，只取正文。 */
  BODY_BLOCK_SELECTOR: 'p, li, blockquote, h1, h2, h3, h4, h5, h6',

  /** 非散文内容（代码/技术/嵌入物）：不参与任何写作特征计数。
   *  块级 pre 不在 BODY_BLOCK_SELECTOR 中（整体跳过）；行内 code 等从
   *  段落文本中剔除。理由：代码/配置不是写作痕迹，引号、冒号、编号等
   *  特征若在代码上线性计数会外推爆分（如 JSON 配置的英文引号 → 判 0 分）。
   *  注意：只按标签/知乎专用类匹配，勿用泛化的 [class*="..."] 猜测——
   *  知乎的划词高亮 .highlight-wrap 包裹的仍是作者正文（曾误伤）。 */
  NON_PROSE_SELECTOR: 'pre, code, kbd, samp, tt, math, .ztext-math, figure, figcaption, video, audio, iframe, embed, object, canvas, template, .ztext-video',

  /** 提取单块的散文文本：克隆后剔除代码/嵌入内容，避免其文本参与特征计数 */
  proseTextOf(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll(ZD.prose.NON_PROSE_SELECTOR).forEach((n) => n.remove());
    return clone.textContent.trim();
  },

  /** 剔除段尾孤悬全角冒号（冒号后紧跟换行或文末，如「prompt 如下：」+ 图片被剔除后的残渣）。
   *  issue 11：图文穿插排版的手写回答，图片/嵌入内容被 NON_PROSE_SELECTOR 剔除后文字流
   *  只剩一串指向图片的段尾冒号——不是写作痕迹，不参与任何特征计数（词法 colon-overuse
   *  与统计 punctDensity 同源豁免）。与训练语料的段尾孤悬定义（`：` 后接 \n 或文末）一致。
   *  @param {string} text */
  stripDanglingColons(text) {
    return text.replace(/：+(?=\n|$)/g, '');
  },

  /**
   * 提取正文段落（共用实现：块级正文元素优先，兜底整段切分）。
   * 知乎正文以 <p> 为主；NOSCRIPT 里的图片标记文本、内嵌卡片动态数字
   * （如"50 赞同 · 1 评论"）都被排除，避免内容级哈希不稳定。
   * @param {Element|null} bodyEl 正文容器元素
   * @returns {string[]}
   */
  paragraphsOf(bodyEl) {
    if (!bodyEl) return [];
    let paras = Array.from(bodyEl.querySelectorAll(ZD.prose.BODY_BLOCK_SELECTOR))
      // 代码/嵌入容器内的块级元素（如 pre 里的 li）一并跳过
      .filter((el) => !el.closest(ZD.prose.NON_PROSE_SELECTOR))
      .map((el) => ZD.prose.proseTextOf(el))
      .filter(Boolean);
    if (paras.length === 0) {
      // 兜底：无块级正文时退回整段文本（按换行切分），同样剔除代码/嵌入内容
      const clone = bodyEl.cloneNode(true);
      clone.querySelectorAll(ZD.prose.NON_PROSE_SELECTOR).forEach((n) => n.remove());
      paras = clone.textContent
        .split(/\n+/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    // 剔除段尾孤悬冒号（图片/嵌入内容被剔除后的残渣，issue 11）：两条路径统一处理
    paras = paras.map((s) => ZD.prose.stripDanglingColons(s)).filter(Boolean);
    // 跳过开头的图片占位/来源行
    while (paras.length && /^(\[图片\]|图片|图\d|via|来自|图片来源)/.test(paras[0])) paras.shift();
    // 跳过开头的引用段落（以引号起始的整段）
    while (paras.length > 1 && /^[「『“《]/.test(paras[0])) paras.shift();
    return paras;
  },

  /** 跳过与标题重复的首段（详情页/列表卡标题都可能重复出现在正文首段）。 */
  dropTitleDup(paras, titleEl) {
    if (paras.length && titleEl && paras[0] === titleEl.textContent.trim()) paras.shift();
    return paras;
  },

  /**
   * 文章输入窗口文本（共用实现）：head = 开头两段；headtail（默认）= 头尾
   * 各取上限一半（万字长文也能覆盖结尾套话）；full = 全文截断至上限。
   * @param {string[]} paras 正文段落
   * @param {string} mode 抽样模式 'headtail' | 'full' | 'head'
   * @param {number} max 输入窗口字数上限
   * @returns {string}
   */
  windowText(paras, mode, max) {
    if (paras.length === 0) return '';
    if (mode === 'head') return paras.slice(0, 2).join('\n');
    const body = paras.join('\n');
    if (mode === 'headtail' && max > 0 && body.length > max) {
      // 省略标记计入上限：头尾各取 (max−标记长)/2，总长 ≤ max（默认 4000）
      const marker = '\n……（中段省略）……\n';
      const half = Math.floor((max - marker.length) / 2);
      return body.slice(0, half) + marker + body.slice(-half);
    }
    if (max > 0 && body.length > max) return body.slice(0, max);
    return body;
  },
};
})();

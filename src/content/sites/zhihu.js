/**
 * 照妖镜 — 知乎站点适配
 * 选择器集中于此文件维护（知乎类名常变，单点修复）。
 * 依赖：constants.js、prose.js（先加载）。
 */
(() => {
'use strict';
const ZD = globalThis.ZhihuDetector;
ZD.adapters = ZD.adapters || {};

const CARD_SELECTOR = '.List-item, .Card.AnswerCard, .ContentItem.AnswerItem, .AnswerItem, .ContentItem.ArticleItem, .ArticleItem';
const BODY_SELECTOR = '.RichContent-inner, .RichContent';
const ARTICLE_CARD_SELECTOR = '.Post-Main, .Post-NormalMain';
const ARTICLE_BODY_SELECTOR = '.Post-RichTextContainer';
const ARTICLE_TITLE_SELECTOR = 'h1.Post-Title';

ZD.adapters.zhihu = {
  siteId: ZD.SITE.ZHIHU,
  hasArticleDetail: true,

  /** 回答/文章列表卡片候选选择器（文章卡 .ContentItem.ArticleItem 与回答卡同构：
   *  折叠摘要 RichContent + 阅读全文；纳入后 findCards 一并返回） */
  CARD_SELECTOR,
  BODY_SELECTOR,
  ARTICLE_CARD_SELECTOR,
  ARTICLE_BODY_SELECTOR,
  ARTICLE_TITLE_SELECTOR,

  /**
   * 在 root 内查找判定卡片（回答卡 + 文章列表卡），去重并过滤掉不含正文的容器。
   * 知乎去重：外层套内层时只留最内层，避免同一回答渲染重叠角标。
   * @param {ParentNode} root
   * @returns {Element[]}
   */
  findCards(root) {
    if (!root || !root.querySelectorAll) return [];
    const cards = [];
    const seen = new Set();
    const consider = (node) => {
      if (!node || seen.has(node)) return;
      if (!node.matches || !node.matches(CARD_SELECTOR)) return;
      // 通用去重：若 node 内部还包含更具体的回答卡片容器（如
      // .Card.AnswerCard 内嵌 .ContentItem.AnswerItem），node 只是外层
      // 容器，跳过，只保留最内层卡片，避免同一回答渲染重叠角标。
      if (node.querySelector(CARD_SELECTOR)) return;
      if (!node.querySelector(BODY_SELECTOR)) return;
      seen.add(node);
      cards.push(node);
    };
    // SPA 新增节点本身就是卡片时，querySelectorAll 不含自身
    consider(root);
    const nodes = root.querySelectorAll(CARD_SELECTOR);
    for (const node of nodes) consider(node);
    return cards;
  },

  /**
   * 提取卡片作者：zhihu.com/people/<token> 为主键（稳定），昵称仅用于显示。
   * 来源：知乎 SSR 输出的 meta[itemprop="url"/"name"]（稳定）优先，
   *      兜底 a.UserLink-link（协议相对 //www.zhihu.com/people/…）。
   * 匿名回答：有 .AuthorInfo 但无 people 链接 → { anonymous: true }；
   * 无作者信息（非标准卡片）→ null。
   * @returns {{token:string,name:string}|{anonymous:true}|null}
   */
  getAuthor(card) {
    const info = card.querySelector('.AuthorInfo');
    if (!info) return null;

    let token = null;
    const metaUrl = info.querySelector('meta[itemprop="url"]');
    const urlContent = metaUrl && metaUrl.getAttribute('content');
    if (urlContent) {
      const m = urlContent.match(/\/people\/([^/?]+)/);
      if (m) token = m[1];
    }
    if (!token) {
      const link = info.querySelector('a[href*="/people/"]');
      const href = link && link.getAttribute('href');
      if (href) {
        const m = href.match(/\/people\/([^/?]+)/);
        if (m) token = m[1];
      }
    }
    if (!token) return { anonymous: true };

    let name = '';
    const metaName = info.querySelector('meta[itemprop="name"]');
    if (metaName && metaName.getAttribute('content')) {
      name = metaName.getAttribute('content').trim();
    }
    if (!name) {
      const link = info.querySelector('a[href*="/people/"]');
      if (link) name = link.textContent.trim();
    }
    return { token, name };
  },

  /** 官方「包含 AI 辅助创作」创作声明文本（见 zhuanlan.zhihu.com/p/624717941 治理细则）。
   *  挂在卡片时间区 .ContentItem-time 内（SSR 首帧即存在，回答卡/文章卡/文章详情页共用）；
   *  外层 div 是 hash 类名（实测 css-18biwo），不可依赖，只匹配稳定文本。 */
  AI_DECLARATION_RE: /包含\s*AI\s*辅助创作/,

  /**
   * 卡片是否带「包含 AI 辅助创作」官方创作声明。
   * 作者已自认内容含 AI 辅助 → 跳过整条评分管线（提取/规则/二审）。
   * @param {Element} card 回答卡 / 文章列表卡 / 文章详情容器
   * @returns {boolean}
   */
  hasAiDeclaration(card) {
    if (!card) return false;
    const t = card.querySelector('.ContentItem-time');
    if (!t) return false;
    return this.AI_DECLARATION_RE.test(t.textContent || '');
  },

  /**
   * 从卡片提取回答 ID：优先 /answer/<aid> 链接。
   * @returns {string|null}
   */
  getAnswerId(card) {
    const link = card.querySelector('a[href*="/answer/"]');
    if (link) {
      const m = link.getAttribute('href').match(/\/answer\/(\d+)/);
      if (m) return m[1];
    }
    return null;
  },

  /**
   * 从文章卡片提取文章 ID：/p/<id> 链接（列表卡与详情页共用同一 ID 命名空间）。
   * 优先卡片标题链接——列表卡常含多个 /p/ 链接（标题、阅读全文、相关推荐），
   * 首链接未必是卡片自身。
   * @returns {string|null}
   */
  getArticleId(card) {
    const titleLink = card.querySelector('.ContentItem-title a[href*="/p/"]');
    const link = titleLink || card.querySelector('a[href*="/p/"]');
    if (link) {
      const m = link.getAttribute('href').match(/\/p\/(\d+)/);
      if (m) return m[1];
    }
    return null;
  },

  /** 文章列表卡识别（与详情页容器 .Post-Main 区分） */
  isArticleListCard(card) {
    return !!(card && card.classList && card.classList.contains('ArticleItem'));
  },

  /** 文章容器识别：含文章标题且无回答正文（回答卡与文章卡不重叠） */
  isArticleCard(card) {
    return !!(card && card.querySelector(ARTICLE_TITLE_SELECTOR) && !card.querySelector(BODY_SELECTOR));
  },

  /** 覆盖键：文章列表卡 = 'p'+id；回答 = 回答 ID */
  getContentId(card) {
    if (this.isArticleListCard(card)) {
      const id = this.getArticleId(card);
      return id ? 'p' + id : null;
    }
    return this.getAnswerId(card);
  },

  bodyParagraphs(card) {
    return ZD.prose.paragraphsOf(card.querySelector(BODY_SELECTOR));
  },

  articleParagraphs(articleEl) {
    const bodyEl = articleEl.querySelector(ARTICLE_BODY_SELECTOR);
    const paras = ZD.prose.paragraphsOf(bodyEl);
    return ZD.prose.dropTitleDup(paras, articleEl.querySelector(ARTICLE_TITLE_SELECTOR));
  },

  rawAnswerLength(card) {
    return this.bodyParagraphs(card).join('\n').length;
  },

  articleRawLength(articleEl) {
    return this.articleParagraphs(articleEl).join('\n').length;
  },

  articleListParagraphs(card) {
    const paras = ZD.prose.paragraphsOf(card.querySelector(BODY_SELECTOR));
    return ZD.prose.dropTitleDup(paras, card.querySelector('.ContentItem-title'));
  },

  articleListRawLength(card) {
    return this.articleListParagraphs(card).join('\n').length;
  },

  /** 卡片本身字数（列表卡走文章摘要；回答走正文） */
  rawLength(card) {
    return this.isArticleListCard(card) ? this.articleListRawLength(card) : this.rawAnswerLength(card);
  },

  extractArticleListText(card, settings) {
    return ZD.prose.windowText(
      this.articleListParagraphs(card),
      (settings && settings.articleWindowMode) || 'headtail',
      (settings && settings.articleMaxChars) || 4000
    );
  },

  extractArticleText(articleEl, settings) {
    return ZD.prose.windowText(
      this.articleParagraphs(articleEl),
      (settings && settings.articleWindowMode) || 'headtail',
      (settings && settings.articleMaxChars) || 4000
    );
  },

  extractText(card, settings) {
    const paras = this.bodyParagraphs(card);
    if (paras.length === 0) return '';

    let body;
    if (settings && settings.windowMode === 'head') {
      body = paras.slice(0, 2).join('\n');
    } else {
      body = paras.join('\n');
    }
    if (settings && settings.maxChars > 0 && body.length > settings.maxChars) {
      body = body.slice(0, settings.maxChars);
    }
    return body;
  },

  extractCardText(card, settings) {
    return this.isArticleListCard(card)
      ? this.extractArticleListText(card, settings)
      : this.extractText(card, settings);
  },

  minChars(settings, card) {
    if (this.isArticleListCard(card)) return (settings && settings.articleMinChars) || 0;
    return (settings && settings.minChars) || 0;
  },

  noun(card) {
    return this.isArticleListCard(card) ? '文章' : '回答';
  },

  cloudDimension(card) {
    return this.isArticleListCard(card) ? ZD.DIM.ARTICLE : ZD.DIM.ANSWER;
  },

  bodyEl(card) {
    return card.querySelector(BODY_SELECTOR);
  },

  insertAnchor(card) {
    const body = this.bodyEl(card);
    if (body) return body;
    return card.querySelector(ARTICLE_TITLE_SELECTOR);
  },

  cardOf(el) {
    return el.closest(CARD_SELECTOR) || el.closest(ARTICLE_CARD_SELECTOR);
  },

  collapsibleBody(card) {
    return this.bodyEl(card) || card.querySelector(ARTICLE_BODY_SELECTOR);
  },
};
})();

/**
 * 照妖镜 — X / Twitter 站点适配
 * 卡片：article[data-testid="tweet"]
 * 作者键：x:<handle>（小写）；覆盖键：x:<snowflake>。与知乎 people/回答 ID 隔离。
 * 依赖：constants.js（先加载）。
 */
(() => {
'use strict';
const ZD = globalThis.ZhihuDetector;
ZD.adapters = ZD.adapters || {};

const TWEET = 'article[data-testid="tweet"]';
const TWEET_TEXT = '[data-testid="tweetText"]';
const USER_NAME = '[data-testid="User-Name"]';
const NONE = '[data-zys-no-match]';

function closestTweet(el) {
  return el && el.closest ? el.closest(TWEET) : null;
}

function isTweetEl(node) {
  return !!(node && node.matches && node.matches(TWEET));
}

/** 嵌套在另一条推文内（引用/对话预览/轮播单元）→ 不独立打角标 */
function isNestedTweet(node) {
  const parent = node && node.parentElement;
  return !!(parent && parent.closest && parent.closest(TWEET));
}

function inCarousel(node) {
  return !!(
    node.closest &&
    (node.closest('[aria-roledescription="carousel"]') || node.closest('[data-testid="Carousel"]'))
  );
}

/** 本卡自己的 tweetText（不含嵌套 article 里的） */
function ownTweetTexts(card) {
  return Array.from(card.querySelectorAll(TWEET_TEXT)).filter((n) => closestTweet(n) === card);
}

function ownTweetTextEl(card) {
  return ownTweetTexts(card)[0] || null;
}

function handleFromHref(href) {
  if (!href) return null;
  let path = href;
  try {
    if (/^https?:/i.test(href)) path = new URL(href, 'https://x.com').pathname;
  } catch {
    /* keep raw */
  }
  path = String(path).split('?')[0].split('#')[0];
  const m = path.match(/^\/([A-Za-z0-9_]{1,15})\/?$/);
  if (!m) return null;
  const h = m[1];
  if (ZD.X_RESERVED_HANDLES.has(h.toLowerCase())) return null;
  return h;
}

function tweetIdFromHref(href) {
  if (!href) return null;
  const m = String(href).match(/\/status\/(\d+)/);
  return m ? m[1] : null;
}

ZD.adapters.x = {
  siteId: ZD.SITE.X,
  hasArticleDetail: false,
  CARD_SELECTOR: TWEET,
  BODY_SELECTOR: TWEET_TEXT,
  ARTICLE_CARD_SELECTOR: NONE,
  ARTICLE_BODY_SELECTOR: NONE,
  ARTICLE_TITLE_SELECTOR: NONE,

  /**
   * 只收顶层推文：嵌套 article（引用/轮播内嵌）与 carousel 区域跳过，避免重复角标。
   * root 自身是推文时也纳入（SPA 整卡插入时 querySelectorAll 不含自身）。
   */
  findCards(root) {
    if (!root || !root.querySelectorAll) return [];
    const cards = [];
    const seen = new Set();
    const consider = (node) => {
      if (!isTweetEl(node) || seen.has(node)) return;
      if (isNestedTweet(node) || inCarousel(node)) return;
      seen.add(node);
      cards.push(node);
    };
    consider(root);
    root.querySelectorAll(TWEET).forEach(consider);
    return cards;
  },

  getAuthor(card) {
    const names = Array.from(card.querySelectorAll(USER_NAME)).filter((n) => closestTweet(n) === card);
    const scope = names[0] || card;
    const links = scope.querySelectorAll('a[href]');
    for (const a of links) {
      const handle = handleFromHref(a.getAttribute('href'));
      if (!handle) continue;
      let name = '';
      for (const l of scope.querySelectorAll('a[href]')) {
        const t = (l.textContent || '').trim();
        if (t && !t.startsWith('@')) {
          name = t;
          break;
        }
      }
      return { token: ZD.NS.X + handle.toLowerCase(), name: name || handle };
    }
    return null;
  },

  hasAiDeclaration() {
    return false;
  },

  getTweetId(card) {
    const timeEl = card.querySelector('a[href*="/status/"] time');
    const timed = timeEl && timeEl.closest('a');
    if (timed && closestTweet(timed) === card) {
      const id = tweetIdFromHref(timed.getAttribute('href'));
      if (id) return id;
    }
    const links = card.querySelectorAll('a[href*="/status/"]');
    for (const a of links) {
      if (closestTweet(a) !== card) continue;
      const id = tweetIdFromHref(a.getAttribute('href'));
      if (id) return id;
    }
    return null;
  },

  getContentId(card) {
    const id = this.getTweetId(card);
    return id ? ZD.NS.X + id : null;
  },

  getAnswerId(card) {
    return this.getContentId(card);
  },
  getArticleId() {
    return null;
  },
  isArticleListCard() {
    return false;
  },
  isArticleCard() {
    return false;
  },

  bodyParagraphs(card) {
    const el = ownTweetTextEl(card);
    if (!el) return [];
    const t = String(el.innerText || el.textContent || '').trim();
    return t ? [t] : [];
  },

  rawLength(card) {
    return this.bodyParagraphs(card).join('\n').length;
  },

  extractCardText(card, settings) {
    const paras = this.bodyParagraphs(card);
    if (!paras.length) return '';
    let body = paras.join('\n');
    const max = (settings && settings.maxChars) || 0;
    if (max > 0 && body.length > max) body = body.slice(0, max);
    return body;
  },

  extractText(card, settings) {
    return this.extractCardText(card, settings);
  },
  extractArticleListText() {
    return '';
  },
  extractArticleText() {
    return '';
  },
  articleRawLength() {
    return 0;
  },
  articleListRawLength() {
    return 0;
  },

  minChars(settings) {
    if (!settings || settings.xMinChars === undefined || settings.xMinChars === null) {
      return ZD.DEFAULTS.xMinChars;
    }
    return settings.xMinChars;
  },

  noun() {
    return '推文';
  },

  cloudDimension() {
    return ZD.DIM.TWEET;
  },

  bodyEl(card) {
    return ownTweetTextEl(card);
  },

  insertAnchor(card) {
    return ownTweetTextEl(card) || card.querySelector(USER_NAME);
  },

  cardOf(el) {
    return closestTweet(el);
  },

  collapsibleBody(card) {
    return ownTweetTextEl(card);
  },

  /** 测试用：从新增节点收集应分析的顶层推文（含祖先回退，模拟观察器） */
  collectFromAdded(nodes) {
    const cards = [];
    const seen = new Set();
    const add = (card) => {
      if (!card || seen.has(card)) return;
      seen.add(card);
      cards.push(card);
    };
    for (const node of nodes) {
      if (!node || !node.querySelectorAll) continue;
      this.findCards(node).forEach(add);
      const anc = node.closest && node.closest(TWEET);
      if (anc && !isNestedTweet(anc) && !inCarousel(anc)) add(anc);
    }
    return cards;
  },
};

ZD.adapters.x._ownTweetTextEl = ownTweetTextEl;
ZD.adapters.x._handleFromHref = handleFromHref;
ZD.adapters.x._isNestedTweet = isNestedTweet;
ZD.adapters.x._inCarousel = inCarousel;
})();

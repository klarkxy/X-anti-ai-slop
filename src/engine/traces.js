/**
 * 照妖镜 — AI 创作痕迹清单（规则初审依据）
 * 来源：research/ai-detection-prompts-facts.md + 中文 humanizer/维基「检测器还没有」的信号。
 * 每条痕迹：{ id, name, weight, cap, test(text)->命中次数, scoring?, minChars? }
 *   scoring 缺省 = 校准逻辑回归（v4 权重表按 id 取值）；
 *   scoring: 'post-sigmoid' = 不进旧 21 维权重向量，sigmoid 之后按 weight/cap 小幅扣分
 *   （本轮无 C-ReD+flash 联合拟合数据；方向未校准，不当铁律）。
 *   minChars：短于该字数不计数（说明书结构等统计量在 X 默认 40 字上不稳）。
 * 依赖：constants.js（先加载）。
 */
(() => {
'use strict';
const ZD = globalThis.ZhihuDetector;

/** 痕迹计分方式：校准权重 vs sigmoid 后小扣分（与自定义正则同一出口） */
ZD.TRACE_SCORING = { CALIBRATED: 'calibrated', POST_SIGMOID: 'post-sigmoid' };
ZD.isPostSigmoidTrace = (t) => t && t.scoring === ZD.TRACE_SCORING.POST_SIGMOID;

ZD.traces = [
  {
    id: 'opening-boilerplate',
    name: '开场套话',
    weight: 12,
    cap: 1,
    test(t) {
      return /(在当今[^，。]{1,20}的时代|随着[^，。]{1,20}的发展|众所周知|在这个信息爆炸的时代|近年来，随着|随着社会的不断发展)/.test(t) ? 1 : 0;
    },
  },
  {
    id: 'connector-skeleton',
    name: '连接词骨架',
    weight: 4,
    cap: 3,
    test(t) {
      let n = 0;
      const hasFirst = /(首先|第一，)/.test(t);
      // 仅句首连接词义：前接句末标点/换行/文首。issue 11 C：排除「价格其次」「第二名」
      // 等名词/排名义（全文本匹配会把人类测评类回答的并列陈述误当枚举骨架）。
      const hasMid = /(^|[。！？!?\n；;])\s*(其次|第二，)/.test(t);
      if (hasFirst) n++;
      if (hasMid) n++;
      // 强收尾词独立计分
      if (/(综上所述|总而言之|由此可见)/.test(t)) n++;
      // 单独的"最后"是人类常用词，仅成链时计分
      if (/(最后[，,、]|最后$)/.test(t) && (hasFirst || hasMid)) n++;
      if (/(与此同时|一方面[^，。]{0,20}另一方面)/.test(t)) n++;
      return n;
    },
  },
  {
    id: 'empty-emphatic',
    name: '空洞强调',
    weight: 7,
    cap: 1,
    test(t) {
      return /(值得注意的是|值得一提的是|毫无疑问|不容忽视|显而易见的是|不可否认，)/.test(t) ? 1 : 0;
    },
  },
  {
    id: 'biz-jargon',
    name: '商务黑话',
    weight: 6,
    cap: 3,
    test(t) {
      const m = t.match(/(赋能|抓手|打通|闭环|底层逻辑|颗粒度|心智|护城河|降本增效|破局)/g);
      return m ? m.length : 0;
    },
  },
  {
    id: 'intensifier',
    name: '强化词滥用',
    weight: 3,
    cap: 3,
    test(t) {
      const m = t.match(/(极其|十分|非常|极为)/g);
      return m ? m.length : 0;
    },
  },
  {
    id: 'nominalized-verb',
    name: '名词化动词',
    weight: 5,
    cap: 2,
    test(t) {
      let n = 0;
      if (/进行[了着]?[一二三四五六七八九十两]?[项次][^，。；]{0,12}/.test(t)) n++;
      if (/加以[^，。；]{1,10}/.test(t)) n++;
      if (/实现[了着]?[^，。；]{2,10}(化|提升|增长|突破)/.test(t)) n++;
      return n;
    },
  },
  {
    id: 'meta-commentary',
    name: '元评论',
    weight: 6,
    cap: 1,
    test(t) {
      return /(让我们(?:一起)?来(?:探讨|聊聊|看看)|我来(?:谈谈|说说|聊聊|探讨)|我们来(?:聊聊|探讨)|接下来我将|在本文中|以下分几点|我会从|我想分享|下面，我就)/.test(t) ? 1 : 0;
    },
  },
  {
    id: 'inspirational-closer',
    name: '励志结尾',
    weight: 6,
    cap: 1,
    test(t) {
      return /(愿你[^。！]{0,20}|未来可期|道阻且长|向阳而生|砥砺前行|这，就是[^。！]{1,20}的力量)/.test(t) ? 1 : 0;
    },
  },
  {
    id: 'tricolon',
    name: '排比模板（是X，是X，更是X）',
    weight: 8,
    cap: 1,
    test(t) {
      return /(?:是|不仅是|不只是|不光是|更是)[^，。！？]{2,12}，更是[^，。！？]{2,12}|是[^，。！？]{2,12}，是[^，。！？]{2,12}，更是[^，。！？]{2,12}/.test(t) ? 1 : 0;
    },
  },
  {
    id: 'fake-intimacy',
    name: '伪亲密称呼',
    weight: 5,
    cap: 1,
    test(t) {
      return /(亲爱的读者|家人们|小伙伴们|各位朋友|朋友们，)/.test(t) ? 1 : 0;
    },
  },
  {
    id: 'superlative',
    name: '最高级堆砌',
    weight: 4,
    cap: 2,
    test(t) {
      const m = t.match(/(至关重要|不可或缺|显著|卓越|极致|无可替代)/g);
      return m ? m.length : 0;
    },
  },
  {
    id: 'idiom-cluster',
    name: '成语堆砌',
    weight: 4,
    cap: 2,
    test(t) {
      const m = t.match(/(博大精深|源远流长|欣欣向荣|相辅相成|举足轻重|日新月异)/g);
      return m ? m.length : 0;
    },
  },
  {
    id: 'dead-metaphor',
    name: '死隐喻',
    weight: 4,
    cap: 2,
    test(t) {
      const m = t.match(/(双刃剑|灯塔|基石|引擎|马拉松|指明灯|试金石)/g);
      return m ? m.length : 0;
    },
  },
  {
    id: 'flat-sentence',
    name: '句长齐整（统计）',
    weight: 8,
    cap: 1,
    test(t) {
      // 连续 3+ 句长度相差 ≤8 字 → 句式单调
      const sents = t
        .split(/[。！？!?\n]/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 8 && s.length <= 60);
      let run = 1;
      for (let i = 1; i < sents.length; i++) {
        if (Math.abs(sents[i].length - sents[i - 1].length) <= 8) {
          run++;
          if (run >= 3) return 1;
        } else {
          run = 1;
        }
      }
      return 0;
    },
  },
  {
    id: 'period-as-comma',
    name: '句号当顿号',
    weight: 5,
    cap: 1,
    test(t) {
      // 连续 3+ 个短句都以句号结尾（苹果。香蕉。橘子。）
      return /([^。！？!?\n]{1,8}。){3,}/.test(t) ? 1 : 0;
    },
  },
  {
    id: 'dash-repetition',
    name: '破折号反复',
    weight: 4,
    cap: 1,
    test(t) {
      const m = t.match(/——/g);
      return m && m.length >= 2 ? 1 : 0;
    },
  },
  {
    id: 'colon-overuse',
    name: '冒号滥用',
    weight: 3,
    cap: 2,
    test(t) {
      // AI 用冒号引出解释/列举/定义（stop-slop-zh：冒号全文命中应为 0）
      const m = t.match(/：/g);
      return m ? m.length : 0;
    },
  },
  {
    id: 'straight-quote',
    name: '英文双引号标注',
    weight: 3,
    cap: 2,
    test(t) {
      // AI 用 " " 标注概念/术语，人类倾向用「」或不加
      const m = t.match(/[""]/g);
      return m ? m.length : 0;
    },
  },
  {
    id: 'fake-colloquial',
    name: '伪口语',
    weight: 5,
    cap: 1,
    test(t) {
      return /(那么问题来了|你可能会问|这就引出了一个问题|答案可能出乎你的意料|让我们来看看)/.test(t) ? 1 : 0;
    },
  },
  {
    id: 'hollow-summary',
    name: '空洞归纳',
    weight: 4,
    cap: 1,
    test(t) {
      return /(这意味着|这说明了什么|意味着什么|一言以蔽之)/.test(t) ? 1 : 0;
    },
  },
  {
    id: 'numbered-list',
    name: '编号式结构',
    weight: 3,
    cap: 2,
    test(t) {
      // 第一…第二…第三 / 判断一 / 其一其二（stop-slop-zh：编号式是明显 AI 信号）
      const m = t.match(/(第一[，,、]|第二[，,、]|第三[，,、]|判断[一二三四五六]|其一|其二|其三)/g);
      return m ? m.length : 0;
    },
  },
  // ——— 以下 5 条：中文 humanizer / 维基信号，本轮不进 v4 权重表 ———
  {
    id: 'evidence-overclaim',
    name: '证据越界',
    weight: 4,
    cap: 2,
    scoring: 'post-sigmoid',
    // y10reo/stop-slop-zh claim-boundaries：把推演/众筹/百分比写成「已证实」
    test(t) {
      const PROOF = /这证明了|充分(?:说明|证明|表明|证实)|成功验证了|无可辩驳地(?:证明|说明)|铁证如山/;
      const SOURCE = /根据|引自|来源|报告|调研|统计局|论文|见图|见表|如图/;
      let n = 0;
      for (const s of t.split(/[。！？!?\n]/)) {
        if (!s.trim()) continue;
        if (SOURCE.test(s)) continue; // 有出处的推演不当越界
        if (PROOF.test(s)) n++;
        else if (/\d+(?:\.\d+)?%/.test(s) && /(证明|验证了|市场需求|真实需求)/.test(s)) n++;
      }
      return n;
    },
  },
  {
    id: 'fake-anecdote',
    name: '假案例',
    weight: 4,
    cap: 2,
    scoring: 'post-sigmoid',
    // 虚构咨询现场：匿名「某团队 / 有位朋友」+ 时间锚。不当真实「我上周跟同事」死刑。
    test(t) {
      const m = t.match(/(?:上周|前几天|最近|不久前|前两天)[，,]?(?:刚)?(?:跟|和)某(?:个|位|家)?(?:团队|朋友|客户|创业者|创始人|公司)|(?:有位|有个|一位)朋友跟我说|我有个朋友(?:跟我)?(?:说|讲|告诉)/g);
      return m ? m.length : 0;
    },
  },
  {
    id: 'translationese',
    name: '翻译腔',
    weight: 3,
    cap: 3,
    scoring: 'post-sigmoid',
    // humanizer-zh / 维基「翻译腔」：欧化框、被动「被…所」、英译残留连接
    test(t) {
      let n = 0;
      const add = (re) => {
        const m = t.match(re);
        if (m) n += m.length;
      };
      add(/对于[^，。；\n]{1,16}(?:而言|来说)/g);
      add(/在[^，。；\n]{1,16}的过程中/g);
      add(/使得[^，。；\n]{1,20}得以/g);
      add(/围绕[^，。；\n]{1,12}(?:展开|开展)/g);
      add(/(?:^|[。！？!?\n；;])基于[^，。]{2,16}，/g);
      add(/被[^，。；\n]{1,12}所/g);
      add(/是令人[^。！？\n]{1,12}的/g);
      return n;
    },
  },
  {
    id: 'god-perspective',
    name: '解释腔/上帝视角',
    weight: 4,
    cap: 2,
    scoring: 'post-sigmoid',
    // 跳出角色当下定性。hollow-summary 只覆盖「这意味着 / 一言以蔽之」一截。
    test(t) {
      let n = 0;
      if (/(?:他|她|他们|她们)(?:当时)?不知道的是/.test(t)) n++;
      if (/(?:他|她)并不知道/.test(t)) n++;
      const why = t.match(/之所以[^。！？\n]{1,24}是因为/g);
      if (why) n += why.length;
      if (/鲜为人知的是/.test(t)) n++;
      if (/(?:读者|你)可能不知道/.test(t)) n++;
      if (/从上帝视角/.test(t)) n++;
      if (/站在(?:旁观|全知|更高)(?:者)?的角度/.test(t)) n++;
      return n;
    },
  },
  {
    id: 'manual-outline',
    name: '说明书结构',
    weight: 5,
    cap: 1,
    scoring: 'post-sigmoid',
    minChars: 200,
    // 维基「滥用粗体 / 列表式行文 / 段段小标题」：密度触发，不当一条列表死刑。
    // 短于 200 字（含 X 默认 40 字）不计数——垂直清单统计量不稳。
    test(t) {
      if (t.length < 200) return 0;
      const lines = t.split(/\n/).map((s) => s.trim()).filter(Boolean);
      const bold = (t.match(/\*\*[^*]{1,40}\*\*/g) || []).length;
      const mdHead = (t.match(/(?:^|\n)#{1,3}\s+\S/g) || []).length;
      const bullets = lines.filter((l) => /^(?:[-*•]|\d+[\.、．]|（?\d+）)/.test(l)).length;
      const labelColon = lines.filter((l) =>
        /^(?:[-*•]|\d+[\.、．])?\s*\*{0,2}[^：:\n*]{1,16}\*{0,2}[：:]\s*\S/.test(l)
      ).length;
      const shortHeads = lines.filter((l) =>
        l.length <= 18 && !/[。！？]/.test(l) && !/^(?:[-*•]|\d+[\.、．])/.test(l)
      ).length;
      if (bold >= 3 && bullets >= 3) return 1;
      if (mdHead >= 3) return 1;
      if (labelColon >= 3) return 1;
      if (lines.length >= 5 && shortHeads >= 4 && shortHeads / lines.length >= 0.35) return 1;
      return 0;
    },
  },
];
})();

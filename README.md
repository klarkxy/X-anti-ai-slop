# 照妖镜

在知乎与 X（Twitter）为每条内容打上「人类置信度」角标（0–100，100 = 几乎确定人工），一眼识别疑似 AI 生成的内容。默认**纯本地校准打分引擎**即时判定、零构建零依赖；拿不准的内容可选接入**你自己配置的 LLM** 做云端复核；判错了还能**一键覆盖**。与黑盒检测服务不同——每条判定都附逐特征的贡献清单，理由可查、结果可改、数据只留在本机。

## 安装（本地加载）

1. **获取代码**：`git clone` 本仓库；或下载 zip 后解压到任意目录
2. **打开扩展管理页**：Chrome 地址栏输入 `chrome://extensions` 回车
3. **开启开发者模式**：页面右上角的「开发者模式」开关打开
4. **加载扩展**：点左上角「加载已解压的扩展程序」，选择仓库根目录（即含 `manifest.json` 的目录；zip 用户选解压目录）
5. **验证**：打开任意知乎问题页（`zhihu.com/question/*`）或 X 时间线（`x.com/home`），每条内容上方出现角标即安装成功

> 扩展更新（重新加载）后，已打开页面里的旧内容脚本会失效（按钮无响应属正常），**刷新页面即可**。

## 效果一览

| 正常判定 | 确定 AI | 短回答跳过 |
|---|---|---|
| <img src="docs/images/ok.png" alt="绿色角标：97 正常 · 1 条痕迹" width="280" /> | <img src="docs/images/sure.png" alt="红色角标：38 确定 AI · 二审" width="280" /> | <img src="docs/images/skip.png" alt="灰色角标：跳过 · 少于 300 字" width="280" /> |

疑似 AI 回答：理由面板展开（命中痕迹扣分 + AI/人工倾向证据 + 覆盖/重新判定操作）：

<img src="docs/images/suspect.png" alt="橙色角标：70 疑似 AI 二审，展开的理由面板（命中痕迹 + AI/人工倾向证据 + 操作按钮）" width="360" />

设置页（阈值 / 模糊带 / API / 二审权重 / 提示词编辑 / 自定义规则）：

<img src="docs/images/option.png" alt="设置页全貌" width="360" />

## 覆盖范围

- **知乎**：问题页、首页时间线、文章页（`/p/*` 含专栏）
- **X（Twitter）**：`x.com` / `twitter.com` 首页时间线、用户主页、单条推文状态页；新推文进入时间线后自动补标；引用/轮播内的嵌套推文不重复打角标
- 过短文本不评分：知乎回答默认 &lt;300 字、文章 &lt;800 字、X 推文默认 &lt;40 字（推文下限独立，可在设置页改）

## 关于误判

- **一审会误判**：本地打分是概率判断，不是铁证。权重由当前国内主流模型（deepseek-v4-flash）生成的近 3000 份回答与知乎真人回答平衡拟合而来，覆盖的是统计规律，不是逐篇的真相
- **目的不是 100% 杜绝 AI**：本插件抵制的是粗制滥造的 AI 灌水内容，不是所有 AI 参与的写作
- **被误判的大概率也不冤**：即使某些内容确实出自人工，但它们空洞、工整、四平八稳——宛如在读一份述职报告，多半也不是你想读的东西
- **有些指标方向反直觉**：比如「冒号滥用」「句号当顿号」这类名字听着是贬义的特征，在实际拟合中反而是**人类加分项**——真人写知乎就是会犯这些毛病，而 AI 反而工整干净。这不是 bug：过于完美本身就是一种不完美，反之亦然

## 限制

- 学术/公文式行文（首先/其次/综上所述 + 总结收尾）可能误判为 AI，可调阈值、二审复核或手动覆盖
- 概率判断有天花板：人类正常率约 83%，主流模型漏判仍约两成
- 作者屏蔽/信任：知乎用 `people/<token>`，X 用 `@handle`（存储键 `x:handle`），两边不会撞键

## 一审怎么计分

分数是「人类置信度」：`round(σ(Σ w·x + b) × 100)`，再叠自定义正则与待拟合痕迹的小幅扣分。

| 信号 | 怎么计入分数 |
|---|---|
| 既有 21 类词法痕迹（开场套话、连接词骨架、空洞强调、商务黑话、强化词、名词化、元评论、励志结尾、排比模板、伪亲密、最高级、成语堆、死隐喻、句长齐整、句号当顿号、破折号反复、冒号、英文引号、伪口语、空洞归纳、编号式） | **拟合进 v4 权重**：命中数 × 逻辑回归权重进 logit。方向由 C-ReD 知乎人类回答 + deepseek-v4-flash 决定——冒号/句号当顿号等在该域是人类加分，不是禁令。元评论等 5 条基率近 0 / 不稳，权重置零。 |
| 4 个统计特征（句长波动 / 标点密度 / 平均句长 / 逗号占比） | **拟合进 v4 权重**。短文本不稳；知乎默认 &lt;300 字、X 默认 &lt;40 字直接跳过整条评分。 |
| 本轮 5 类中文 humanizer 信号（证据越界、假案例、翻译腔、解释腔/上帝视角、说明书结构） | **不进 v4 权重向量**。本轮仓库里没有 C-ReD+flash jsonl，无法联合拟合；命中后走与自定义正则同一出口——sigmoid 之后按 `weight×min(count,cap)` 小幅扣分（4/4/3/4/5，上限 2/2/3/2/1）。说明书结构短于 200 字不计（X 默认 40 字不会吃这条统计量）。下次数据齐后用 `eval/pilot/fit-v5-new-traces.js` 连合拟合；方向不稳或基率近 0 置零，不硬塞正权重。 |
| 用户自定义正则 | 仍是 sigmoid 之后按设置的 weight/cap 扣分。 |

不当铁律、未合入的写法：stop-slop-zh 禁冒号/破折号/禁「第一第二第三」；网文 deslop「眼中闪过一丝 / 深吸一口气」；aigc-reduce 类降查重手法。英文 slop 表未合入。

## 开发：提取 / 观察测试

```bash
node .scratch/x-support/tests/twitter-extract-test.js
node .scratch/x-support/tests/site-bind-test.js
node .scratch/calibrated-scoring/tests/migrate-settings-test.js
node .scratch/zh-humanizer-signals/tests/new-traces-test.js
```

### 手动验证（加载扩展后）

1. **知乎不回退**：打开 `zhihu.com/question/*`、首页、`/p/*` 文章，角标/理由面板/覆盖/作者屏蔽与原先一致；短回答仍按 300 字跳过。
2. **X 时间线**：打开 `https://x.com/home`，每条顶层推文作者行下方出现同款角标；滚动加载的新推文在数秒内补标。
3. **X 主页 / 状态页**：打开任意 `x.com/<handle>` 与 `x.com/<handle>/status/<id>`，推文有角标；回复线程里每条独立推文各一枚，引用卡内部不再套一枚。
4. **短推 skip**：几字的「gm / 哈哈」出灰色「跳过」；超过设置页「X 推文判定字数下限」（默认 40）的长推出分数。
5. **作者键隔离**：在设置页用 `@handle` 屏蔽一个 X 作者，知乎 `people/<同名 token>` 不受影响。

## Credits

内置的 21 类校准痕迹在信号分类上借鉴了 [stop-slop-zh](https://github.com/pencil20388-eng/stop-slop-zh)（灵感源自 [hardikpandya/stop-slop](https://github.com/hardikpandya/stop-slop)）。本轮 5 类中文信号分别参考 [y10reo/stop-slop-zh](https://github.com/y10reo/stop-slop-zh)（证据越界）、[ai-zixun/humanizer-zh](https://github.com/ai-zixun/humanizer-zh) 与[中文维基「AI生成文的特徵」](https://zh.wikipedia.org/wiki/Wikipedia:AI%E7%94%9F%E6%88%90%E6%96%87%E7%9A%84%E7%89%B9%E5%BE%B5)（翻译腔、说明书结构）、[LifelongLazyLearner/qu-ai-wei](https://github.com/LifelongLazyLearner/qu-ai-wei)（解释腔/假现场的编辑观察）。只作规则设计参考，不入库。

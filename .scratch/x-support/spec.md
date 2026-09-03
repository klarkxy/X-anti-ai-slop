# X（Twitter）站点适配

> Status: ready-for-agent
> 关联：知乎现有提取/观察管线、校准打分、作者规则、云二审

把内容脚本从「仅知乎」扩成「知乎 + X」，打分引擎共用，DOM 提取拆成站点适配层。

## 约束

- 知乎问题页 / 首页 / `/p/*` 不回退
- X 作者键 `x:<handle>`，覆盖键 `x:<snowflake>`，不与知乎 people token / 回答 ID 混键
- 推文 `xMinChars` 默认 40（不用回答的 300）
- 嵌套 / 轮播推文不重复打角标
- SPA：新增与复用节点都能观察到

# 站点适配层：知乎 + X 共用打分引擎

Status: accepted

产品从「仅知乎」扩到知乎与 X（Twitter）都打人类置信度角标。打分引擎、阈值、云二审、覆盖与作者规则语义保持不变；DOM 提取与观察从 `extract.js` 的知乎选择器拆成站点适配器（`src/content/sites/zhihu.js`、`twitter.js`），内容脚本只依赖 `ZD.extract` 统一接口。

**Considered Options**:

- **内容脚本复制一份 X 管线**：规则/二审/角标会分叉，排除。
- **同一套提取选择器加 if hostname**：知乎与 X 的去重方向相反（知乎留最内层、X 只标顶层），硬拧在一个 `findCards` 里易回退，排除。
- **站点适配层 + 共用引擎**：选定。

**Consequences**:

- X 卡片为 `article[data-testid="tweet"]`；嵌套 article 与 `aria-roledescription=carousel` 内推文不打角标。
- 作者键 `x:<handle>`、覆盖键 `x:<snowflake>`，与知乎 `people/<token>` / 回答 ID / `p<id>` 隔离。
- 推文 `xMinChars` 默认 40，不用回答的 300。二审预算维度 `tweet` 与回答/文章隔离。
- X 是 SPA：观察器沿用 MutationObserver；整卡插入时 `findCards` 含 root 自身；虚拟列表复用节点时按内容 ID 变化重分析。

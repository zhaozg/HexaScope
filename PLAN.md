# PLAN.md — HexaScope 改进计划

> 版本: v1.0
> 状态: Iteration 1 进行中（P0-1 / P0-2 已完成；P1-1 待维护者执行；安装入口可用性修复已交付）
> 制定日期: 2026-09-13
> 关联文档: [DESIGN.md](DESIGN.md) · [README.md](README.md) · [AGENTS.md](AGENTS.md)

---

> **执行记录（2026-09-13）**
>
> - ✅ **P0-1 首页信息架构**：首屏新增六维模型速览卡片（每维附评估依据）、
>   「查看演示报告」主按钮与演示截图（`frontend/images/demo-report.png`）、
>   可折叠的「三步了解工作原理」；顺带修复可访问性问题（`html lang`、表单标签、
>   正文链接下划线、按钮对比度），Lighthouse 可访问性首页与演示页均 **100**，
>   375px 宽无横向滚动。
> - ✅ **P0-2 演示报告 CI 校验**：新增 `scripts/reportSchema.ts`（无第三方依赖）与
>   `scripts/validate-demo-report.ts`，`bun run validate:demo` 已接入 `ci.yml`。
>   除结构校验外，还会用评分算法重算综合得分做一致性比对，可捕获「算法改了、
>   演示报告没同步」。
> - ⏸️ **P1-1 results 迁移至独立分支**：属数据迁移，会改动 `results/`（AGENTS.md §5
>   规定该目录仅由 Actions 提交）且需新建 `results-data` 分支，故留待维护者执行；
>   前端数据源 URL 必须与分支迁移**同批发布**，否则线上报告会 404。

---

## 执行记录（Iteration 1 补充：安装入口可用性修复，2026-09-17）

> 触发：用户反馈「安装 App 的按钮不够明显，在什么位置啊」。实测确认并非“不明显”，
> 而是**不存在**：前端代码中无任何指向安装页的链接，安装说明只以纯文本躺在默认折叠的
> `<details>` 里；首屏可见的「生成雷达图」对未安装用户必然失败，失败页又是「返回首页」死胡同。
>
> - ✅ 首屏主行动区：实心绿主按钮「安装 HexaScope App」+ 次级「查看演示报告」
> - ✅ 顶栏、页脚各增常驻安装入口
> - ✅ 折叠的三步说明改为常驻三卡片，第 2 步直达**预填 `/evaluate <用户名>` 的新建 Issue**
> - ✅ 查询表单降为次入口（「已有报告？直接查询」，按钮文案改「查看报告」）
> - ✅ 空态自服务：直接给出安装 + 预填评估 Issue 两个按钮
> - ✅ 对比度修正：主按钮 hover 绿改为 5.08:1（GitHub 原版 3.37:1 不达 AA）；
>   次级按钮 hover 由半透明叠加（4.01:1）改为实心蓝（4.63:1）
> - ✅ 新增 `tests/frontend-home-cta.test.ts`（11 项）：安装入口可点/非折叠/URL 与
>   README–DESIGN 一致、`/evaluate` 指令与 `analyze.yml` 一致、颜色令牌对比度、
>   以及 Nuekit 反引号陷阱（见 DESIGN ADR-008）
> - ⏳ 建议后续（未纳入本次）：补 favicon（线上 `/favicon.ico` 仍 404，会在控制台报错）

---

## 一、背景与目标

HexaScope 当前已实现核心评估链路：安装 GitHub App → Actions 自动采集 → 六维评分 → 生成雷达图 → Pages 展示。工程规范完善，CI 门禁严格，架构轻量务实。

但在实际体验与长期可维护性上仍存在若干可改进点。本计划旨在：

1. **降低新用户理解成本**，让首页在 10 秒内说清“六边形是什么、评估依据是什么”。
2. **消除演示报告与评分算法脱节的风险**，确保 `demo-report.json` 始终与当前 schema 兼容。
3. **控制仓库体积增长**，避免 `results/` 目录在长期运行中成为 Git 历史包袱。
4. **提升报告可解释性**，让用户不仅看到分数，还能理解每个分数的具体来源。
5. **完善 Copilot 扩展与自托管能力**，为生态扩展打好基础。

---

## 二、改进项总览

| 优先级 | 改进项 | 影响 | 预估工时 | 迭代 |
|--------|--------|------|---------|------|
| **P0** | 首页信息架构优化 | 用户体验 | 2 天 | Iteration 1 |
| **P0** | `demo-report.json` CI 校验 | 数据一致性 | 1 天 | Iteration 1 |
| **P1** | `results/` 迁移至独立分支 | 仓库可维护性 | 3 天 | Iteration 1 |
| **P1** | 报告评分明细结构化 | 可解释性 | 2 天 | Iteration 2 |
| **P2** | Copilot Extension 完善 | 生态集成 | 5 天 | Iteration 2 |
| **P2** | 自托管部署文档 | 企业采用 | 2 天 | Iteration 3 |
| **P3** | 多语言支持（i18n） | 国际化 | 5 天 | Iteration 3 |

---

## 三、详细改进方案

### P0-1: 首页信息架构优化

**现状**
首页仅包含标题、副标题、搜索表单和演示链接。新用户无法快速理解“六维能力模型”是什么、评估依据是什么。

**改进方案**

1. **增加六维模型速览卡片**
   在搜索框下方放置一个横向卡片，展示六个维度的图标与名称（技术硬实力、架构设计、问题排查、工程化效能、沟通协作、业务洞察），每个维度用一句话说明。卡片底部链接到 `README.md#六维能力模型设计哲学`。

2. **增加演示报告入口**
   将 `/?user=demo` 改为一个显眼的按钮“查看演示报告”，并添加一个静态截图（`docs/images/demo-screenshot.png`）作为视觉引导。

3. **增加“三步了解工作原理”折叠区域**
   用三个步骤说明：安装 App → Actions 自动评估 → 在 Pages/Copilot 查看报告。默认折叠，点击展开。

**验收标准**
- 首页首屏包含六维模型名称与一句话说明
- 演示报告按钮可见，点击后正确跳转
- Lighthouse 可访问性评分 ≥ 90
- 移动端布局正常（375px 宽度下无横向滚动）

**实施步骤**
1. 修改 `frontend/src/pages/index.nue`，增加卡片与折叠组件
2. 在 `frontend/public/` 添加演示截图
3. 更新 `frontend/src/styles/` 中的响应式样式
4. 运行 `npm run build` 验证构建产物

---

### P0-2: `demo-report.json` CI 校验

**现状**
`demo-report.json` 为静态文件，若评分算法或报告结构变更，该文件不会自动更新，可能导致演示报告展示旧结构。

**改进方案**

在 `ci.yml` 中增加一个校验步骤，使用 TypeScript 类型定义或 Zod schema 验证 `demo-report.json` 的结构。

**实施步骤**

1. 在 `frontend/src/types/report.ts` 中导出 `ReportSchema`（可使用 `zod`）。
2. 新增脚本 `scripts/validate-demo-report.ts`，读取 `frontend/public/demo-report.json` 并用 `ReportSchema.parse()` 校验。
3. 在 `ci.yml` 中增加步骤：
   ```yaml
   - name: Validate demo report schema
     run: bun run scripts/validate-demo-report.ts
   ```
4. 若校验失败，CI 报错并提示“请更新 demo-report.json 以匹配当前 schema”。

**验收标准**
- CI 在 `demo-report.json` 与 schema 不匹配时失败
- 本地运行 `bun run validate:demo` 能快速定位不匹配字段

---

### P1-1: `results/` 迁移至独立分支

**现状**
每个用户的评估结果（`report.json`、`radar.mmd`、`badge.svg`）提交到 `main` 分支的 `results/{username}/` 目录。随着用户增长，Git 历史将积累大量冗余版本，克隆和拉取速度会逐渐变慢。

**改进方案**

将 `results/` 迁移到独立的 orphan 分支 `results-data`，主分支不再包含评估数据。

**实施步骤**

1. 创建 orphan 分支：
   ```bash
   git checkout --orphan results-data
   git rm -rf .
   mkdir results && touch results/.gitkeep
   git add results/.gitkeep
   git commit -m "chore: initialize results-data branch"
   git push origin results-data
   ```
2. 修改 `analyze.yml`，将提交目标改为 `results-data` 分支：
   ```yaml
   - name: Commit results to results-data branch
     run: |
       git fetch origin results-data
       git checkout results-data
       # 复制新结果到 results/
       git add results/
       git commit -m "Auto-update: ${{ github.actor }}"
       git push origin results-data
   ```
3. 更新前端数据读取 URL：
   ```
   https://raw.githubusercontent.com/zhaozg/HexaScope/results-data/results/{username}/report.json
   ```
4. 更新 `DESIGN.md` 中 ADR-001 的说明，将数据源指向 `results-data` 分支。

**验收标准**
- `main` 分支不再包含 `results/` 目录
- 前端能正确读取 `results-data` 分支的数据
- 新评估结果自动提交到 `results-data` 分支
- 主分支仓库体积不再随用户增长而显著增加

**风险与缓解**
- 旧链接可能失效：在 README 中提供重定向说明，或保留 `results/` 目录的软链接（不推荐，会继续累积）。建议直接切换，并在 Pages 中增加 404 提示“报告已迁移”。

---

### P1-2: 报告评分明细结构化

**现状**
报告中每个维度给出 `evidence` 证据链，但格式为纯文本，用户难以快速定位“哪个子项扣了分”。

**改进方案**

在 `report.json` 中为每个维度增加 `breakdown` 数组，列出各子项得分与权重。

**数据结构示例**
```json
{
  "dimension": "技术硬实力",
  "score": 92,
  "breakdown": [
    { "item": "语言广度", "score": 38, "max": 40, "weight": 0.4 },
    { "item": "Top 3 项目质量", "score": 54, "max": 60, "weight": 0.6 }
  ]
}
```

**实施步骤**
1. 修改 `scripts/score_calculator.ts`，在计算每个维度时同步生成 `breakdown`。
2. 更新 `ReportSchema` 类型定义。
3. 修改前端 `ScoreCard` 组件，增加可展开的明细表格。
4. 更新 `demo-report.json` 以匹配新结构。

**验收标准**
- 报告中每个维度可展开查看子项得分
- 子项得分之和等于维度总分
- 前端渲染无布局错乱

---

### P2-1: Copilot Extension 完善

**现状**
README 中提到 Copilot Chat 可通过 `@HexaScope 查看我的报告` 查询，但尚未看到完整的 Extension 实现细节。

**改进方案**

1. 实现 Copilot Extension 的 API 端点，支持以下意图：
   - `查看我的报告` → 返回当前用户的雷达图与六维得分
   - `查看 @用户名 的报告` → 返回指定用户的公开报告（若用户已授权公开）
   - `解释六维模型` → 返回六维模型的简要说明
2. 增加上下文感知：若用户在某个仓库中提问，可优先展示该仓库贡献者的报告。
3. 在 `docs/COPILOT.md` 中补充完整的 API 文档与部署指南。

**验收标准**
- Copilot Chat 中 `@HexaScope 查看我的报告` 能正确返回 Markdown 格式报告
- 响应时间 < 3 秒
- 未授权用户查询他人报告时返回隐私提示

---

### P2-2: 自托管部署文档

**现状**
`DESIGN.md` 中提到了自托管 Runner 支持，但 `docs/SELF_HOSTING.md` 尚未创建。

**改进方案**

编写 `docs/SELF_HOSTING.md`，包含：
- 自托管 Runner 的配置步骤
- 环境变量清单（`GITHUB_TOKEN`、`LLM_API_KEY` 等）
- 私有化部署的架构调整建议（如使用内部 Git 服务替代 raw.githubusercontent.com）
- 成本估算与资源建议

**验收标准**
- 文档步骤完整，可在全新环境中复现部署
- 包含至少一个架构图（Mermaid 或 ASCII）

---

### P3-1: 多语言支持（i18n）

**现状**
界面与报告均为中文，英文用户理解成本较高。

**改进方案**

1. 前端引入 `i18next` 或轻量级 JSON 翻译方案。
2. 报告生成时根据用户 `locale` 输出对应语言。
3. 优先支持英文，后续可扩展日文、韩文。

**验收标准**
- 浏览器语言为 `en` 时自动展示英文界面
- 报告中的维度名称与说明可切换语言

---

## 四、迭代计划

| 迭代 | 时间 | 交付物 |
|------|------|--------|
| **Iteration 1** | Week 1 | 首页优化、demo 校验、results 分支迁移 |
| **Iteration 2** | Week 2-3 | 评分明细结构化、Copilot Extension 完善 |
| **Iteration 3** | Week 4-5 | 自托管文档、i18n 支持 |

---

## 五、成功指标

| 指标 | 当前值 | 目标值 | 测量方式 |
|------|--------|--------|---------|
| 首页跳出率 | 未知 | 降低 20% | 需接入分析工具（可选） |
| 演示报告点击率 | 未知 | > 30% | 页面事件埋点 |
| 首屏可见安装入口 | 0 处（仅折叠文本） | ≥ 1 个首屏可见主按钮 | `tests/frontend-home-cta.test.ts` 断言 |
| 未生成报告时的自服务率 | 0（仅「返回首页」） | 安装 + 发起评估双入口 | 同上（空态 DOM 断言） |
| 主分支仓库体积 | 持续增长 | 年增长 < 50MB | `git count-objects -vH` |
| Copilot 查询响应时间 | 未实现 | < 3s | API 监控 |

---

## 六、风险与依赖

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 迁移 results 分支导致旧链接失效 | 中 | 在 Pages 增加 404 提示，README 更新链接 |
| Copilot Extension 审核周期长 | 中 | 提前提交审核，同时提供 MCP 备选方案 |
| i18n 增加维护成本 | 低 | 仅维护中英文，其他语言由社区贡献 |

---

## 七、附录：任务清单（可复制到 Issue）

- [x] 首页增加六维模型卡片
- [x] 首页增加演示报告按钮与截图
- [x] 增加 demo-report.json schema 校验脚本
- [ ] 将 results\/ 迁移至 results-data 分支（需维护者执行，见下方说明）
- [ ] 更新前端 raw 数据读取 URL（与分支迁移同批发布，避免线上数据源指向不存在的分支）
- [ ] 评分明细 breakdown 结构设计与实现
- [ ] Copilot Extension API 端点实现
- [ ] 编写 docs\/SELF_HOSTING.md
- [ ] 前端 i18n 框架接入

---

> 本计划将根据实际开发进度动态调整。欢迎在 [Issues](https://github.com/zhaozg/HexaScope/issues) 中认领任务或提出新建议。

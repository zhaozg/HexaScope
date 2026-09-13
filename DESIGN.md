# HexaScope 设计文档

## 一、项目定位

`HexaScope` 的定位说明：

1. **GitHub 原生生态插件**（独立系统）
2. **深度集成 GitHub CI/Actions/Copilot**
3. **对 GitHub 用户完全免费**
4. **开源项目**，托管于 `https://github.com/zhaozg/HexaScope`

**核心愿景**：HexaScope 是一个**基于 GitHub 原生能力构建的开发者评估生态**，利用 GitHub Actions 自动化数据采集、GitHub Copilot Extensions 提供自然语言交互、GitHub App 实现用户授权与数据读取，为每一位 GitHub 用户生成**免费的六维能力雷达图**。


## 二、整体架构

```
┌───────────────────────────────────────────────────────────────────────────┐
│                         GitHub 原生生态层                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐    │
│  │ GitHub App      │  │ GitHub Actions  │  │ GitHub Copilot          │    │
│  │ (OAuth/安装)    │  │ (定时采集/计算) │  │ Extensions (自然语言)   │    │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────┘    │
└───────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                         HexaScope 核心服务层                              │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────────────────────┐    │
│  │ 数据采集模块 │  │ 六维评分引擎  │  │ 报告生成与可视化模块         │    │
│  │ (GitHub API) │  │ (确定性算法)  │  │ (雷达图 SVG/JSON)            │    │
│  └──────────────┘  └───────────────┘  └──────────────────────────────┘    │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────────────────────┐    │
│  │ 缓存管理     │  │ 红牌检测      │  │ 对比分析引擎                 │    │
│  │(GitHub Cache)│  │(10 项刷分特征)│  │ (开发者横向对比)             │    │
│  └──────────────┘  └───────────────┘  └──────────────────────────────┘    │
└───────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                         输出与交互层                                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐    │
│  │ GitHub Pages    │  │ GitHub README   │  │ Copilot Chat 交互       │    │
│  │ (公开仪表板)    │  │ (嵌入 Badge)    │  │ (@HexaScope 查询)       │    │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────┘    │
└───────────────────────────────────────────────────────────────────────────┘
```


## 三、GitHub 原生能力深度集成

### 3.1 GitHub App（用户授权与数据读取）

HexaScope 以 **GitHub App** 形式发布，用户安装后即可授权读取公共数据：

| 权限 | 用途 |
|------|------|
| `read:user` | 读取用户基本信息（姓名、邮箱、公司、位置等） |
| `repo` (只读) | 读取用户的公开仓库代码与元数据 |
| `read:org` | 读取用户所属组织信息（可选） |

**安装流程**：用户访问 HexaScope 的 GitHub App 安装页面 → 点击 "Install" 一键安装 → 按 README 指引在本仓库 Issue 评论 `/evaluate <用户名>` 或手动触发评估（GitHub Actions 不支持 `installation` 事件直接触发工作流）。

### 3.2 GitHub Actions（自动化数据采集与计算）

这是 HexaScope 的**核心自动化引擎**，参考了 `github-user-stats`、`devex-metrics`、`Metrics` 等成熟方案的设计模式。

**工作流设计** (`.github/workflows/analyze.yml`)：

```yaml
name: HexaScope - 六维能力评估

on:
  # 1. 用户主动请求（通过 HexaScope 仓库的 Issue 评论 /evaluate <用户名> 触发，仅限本人）
  issue_comment:
    types: [created]
  # 2. 用户主动请求（手动触发，仅限本人）
  issue_comment:
    types: [created]
  # 3. 定时增量更新（每周一次，仅更新活跃用户）
  schedule:
    - cron: '0 0 * * 0'  # 每周日 00:00 UTC
  # 4. 手动触发
  workflow_dispatch:
  # 4. 手动触发（仅评估自己）
  workflow_dispatch:
    inputs:
      username:
        description: 'GitHub 用户名（仅限本人）'
        required: true

# 权限声明
permissions:
  contents: write      # 用于提交 results/ 目录下的评估结果
  actions: read        # 用于读取 Actions 缓存
  issues: read         # 用于解析 Issue 评论中的触发命令
  pages: write         # 用于部署 GitHub Pages
  id-token: write      # 用于 Pages 部署身份验证

jobs:
  evaluate:
    steps:
      - uses: actions/checkout@v4

      - name: 安装 Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: 安装依赖
        run: bun install --frozen-lockfile

      - name: 采集数据 + 六维评分 + 红牌检测
        run: |
          mkdir -p results/${{ github.actor }}
          bun scripts/cli.ts evaluate "${{ github.actor }}" > results/${{ github.actor }}/report.json
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: 生成雷达图 Mermaid
        run: |
          bun scripts/generateRadar.ts < results/${{ github.actor }}/report.json > results/${{ github.actor }}/radar.mmd
      - name: 提交结果到仓库
        run: |
          git config user.name "HexaScope Bot"
          git config user.email "bot@hexascope.dev"
          git add results/
          git diff --staged --quiet || git commit -m "Auto-update: ${{ github.actor }} 的评估报告"
          git push
```

**数据采集能力**：

- 通过 GitHub REST API 获取用户仓库列表及详情
- 通过 GitHub GraphQL API 批量获取贡献数据
- 通过 Repository Statistics API 获取提交、增删行数等详细统计
- 自动识别并过滤 Fork 仓库，仅分析原创项目

**用户主动触发方式**：

用户在 HexaScope 项目仓库 (`zhaozg/HexaScope`) 的 Issues 中评论以下命令：

```
@HexaScope evaluate
```

系统通过 `issue_comment` 事件捕获该评论，解析评论者身份后触发评估。**仅支持评估评论者本人**；若评论指定了其他用户名，将返回提示“HexaScope 仅支持自我评估，无法评估他人”。这避免了多 App 监听同一仓库 Issue 的权限冲突问题。

### 3.3 GitHub Copilot Extensions（自然语言交互）

HexaScope 可发布为 **GitHub Copilot Extension**，让用户在 IDE 内通过自然语言查询评估结果：

**使用示例**：

```
用户: @HexaScope 帮我分析我的能力雷达图
Copilot: [调用 HexaScope API] 正在获取你的六维评估结果...
         技术硬实力: 92/100
         架构设计: 85/100
         问题排查: 78/100
         工程化效能: 82/100
         沟通协作: 65/100
         业务洞察: 72/100
         [附雷达图]
         ⚠️ 注：HexaScope 仅支持自我评估，结果仅供参考（自我评估可能存在主观偏差）。
```

**技术实现**：

- 通过 **Copilot Skillsets** 快速实现轻量级集成
- 或通过 **MCP (Model Context Protocol)** 实现更丰富的交互能力
- 支持 **上下文传递**，可根据用户当前打开的仓库提供针对性分析

### 3.4 GitHub Pages（公开仪表板）

评估结果通过 **GitHub Pages** 公开托管。

**数据读取方案**：

前端仪表板（NueJS / Nuekit 2.0 SPA）通过以下方式读取评估数据：

- **方案 B（已采纳）**：前端直接通过 JavaScript 调用 GitHub Raw 文件链接获取数据
  - 数据 URL：`https://raw.githubusercontent.com/zhaozg/HexaScope/main/results/{username}/report.json`
  - 徽章 SVG：`https://raw.githubusercontent.com/zhaozg/HexaScope/main/results/{username}/badge.svg`

- **优点**：无需构建时注入数据，始终保持最新；实现简单，维护成本低
- **注意**：需配置 `Content-Security-Policy` 允许访问 `raw.githubusercontent.com`

**Pages 站点功能**：

- 每个用户的评估报告以 JSON + SVG 格式存储于 `results/` 目录
- Pages 站点提供交互式雷达图（mermaid.js 渲染 radar-beta 图表，图表代码客户端确定性生成，与 `scripts/generateRadar.ts` 算法一致）
- 支持用户间对比、趋势查看等功能
- 通过查询参数路由 `?user={username}` 展示对应用户的仪表板（适配 Pages 子路径，详见 ADR-003）

**部署与 CI（`.github/workflows/`）**：

| 工作流 | 触发时机 | 职责 |
|--------|----------|------|
| `ci.yml` | main 推送 / PR（docs、results 变更除外） | 质量门禁：单元测试（覆盖率 ≥ 85%）、tsc 类型检查、ESLint、Prettier、前端构建验证 |
| `deploy-pages.yml` | main 推送（frontend/ 或构建脚本/依赖变更） | `bun run frontend:build` 后经 `actions/deploy-pages` 部署到 GitHub Pages |

- **部署源**：仓库 Settings → Pages → Source 选择 **GitHub Actions**
- **子路径适配**：`scripts/frontend-build.ts` 在 `nue build` 后把资源引用改写为相对路径，站点可直接运行于 `https://zhaozg.github.io/HexaScope/`
- **分钟数优化**：两个工作流均使用 Bun 依赖缓存（`bun.lock` 哈希为 key）；`ci.yml` 通过 `paths-ignore` 排除 `results/**`，避免 analyze.yml 提交评估结果时触发 CI 循环


## 四、六维评估模型（数据来源映射）

### 4.1 维度定义与权重

| 维度 | 权重 | GitHub 数据来源 | 具体指标 |
|------|------|----------------|---------|
| **技术硬实力** | 25% | 仓库语言分布、代码复杂度 | 语言广度、Top 3 项目质量评分 |
| **架构与设计** | 20% | 仓库结构、文档完备性、测试覆盖 | 是否有 ARCHITECTURE.md、测试目录、CI 配置 |
| **问题排查** | 15% | Issue 响应、Bug 修复 PR | 平均响应时长、修复 PR 数量与质量 |
| **工程化效能** | 15% | CI/CD 配置、Dockerfile、自动化工具 | 工具链完备性、自动化程度、CHANGELOG/CONTRIBUTING |
| **沟通协作** | 15% | PR 描述、Code Review 评论、Issue 讨论 | 协作活跃度、沟通质量、Conventional Commits 规范度 |
| **业务洞察** | 10% | README 质量、项目实际问题陈述 | 项目价值清晰度、需求理解深度、安装指引与示例 |

> **数据可得性标注**：每个维度在报告中额外输出 `available` 与 `evidence` 两个字段。
> `available: false` 表示该维度缺少数据支撑（如 GitHub API 配额不足），
> 此时该维度**不计 0 分，也不参与综合加权**——综合得分仅在有效维度上重新归一化，
> 避免"因为采集失败所以整体低分"。`evidence` 列出支撑该得分的关键事实，保证可追溯。

### 4.2 评分逻辑细则

各维度 0-100 分，通过确定性算法计算。以下为各维度核心公式的**伪代码**（实际实现采用 TypeScript / Bun ≥ 1.1，逻辑保持一致）：
各维度 0-100 分，通过确定性算法计算。以下为各维度核心公式的**伪代码**（实际实现采用 TypeScript / Bun ≥ 1.1，逻辑保持一致）：

**1. 技术硬实力（满分100）**

```
LANGUAGE_SCORES = {
    'Rust': 1.2, 'C': 1.1, 'C++': 1.1, 'Python': 1.0,
    'Go': 1.1, 'Java': 1.0, 'TypeScript': 1.0,
    'JavaScript': 0.9, 'Ruby': 0.9, 'PHP': 0.8,
    'Lua': 1.1, 'Zig': 1.2, '其他': 0.7
}

score = 0
# 语言广度得分：每种语言 +5 分，乘以语言权重，上限 40 分
score += min(len(unique_languages) * 5 * avg_language_weight, 40)

# 项目质量得分：Top 3 项目（按 Star 数加权）
for repo in top_3_repos:
    star_score = min(log(repo.stars + 1) * 8, 30)
    complexity_score = min(repo.complexity_metric / 100 * 20, 20)
    score += (star_score + complexity_score) / 3

# 边界限制
return min(max(score, 0), 100)
```

**2. 架构与设计（满分100）**

```
score = 0
# 架构文档存在性
if has_architecture_md: score += 20
if has_design_doc: score += 10

# 测试覆盖信号
if has_test_directory: score += 15
if has_ci_config: score += 15

# 模块化程度
score += calculate_modularity_score(repo)  # 基于目录结构复杂度评估，上限 40 分

return min(max(score, 0), 100)
```

**3. 问题排查（满分100）**

```
score = 0
# 平均 Issue 响应时长（最近 1 年）
avg_response_hours = get_avg_issue_response_time()
if avg_response_hours < 2: score += 40
elif avg_response_hours < 24: score += 30
elif avg_response_hours < 72: score += 20
else: score += 10

# Bug 修复 PR 数量
bugfix_pr_count = count_bugfix_prs_last_year()
score += min(bugfix_pr_count * 3, 30)

# PR 被合并率
merge_rate = get_pr_merge_rate()
score += merge_rate * 30  # 0-100% 映射到 0-30 分

return min(max(score, 0), 100)
```

**4. 工程化效能（满分100）**

```
score = 0
if has_github_actions: score += 25
if has_dockerfile: score += 15
if has_docker_compose: score += 5
if has_kubernetes_manifest: score += 5
if has_pre_commit_hooks: score += 10
if has_dependency_bot(dependabot): score += 10
if has_release_workflow: score += 10
if has_codeql_or_security_scan: score += 10
# 自动化程度（CI 步骤数/复杂度）
score += calculate_automation_depth() * 10  # 上限 10 分

return min(max(score, 0), 100)
```

**5. 沟通协作（满分100）**

```
score = 0
# PR 平均描述字数
avg_desc_len = get_avg_pr_description_length()
if avg_desc_len > 200: score += 30
elif avg_desc_len > 100: score += 20
elif avg_desc_len > 50: score += 10

# Code Review 评论参与度
review_count = get_pr_review_comments()
score += min(review_count * 2, 30)

# Issue 讨论参与度
discussion_count = get_issue_participation()
score += min(discussion_count * 1.5, 20)

# 协作广度（与不同贡献者交互）
unique_collaborators = get_unique_interaction_partners()
score += min(unique_collaborators * 2, 20)

return min(max(score, 0), 100)
```

**6. 业务洞察（满分100）**

```
score = 0
# README 完整性评估
readme_score = evaluate_readme_quality()  # 检查：问题陈述、使用场景、示例代码、贡献指南
score += readme_score * 0.4  # 上限 40 分

# 项目是否有明确的使用场景描述
if has_use_cases_doc: score += 20
if has_example_code: score += 20

# 项目受关注度（真实用户信号）
if has_issues_from_real_users: score += 10
if has_forks_with_commits: score += 10

return min(max(score, 0), 100)
```

### 4.2.1 数据采集（`scripts/collector.ts`）

| 采集内容 | GitHub API | 预算 |
|---------|-----------|------|
| 用户画像 | `GET /users/{user}` | 1 |
| 仓库列表（含语言/Star/Fork/Issue 数） | `GET /users/{user}/repos` | 1 |
| 仓库文件树（结构信号/复杂度/模块化） | `GET /repos/{o}/{r}/git/trees/{sha}` | 每仓库 1，上限 8 |
| README 原文（质量评分） | `GET /repos/{o}/{r}/readme` | 每仓库 1，上限 8 |
| 提交历史（提交信息质量/Bug 修复/贡献方差） | `GET /repos/{o}/{r}/commits` | 每仓库 1，上限 5 |
| PR / Issue 样本与总量 | `GET /search/issues` | ≤ 4 |
| Issue 首个外部回复（响应时长） | `GET /repos/{o}/{r}/issues/{n}/comments` | ≤ 5 |

单用户评估的 API 调用量上限约 **60 次**（ADR-002）。采集按"原创仓库、Star 降序"分配预算，
Fork 与空仓库不消耗配额；单个请求失败仅标记该仓库 `signalsCollected: false`，
对应维度判为"数据不足"，不影响其余维度。

### 4.2.2 "未采集" 与 "确实为 0" 的语义区分

Phase 1 骨架曾把未采集字段一律填 `0`，导致两类严重失真：

1. `avgIssueResponseHours = 0` 命中"响应 < 2 小时 +40 分"分支 → **无数据被当作极速响应加分**；
2. `contributionVariance = 0 < 0.5` → **无数据被判定为"贡献图过于均匀"假红牌**。

因此 Phase 2 明确约定：

| 取值 | 含义 | 例子 |
|------|------|------|
| `false` / `0` | 已采集，确认不存在 | `hasCiConfig: false` |
| `null` | 样本不足，无法判定（比率型指标） | `avgIssueResponseHours: null`、`contributionVariance: null` |
| `undefined` | 未采集（`?` 可选字段） | `signalsCollected` 之外的细粒度信号 |
| `available: false` | 维度级：数据不足以计分 | 采集失败时的"架构与设计" |

所有依赖这些取值的算法与红牌判定都必须显式处理 `null`（降级为"无法判定"），
且新增信号时须同步更新本节与本表。

### 4.3 红牌检测（10 项刷分特征）

红牌检测用于识别人为刷分的账户，检测到任一红牌特征将在报告中标注警示，并酌情降低综合评分。

| # | 红牌特征 | 检测方式 | 触发阈值 |
|---|---------|---------|---------|
| 1 | PR 自合并比例过高 | 被合并 PR 中目标仓库属于本人的比例（代理指标），**且完全无协作痕迹**（Review 评论 = 0 且协作者 = 0） | > 60% |
| 2 | Fork 囤积 | 仓库列表中 Fork 占比 | > 80% 且无原创代码 |
| 3 | AI 生成代码特征 | 提交信息中的 AI 共同署名（Copilot/Claude/Cursor…）与模板化提交占比，**需有提交样本** | 概率 > 70% |
| 4 | 提交时间分布异常 | 提交时间按 UTC 小时做直方图，单小时占比 ≥ 60%，**且样本 ≥ 10 条** | Bot 模式 |
| 5 | Star/Follow 比例失调 | 获得 Star 数 vs 关注者数比值 | 比值 > 100:1 |
| 6 | 空仓库过多 | 仅有 README 初始化的仓库 | > 50% 的仓库为空 |
| 7 | 批量仓库同名 | 多个仓库名称相似（模板克隆） | 相似度 > 90% |
| 8 | 无意义提交信息 | 提交信息为 "update"、"fix" 等模板化短语或过短，**需有提交样本** | > 60% 的提交为无意义 |
| 9 | Issue 自问自答 | 自己提 Issue 自己关闭 | > 70% |
| 10 | 贡献图过于均匀 | 日提交量的变异系数，**采样跨度需 ≥ 7 天**，否则判为"无法判定" | < 0.5 |

> **反假阳性原则**：红牌只能由"已采集且确有异常"的数据触发。
> 独立维护者合并自己的 PR、账号新建尚无提交历史等**正常情形不得报红**——
> 前者叠加"无协作痕迹"必要条件，后者要求样本充足（红牌 #3/#4/#8/#10）。


## 五、用户使用流程

```
┌─────────────────────────────────────────────────────────────────┐
│  Step 1: 用户访问 https://github.com/apps/hexascope             │
│          → 点击 "Install" 一键安装 GitHub App                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 2: 用户评论 /evaluate <用户名> 或手动触发评估            │
│          → 采集用户公开数据 → 六维评分 → 生成雷达图             │
│          → 提交结果到 zhaozg/HexaScope/results/                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│  Step 3: 查看评估报告（多种方式）                              │
│  ├── GitHub Pages: https://zhaozg.github.io/HexaScope/[user]   │
│  ├── README Badge: ![HexaScope](...svg) 嵌入个人主页           │
│  └── Copilot Chat: @HexaScope 查看我的报告                     │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│  Step 4: 定期增量更新（每周一次，仅限活跃用户）                │
│          → 始终保持评估结果与最新活动同步                      │
└────────────────────────────────────────────────────────────────┘
> **🔒 隐私边界（仅自我评估）**：HexaScope **只评估安装 App 的账户本人**，不评估、不公开任何他人画像。⚠️ 自我评估存在主观偏差（“戏剧化”）：分数可能受自我认知偏差影响，报告**仅供参考**，不构成招聘、评级或任何决策依据。
```


## 六、技术栈

| 组件 | 技术选型 | 说明 |
|------|---------|------|
| **GitHub App** | GitHub App Framework | OAuth 授权、Webhook 处理 |
| **自动化引擎** | GitHub Actions | 定时采集、计算、提交 |
| **评分核心** | Bun (TypeScript) | 确定性六维评分算法 |
| **雷达图生成** | Bun (Mermaid radar) | 生成 Mermaid radar 代码（报告产物 + 前端渲染） |
| **前端仪表板** | NueJS (Nuekit 2.0 SPA) | GitHub Pages 静态托管，mermaid.js 渲染雷达图 |
| **Copilot 集成** | Copilot Extensions API | 自然语言交互 |
| **数据缓存** | GitHub Actions Cache | 减少 API 调用次数 |
| **许可证** | MIT License | 开源协议 |


## 七、免费策略与成本控制

**对用户完全免费**，成本通过以下方式控制：

| 成本项 | 控制策略 |
|--------|---------|
| GitHub API 调用 | 使用 GitHub Actions Cache + 增量更新策略 |
| 计算资源 | GitHub Actions 免费额度（2000 分钟/月）+ 自托管 Runner 支持 |
| 存储 | GitHub 仓库存储（免费） |
| 带宽 | GitHub Pages + CDN（免费） |

**触发机制优化**：

1. **首次评估**：用户安装 App 后立即触发一次完整评估
2. **增量更新**：定时任务**仅更新活跃用户**（近 7 天有提交活动的用户），而非全量更新所有已安装用户
3. **按需刷新**：用户可通过 Issue 评论 `@HexaScope evaluate` 手动触发（仅评估自己）
4. **缓存策略**：评估结果缓存 24 小时，缓存期内重复请求直接返回缓存数据

**成本估算**（以 1000 名安装用户为基准）：

| 场景 | Actions 分钟数 | 说明 |
|------|---------------|------|
| 每周增量更新（假设 20% 活跃） | ~200 分钟/周 ≈ 800 分钟/月 | 每次评估约 1 分钟 |
| 手动触发（保守估计 50 次/周） | ~50 分钟/周 ≈ 200 分钟/月 | |
| **合计** | **~1000 分钟/月** | 在 2000 分钟免费额度内 ✅ |

**自托管 Runner 支持**：

对于大型组织或有大量用户的自托管实例，HexaScope 支持配置 GitHub Self-hosted Runner，完全免除 Actions 分钟数限制。相关配置详见 [SELF_HOSTING.md](docs/SELF_HOSTING.md)。


## 八、实施路线图

| 阶段 | 时间 | 交付物 |
|------|------|--------|
| **Phase 1** | Week 1-2 | GitHub App 创建与配置、OAuth 流程、基础数据采集脚本 |
| **Phase 2** | Week 3-4 | 六维评分算法实现、红牌检测、单元测试 |
| **Phase 3** | Week 5-6 | GitHub Actions 工作流编写、雷达图 SVG 生成、结果自动提交 |
| **Phase 4** | Week 7 | GitHub Pages 仪表板开发、README Badge 生成、数据读取方案落地 |
| **Phase 5** | Week 8 | Copilot Extensions 集成、文档编写、开源发布 |


## 九、与现有工具的差异化

| 特性 | HexaScope | ghfind | ghRadar | oscanner |
|------|-----------|--------|--------|----------|
| **GitHub 原生集成** | ✅ (App+Actions+Copilot) | ❌ | ❌ | ❌ |
| **GitHub Actions 自动化** | ✅ | ❌ | ❌ | ❌ |
| **Copilot 自然语言交互** | ✅ | ❌ | ❌ | ❌ |
| **六维能力雷达图** | ✅ | ✅ | ✅ | ✅ |
| **完全免费** | ✅ | ✅ | ❌ | ❌ |
| **开源 (MIT)** | ✅ | ✅ | ✅ | ❌ |
| **自托管** | ✅ | ✅ | ✅ | ✅ |

**核心差异化**：HexaScope 不是"又一个评估工具"，而是**深度融入 GitHub 生态的能力评估基础设施**——用户无需离开 GitHub 即可完成评估、查看报告、通过 Copilot 交互，所有数据采集和计算由 GitHub Actions 自动完成。


## 十、项目仓库结构

```
zhaozg/HexaScope/
├── .github/
│   ├── workflows/
│   │   ├── analyze.yml          # 核心评估工作流
│   │   ├── ci.yml               # CI 质量门禁（测试/类型/Lint/构建）
│   │   └── deploy-pages.yml     # Pages 部署
│   └── ISSUE_TEMPLATE/
│       └── evaluate.md          # 用户手动触发模板
├── scripts/
├── scripts/
│   ├── fetchUserData.ts         # 数据采集
│   ├── scoreCalculator.ts       # 六维评分
│   ├── redflagDetector.ts       # 红牌检测
│   └── generateRadar.ts         # 雷达图生成
├── frontend/                   # NueJS 仪表板（Nuekit 2.0 SPA）
│   ├── index.html               # SPA 入口：查询路由 ?user=、顶栏、页脚
│   ├── site.yaml                # Nuekit 配置（import_map: mermaid CDN）
│   ├── ui/
│   │   └── entry.html           # 组件库：home（首页）、dashboard（用户仪表板）
│   ├── demo-report.json         # 内置演示报告（单一数据源，构建时复制到 .dist/）
│   ├── server/
│   │   └── index.js             # 开发路由：/api/report/:username（demo mock / raw 代理）
│   └── css/
│       ├── base.css             # 设计令牌 + 基础样式（深色主题）
│       └── components.css       # 组件样式（面板/雷达/得分条/红牌）
├── results/                     # 评估结果（自动提交）
│   └── {username}/
│       ├── report.json          # 完整评估报告（含各维度得分拆解）
│       ├── radar.mmd            # 雷达图 Mermaid 代码
│       └── badge.svg            # README 徽章
├── docs/
│   ├── API.md                   # Copilot Extension API
│   ├── USER_GUIDE.md            # 用户使用指南
│   └── SELF_HOSTING.md          # 自托管部署指南
├── tests/                       # 单元测试
│   ├── scoring.test.ts
│   ├── redflag.test.ts
│   ├── radar.test.ts
│   └── fetch.test.ts
├── DESIGN.md                    # 本设计文档
├── LICENSE                      # MIT
└── README.md
```


## 十一、附录：技术决策记录（ADR）

### ADR-001：为什么选择 GitHub Raw 而非构建时注入数据

**状态**：已采纳

**背景**：`frontend/` 需要展示 `results/` 目录中的评估数据。

**决策**：前端直接通过 JavaScript 调用 `raw.githubusercontent.com` 读取 JSON 数据。

**理由**：
- 保持前端构建与数据分离，无需每次评估后重新构建 Pages
- 数据实时性高，评估完成后立即可见
- 实现简单，维护成本低
- 唯一的额外成本是用户的浏览器需额外发送一次 HTTPS 请求

### ADR-002：为什么采用增量更新而非全量更新

**状态**：已采纳

**背景**：随着安装用户增长，每周全量评估所有用户将超出 Actions 免费额度。

**决策**：定时任务仅评估近 7 天有提交活动的活跃用户。

**理由**：

- 绝大多数用户的活动频率较低，其雷达图不会在短期内发生显著变化
- 用户手动触发 `@HexaScope evaluate` 可随时刷新自己的数据
- 将 Actions 分钟数控制在免费额度内，确保项目持续免费运营

### ADR-003：为什么前端采用 NueJS 而非 React + ECharts

**状态**：已采纳

**背景**：原设计文档规划前端使用 React + ECharts 渲染仪表板。

**决策**：改用 NueJS（Nuekit 2.0 SPA）构建前端，雷达图由 mermaid.js 渲染。

**理由**：

- **技术栈统一**：Nuekit 2.0 与项目同为 Bun 原生工具链，安装与构建零 Node 依赖，符合"GitHub First / 零成本运营"原则
- **内容优先、极简**：组件即标准 HTML（`.html` 文件），无构建期 JSX/TSX 编译心智负担，样式采用原生 CSS 设计令牌
- **SPA 路由契合静态托管**：查询参数路由（`?user=`）与 GitHub Pages 子路径部署天然兼容，无需 history fallback（`404.html`）技巧；路径路由 `/:id` 在子路径下会因前缀错位而失效
- **数据读取**：遵循 ADR-001，生产环境直连 `raw.githubusercontent.com` 读取 `results/` 报告，开发环境经 Nuekit dev server 代理（`demo` 用户走本地 mock）；生产环境 `demo` 用户回退到站点内置演示报告（`./demo-report.json`，GitHub Pages 离线可用，零后端依赖）

**代价**：Nuekit 2.0 处于 beta 阶段（v2.0.0-beta.2），版本迭代较快；前端组件为 HTML 内联脚本，无法纳入 bun test 单元测试，依赖构建期验证。

#### 构建期必须改写的两处产物（否则线上整站白屏）

`nue build` 的输出不能直接部署，`scripts/frontend-build.ts` 负责两项改写，二者都曾导致线上事故：

| 产物 | 问题 | 改写 | 不修复的后果 |
|------|------|------|-------------|
| `index.html` 的 import map 位置 | Nuekit 把 import map 放在 `<script type="module">` **之后** | `hoistImportMap()` 提前到首个 module 脚本之前 | 按 HTML 规范，import map 必须在任何 module 脚本开始加载前出现，否则**整张 import map 被浏览器忽略**，裸模块名 `state`/`mermaid` 无法解析，组件模块加载失败，页面完全空白 |
| `@nue/mount.js` 的动态 import | 形如 `` import(`/${n}.js${i}`) `` 按站点根解析 | `rewriteMountJs()` 改写为 `` `../${n}.js${i}` `` | 浏览器请求 `https://zhaozg.github.io/index.html.js` → 404，页面空白 |

> **不要用字面量匹配变量名**：压缩器在 CI 与本机可能把变量命名为不同标识符（`n` / `o`……），
> 早期实现按字面量匹配 `` `/${n}.js${i}` ``，在 CI 产物上静默失效并直接部署坏产物。
> 现改用捕获组正则，且改写后若仍残留按站点根解析的 import，**构建显式抛错**，由 CI 在部署前拦截。
> 升级 Nuekit 或调整构建配置后，务必重跑 `tests/frontend-build.test.ts`。

> **渲染库降级**：`mermaid` 在组件内以**动态** `import('mermaid')` 加载。
> 若写为静态导入，CDN 不可达时整个组件模块会加载失败，报告正文也无法显示；
> 动态导入下仅雷达图降级为提示文案，六维得分、证据链与智能解读照常渲染。

### ADR-004：LLM 智能解读层为何不参与打分

**状态**：已采纳

**背景**：用户反馈 Phase 1 报告可读性差、缺乏洞察。直觉方案是"引入免费 LLM 做智能评分"。
但 AGENTS.md §2 要求评分必须**确定性、可解释、可追溯**，且默认不得引入外部评估 API；
GitHub Models 已于 2025 进入退役停服（实测返回 `github_models_retirement_brownout`），
免费的 LLM 只能来自外部供应商（OpenRouter 免费池 / DeepSeek 等）。

**决策**：新增 `scripts/insights.ts` 作为**可选的定性解读层**，严格不参与打分：

- **分数与红牌 100% 由确定性算法产出**：`scoreCalculator.ts` / `redflagDetector.ts` 不含任何随机因素，也不接受 LLM 输入；
- **输入受限**：只把算法已产出的结构化事实（维度得分 + 证据 + 红牌 + 关键统计）序列化后交给模型，提示词明确禁止编造证据之外的内容；
- **可复现**：请求 `temperature: 0`，并按证据 SHA-256 指纹缓存——输入不变则复用旧解读，重跑同分同文（跨用户比较不受影响）；
- **优雅降级**：未配置 Key、限流、超时、响应不可解析时静默跳过，报告照常生成；
- **多模型回退链**：免费池常有"HTTP 200 但 body 为上游 502"与 429，按序尝试 `HEXASCOPE_LLM_MODEL`（或默认链），任一成功即返回；
- **密钥边界**：仅从环境变量读取（`HEXASCOPE_LLM_API_KEY` / `HEXASCOPE_LLM_BASE_URL` / `HEXASCOPE_LLM_MODEL`，回退 `OPENROUTER_API_KEY` / `DEEPSEEK_API_KEY`），不硬编码、不打印。

**代价**：解读层引入一次外部网络调用（默认 ≤ 45s 超时），在 Actions 中属可忽略成本；
若维护者未配置密钥，报告将不含解读段落（前端自动隐藏该面板）。

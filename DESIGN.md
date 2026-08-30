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

**安装流程**：用户访问 HexaScope 的 GitHub App 安装页面 → 点击 "Install" 一键安装 → 自动触发 Actions 工作流生成评估报告。

### 3.2 GitHub Actions（自动化数据采集与计算）

这是 HexaScope 的**核心自动化引擎**，参考了 `github-user-stats`、`devex-metrics`、`Metrics` 等成熟方案的设计模式。

**工作流设计** (`.github/workflows/analyze.yml`)：

```yaml
name: HexaScope - 六维能力评估

on:
  # 1. 用户安装 App 后触发
  installation:
    types: [created]
  # 2. 用户主动请求（通过 HexaScope 仓库的 Issue 评论触发）
  issue_comment:
    types: [created]
  # 3. 定时增量更新（每周一次，仅更新活跃用户）
  schedule:
    - cron: '0 0 * * 0'  # 每周日 00:00 UTC
  # 4. 手动触发
  workflow_dispatch:
    inputs:
      username:
        description: 'GitHub 用户名'
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
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: 采集用户数据
        run: |
          python scripts/fetch_user_data.py ${{ github.actor }}
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: 六维评分计算
        run: |
          python scripts/score_calculator.py

      - name: 红牌检测
        run: |
          python scripts/redflag_detector.py

      - name: 生成雷达图
        run: |
          python scripts/generate_radar.py

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
@HexaScope evaluate @用户名
```

系统通过 `issue_comment` 事件捕获该评论，解析用户名后触发评估流程。这避免了多 App 监听同一仓库 Issue 的权限冲突问题。

### 3.3 GitHub Copilot Extensions（自然语言交互）

HexaScope 可发布为 **GitHub Copilot Extension**，让用户在 IDE 内通过自然语言查询评估结果：

**使用示例**：

```
用户: @HexaScope 帮我分析一下 zhaozg 的能力雷达图
Copilot: [调用 HexaScope API] 正在获取 zhaozg 的六维评估结果...
         技术硬实力: 92/100
         架构设计: 85/100
         问题排查: 78/100
         工程化效能: 82/100
         沟通协作: 65/100
         业务洞察: 72/100
         [附雷达图]
```

**技术实现**：

- 通过 **Copilot Skillsets** 快速实现轻量级集成
- 或通过 **MCP (Model Context Protocol)** 实现更丰富的交互能力
- 支持 **上下文传递**，可根据用户当前打开的仓库提供针对性分析

### 3.4 GitHub Pages（公开仪表板）

评估结果通过 **GitHub Pages** 公开托管。

**数据读取方案**：

前端仪表板（React + ECharts）通过以下方式读取评估数据：

- **方案 B（已采纳）**：前端直接通过 JavaScript 调用 GitHub Raw 文件链接获取数据
  - 数据 URL：`https://raw.githubusercontent.com/zhaozg/HexaScope/main/results/{username}/report.json`
  - 雷达图 SVG：`https://raw.githubusercontent.com/zhaozg/HexaScope/main/results/{username}/radar.svg`
  - 徽章 SVG：`https://raw.githubusercontent.com/zhaozg/HexaScope/main/results/{username}/badge.svg`

- **优点**：无需构建时注入数据，始终保持最新；实现简单，维护成本低
- **注意**：需配置 `Content-Security-Policy` 允许访问 `raw.githubusercontent.com`

**Pages 站点功能**：

- 每个用户的评估报告以 JSON + SVG 格式存储于 `results/` 目录
- Pages 站点提供交互式雷达图（基于 ECharts）
- 支持用户间对比、趋势查看等功能
- 通过 URL 路由 `/pages/{username}` 展示对应用户的仪表板


## 四、六维评估模型（数据来源映射）

### 4.1 维度定义与权重

| 维度 | 权重 | GitHub 数据来源 | 具体指标 |
|------|------|----------------|---------|
| **技术硬实力** | 25% | 仓库语言分布、代码复杂度 | 语言广度、Top 3 项目质量评分 |
| **架构与设计** | 20% | 仓库结构、文档完备性、测试覆盖 | 是否有 ARCHITECTURE.md、测试目录、CI 配置 |
| **问题排查** | 15% | Issue 响应、Bug 修复 PR | 平均响应时长、修复 PR 数量与质量 |
| **工程化效能** | 15% | CI/CD 配置、Dockerfile、自动化工具 | 工具链完备性、自动化程度 |
| **沟通协作** | 15% | PR 描述、Code Review 评论、Issue 讨论 | 协作活跃度、沟通质量 |
| **业务洞察** | 10% | README 质量、项目实际问题陈述 | 项目价值清晰度、需求理解深度 |

### 4.2 评分逻辑细则

各维度 0-100 分，通过确定性算法计算。以下是各维度的核心计算公式：

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

### 4.3 红牌检测（10 项刷分特征）

红牌检测用于识别人为刷分的账户，检测到任一红牌特征将在报告中标注警示，并酌情降低综合评分。

| # | 红牌特征 | 检测方式 | 触发阈值 |
|---|---------|---------|---------|
| 1 | PR 自合并比例过高 | 统计 PR 的合并者与创建者是否同一人 | > 60% |
| 2 | Fork 囤积 | 仓库列表中 Fork 占比 | > 80% 且无原创代码 |
| 3 | AI 生成代码特征 | 提交信息模式、代码风格一致性检测 | 概率 > 70% |
| 4 | 提交时间分布异常 | 提交时间直方图分析 | 全部集中在工作时段（Bot 模式） |
| 5 | Star/Follow 比例失调 | 获得 Star 数 vs 关注者数比值 | 比值 > 100:1 |
| 6 | 空仓库过多 | 仅有 README 初始化的仓库 | > 50% 的仓库为空 |
| 7 | 批量仓库同名 | 多个仓库名称相似（模板克隆） | 相似度 > 90% |
| 8 | 无意义提交信息 | 提交信息为 "update"、"fix" 等 | > 60% 的提交为无意义 |
| 9 | Issue 自问自答 | 自己提 Issue 自己关闭 | > 70% |
| 10 | 贡献图过于均匀 | 每天提交数量高度一致 | 方差 < 0.5 |


## 五、用户使用流程

```
┌─────────────────────────────────────────────────────────────────┐
│  Step 1: 用户访问 https://github.com/apps/hexascope             │
│          → 点击 "Install" 一键安装 GitHub App                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 2: GitHub App 自动触发 Actions 工作流                     │
│          → 采集用户公开数据 → 六维评分 → 生成雷达图             │
│          → 提交结果到 zhaozg/HexaScope/results/                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│  Step 3: 查看评估报告（多种方式）                              │
│  ├── GitHub Pages: https://zhaozg.github.io/HexaScope/[user]   │
│  ├── README Badge: ![HexaScope](...svg) 嵌入个人主页           │
│  └── Copilot Chat: @HexaScope 分析 @用户名                     │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│  Step 4: 定期增量更新（每周一次，仅限活跃用户）                │
│          → 始终保持评估结果与最新活动同步                      │
└────────────────────────────────────────────────────────────────┘
```


## 六、技术栈

| 组件 | 技术选型 | 说明 |
|------|---------|------|
| **GitHub App** | GitHub App Framework | OAuth 授权、Webhook 处理 |
| **自动化引擎** | GitHub Actions | 定时采集、计算、提交 |
| **评分核心** | Python + NumPy | 确定性六维评分算法 |
| **雷达图生成** | Python (matplotlib) + svg | 生成 SVG/PNG 雷达图 |
| **前端仪表板** | React + ECharts | GitHub Pages 托管 |
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
3. **按需刷新**：用户可通过 Issue 评论 `@HexaScope evaluate @用户名` 手动触发
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
│   │   └── deploy-pages.yml     # Pages 部署
│   └── ISSUE_TEMPLATE/
│       └── evaluate.md          # 用户手动触发模板
├── scripts/
│   ├── fetch_user_data.py       # 数据采集
│   ├── score_calculator.py      # 六维评分
│   ├── redflag_detector.py      # 红牌检测
│   └── generate_radar.py        # 雷达图生成
├── frontend/
│   ├── src/                     # React 仪表板
│   │   ├── App.jsx
│   │   ├── components/
│   │   │   ├── RadarChart.jsx   # ECharts 雷达图组件
│   │   │   ├── ScoreCard.jsx    # 六维评分卡片
│   │   │   └── RedFlagList.jsx  # 红牌警示列表
│   │   └── utils/
│   │       └── api.js           # 调用 GitHub Raw 读取数据
│   └── public/
│       └── index.html
├── results/                     # 评估结果（自动提交）
│   └── {username}/
│       ├── report.json          # 完整评估报告（含各维度得分拆解）
│       ├── radar.svg            # 雷达图 SVG
│       ├── radar.png            # 雷达图 PNG（备用）
│       └── badge.svg            # README 徽章
├── docs/
│   ├── API.md                   # Copilot Extension API
│   ├── USER_GUIDE.md            # 用户使用指南
│   └── SELF_HOSTING.md          # 自托管部署指南
├── tests/                       # 单元测试
│   ├── test_scoring.py
│   └── test_redflag.py
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

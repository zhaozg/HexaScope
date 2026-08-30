## 一、项目定位

`HexaScope` 的定位说明：

1. **GitHub 原生生态插件**（独立系统）
2. **深度集成 GitHub CI/Actions/Copilot**
3. **对 GitHub 用户完全免费** |
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
│  ┌───────────────┐  ┌──────────────┐  ┌──────────────────────────────┐    │
│  │ 数据采集模块  │  │ 六维评分引擎 │  │ 报告生成与可视化模块         │    │
│  │ (GitHub API)  │  │ (确定性算法) │  │  (雷达图 SVG/JSON)           │    │
│  └───────────────┘  └──────────────┘  └──────────────────────────────┘    │
│  ┌───────────────┐  ┌───────────────┐  ┌─────────────────────────────┐    │
│  │ 缓存管理      │  │ 红牌检测      │  │ 对比分析引擎                │    │
│  │ (GitHub Cache)│  │ (10项刷分特征)│  │ (开发者横向对比)            │    │
│  └───────────────┘  └───────────────┘  └─────────────────────────────┘    │
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

**安装流程**：用户访问 HexaScope 的 GitHub App 安装页面 → 一键安装 → 自动回调生成评估报告。

### 3.2 GitHub Actions（自动化数据采集与计算）

这是 HexaScope 的**核心自动化引擎**，参考了 `github-user-stats`、`devex-metrics`、`Metrics`等成熟方案的设计模式。

**工作流设计** (`.github/workflows/analyze.yml`)：

```yaml
name: HexaScope - 六维能力评估

on:
  # 1. 用户安装 App 后触发
  installation:
    types: [created]
  # 2. 用户主动请求（通过 Issue 评论触发）
  issue_comment:
    types: [created]
  # 3. 定时全量更新（每周一次）
  schedule:
    - cron: '0 0 * * 0'  # 每周日 00:00 UTC
  # 4. 手动触发
  workflow_dispatch:
    inputs:
      username:
        description: 'GitHub 用户名'
        required: true

jobs:
  evaluate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: 采集用户数据
        run: |
          # 调用 GitHub API 获取用户仓库、贡献、PR、Issue 等数据
          python scripts/fetch_user_data.py ${{ github.actor }}
      - name: 六维评分计算
        run: |
          python scripts/score_calculator.py
      - name: 生成雷达图
        run: |
          python scripts/generate_radar.py
      - name: 提交结果到仓库
        run: |
          git add results/
          git commit -m "Auto-update: ${{ github.actor }} 的评估报告"
          git push
```

**数据采集能力**：

- 通过 GitHub REST API 获取用户仓库列表及详情
- 通过 GitHub GraphQL API 批量获取贡献数据
- 通过 Repository Statistics API 获取提交、增删行数等详细统计
- 自动识别并过滤 Fork 仓库，仅分析原创项目

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

评估结果通过 **GitHub Pages** 公开托管：

- 每个用户的评估报告以 JSON + SVG 格式存储于仓库
- Pages 站点提供交互式雷达图（基于 ECharts/Recharts）
- 支持用户间对比、趋势查看等功能


## 四、六维评估模型（数据来源映射）

| 维度 | 权重 | GitHub 数据来源 | 具体指标 |
|------|------|----------------|---------|
| **技术硬实力** | 25% | 仓库语言分布、代码复杂度 | 语言广度、Top 3 项目质量评分 |
| **架构与设计** | 20% | 仓库结构、文档完备性、测试覆盖 | 是否有 ARCHITECTURE.md、测试目录、CI 配置 |
| **问题排查** | 15% | Issue 响应、Bug 修复 PR | 平均响应时长、修复 PR 数量与质量 |
| **工程化效能** | 15% | CI/CD 配置、Dockerfile、自动化工具 | 工具链完备性、自动化程度 |
| **沟通协作** | 15% | PR 描述、Code Review 评论、Issue 讨论 | 协作活跃度、沟通质量 |
| **业务洞察** | 10% | README 质量、项目实际问题陈述 | 项目价值清晰度、需求理解深度 |

**评分逻辑**：各维度 0-100 分，通过确定性算法计算，加权汇总后输出综合得分。

**红牌检测**（10 项刷分特征）：

- PR 自合并比例过高
- Fork 囤积（大量 Fork 无原创）
- AI 生成代码特征明显
- 提交时间分布异常（Bot 行为）
- Star/Follow 比例失调
- 等


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
│  Step 4: 定期自动更新（每周一次）                              │
│          → 始终保持评估结果与最新活动同步                      │
└────────────────────────────────────────────────────────────────┘
```


## 六、技术栈（修正版）

| 组件 | 技术选型 | 说明 |
|------|---------|------|
| **GitHub App** | GitHub App Framework | OAuth 授权、Webhook 处理 |
| **自动化引擎** | GitHub Actions | 定时采集、计算、提交 |
| **评分核心** | Python + NumPy | 确定性六维评分算法 |
| **雷达图生成** | Python (matplotlib) / Node.js (Sharp) | 生成 SVG/PNG 雷达图 |
| **前端仪表板** | React + ECharts | GitHub Pages 托管 |
| **Copilot 集成** | Copilot Extensions API | 自然语言交互 |
| **数据缓存** | GitHub Actions Cache | 减少 API 调用次数 |
| **许可证** | MIT License | 已明确 |


## 七、免费策略与成本控制

**对用户完全免费**，成本通过以下方式控制：

| 成本项 | 控制策略 |
|--------|---------|
| GitHub API 调用 | 使用 GitHub Actions 缓存 + 合理设计触发频率 |
| 计算资源 | GitHub Actions 免费额度（2000 分钟/月）足够支撑 |
| 存储 | GitHub 仓库存储（免费） |
| 带宽 | GitHub Pages + CDN（免费） |

**触发机制**：

- 用户主动安装 App → 立即触发一次评估
- 定时任务：每周日全量更新一次（评估所有已安装用户）
- 用户可通过 Issue 评论 `@hexascope evaluate` 手动触发刷新


## 八、实施路线图（修正版）

| 阶段 | 时间 | 交付物 |
|------|------|--------|
| **Phase 1** | Week 1-2 | GitHub App 创建与配置、OAuth 流程、基础数据采集脚本 |
| **Phase 2** | Week 3-4 | 六维评分算法实现、红牌检测、单元测试 |
| **Phase 3** | Week 5-6 | GitHub Actions 工作流编写、雷达图 SVG 生成、结果自动提交 |
| **Phase 4** | Week 7 | GitHub Pages 仪表板开发、README Badge 生成 |
| **Phase 5** | Week 8 | Copilot Extensions 集成、文档编写、开源发布 |


## 九、与现有工具的差异化（修正版）

| 特性 | HexaScope | ghfind | ghRadar | oscanner |
|------|-----------|--------|--------|--------|
| **GitHub 原生集成** | ✅ (App+Actions+Copilot) | ❌ | ❌ | ❌ |
| **GitHub Actions 自动化** | ✅ | ❌ | ❌ | ❌ |
| **Copilot 自然语言交互** | ✅ | ❌ | ❌ | ❌ |
| **六维能力雷达图** | ✅ | ✅ | ✅ | ✅ |
| **完全免费** | ✅ | ✅ | ❌ | ❌ |
| **开源 (MIT)** | ✅ | ✅ | ✅ | ❌ |
| **自托管** | ✅ | ✅ | ✅ | ✅ |

**核心差异化**：HexaScope 不是"又一个评估工具"，而是**深度融入 GitHub 生态的能力评估基础设施**——用户无需离开 GitHub 即可完成评估、查看报告、通过 Copilot 交互，所有数据采集和计算由 GitHub Actions 自动完成。


## 十、项目仓库结构（建议）

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
│   └── public/
├── results/                     # 评估结果（自动提交）
│   └── {username}/
│       ├── report.json
│       ├── radar.svg
│       └── badge.svg
├── docs/
│   ├── API.md                   # Copilot Extension API
│   └── USER_GUIDE.md
├── LICENSE                      # MIT
└── README.md
```

---

这个方案完整地将 HexaScope 定位为**一个开源、免费、深度集成 GitHub 原生能力的开发者评估生态**，
而非一个独立的浏览器插件或外部服务。

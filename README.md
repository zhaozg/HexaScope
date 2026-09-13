# HexaScope 🚀

> 基于 GitHub 原生生态的开发者六维能力雷达图生成器

[![GitHub App](https://img.shields.io/badge/GitHub_App-Install_Now-2ea44f?logo=github)](https://github.com/apps/hexascope)
[![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-Automated-2088FF?logo=github-actions)](.github/workflows/analyze.yml)
[![Copilot Extension](https://img.shields.io/badge/Copilot-Extension-8957E5?logo=githubcopilot)](docs/COPILOT.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

---

## 📖 什么是 HexaScope？

**HexaScope** 是一个深度集成 GitHub 原生能力的开源开发者评估生态。

只需一键安装 HexaScope GitHub App，系统便会自动通过 GitHub Actions 拉取**你自己**的公开数据，从**六个核心维度**生成能力雷达图，并通过 GitHub Pages 公开展示。你还可以在 IDE 中通过 GitHub Copilot 自然语言查询**自己的**评估结果——**这一切完全免费**。

## ✨ 核心特性

- **🤖 全自动评估**：安装 GitHub App 即触发首次评估，此后每周自动更新，始终保持最新
- **🧠 Copilot 自然语言交互**：在 IDE 中通过 `@HexaScope 查看我的报告` 直接查询自己的雷达图（仅支持自我评估）
- **📊 六维能力模型**：技术硬实力 · 架构设计 · 问题排查 · 工程化效能 · 沟通协作 · 业务洞察
- **🛡️ 反作弊检测**：内置 10 项红牌指标（自合并比例、Fork 囤积、AI 代码特征、Bot 行为等），过滤虚假繁荣
- **🔍 评分可追溯**：每个维度在报告中都给出 `evidence` 证据链与数据覆盖度说明；未采集到的数据**不计 0 分**
- **🧠 AI 智能解读（可选）**：由免费 LLM 把确定性结果转写为优势／短板／提升建议；**不参与打分**，未配置密钥则自动跳过
- **💰 完全免费**：基于 GitHub Actions 免费额度运行，无需付费
- **📦 开源可自托管**：MIT 协议，企业可私有化部署
- **🔒 仅自我评估**：只评估安装 App 的账户本人，不评估/公开他人画像；自我评估存在主观偏差（戏剧化），结果仅供参考

## 🧠 关于 AI 智能解读（可选）

报告中的「AI 智能解读」段落由**免费 LLM** 生成，用于把结构化结果转写为可读的洞察与建议。

- **不参与打分**：六维得分与红牌完全由确定性算法计算，LLM 只读不写；重跑同分同文（证据指纹缓存 + `temperature=0`）
- **默认免费**：默认走 OpenRouter 免费模型池，并支持多模型回退；未配置密钥、限流或超时时**自动跳过**，报告照常生成
- **凭据安全**：密钥仅从环境变量读取，绝不硬编码、绝不打印

启用方式（任选其一，二选一即可）：

```bash
# 本地运行
export OPENROUTER_API_KEY="sk-or-..."   # 或 DEEPSEEK_API_KEY
bun scripts/cli.ts evaluate <你的用户名> --insights

# GitHub Actions：在仓库 Settings → Secrets and variables → Actions 添加
#   Secret: HEXASCOPE_LLM_API_KEY = sk-or-...
#   （可选）Variable: HEXASCOPE_LLM_MODEL / HEXASCOPE_LLM_BASE_URL
# 未配置时工作流自动跳过解读，不影响评分与红牌
```

> 任意 OpenAI Chat Completions 兼容端点均可通过 `HEXASCOPE_LLM_BASE_URL` + `HEXASCOPE_LLM_MODEL` 接入（如自建网关或 DeepSeek）。

## 🚀 快速开始

### 0️⃣ 快速通道：手动触发评估（无需 App）

> App 尚在注册中或不想安装？直接到仓库 **Actions** 页手动运行评估：
> `Actions` → 左侧 <em>HexaScope - 六维能力评估</em> → `Run workflow` →
> 输入**你自己的** GitHub 用户名 → `Run workflow`。约 1-2 分钟生成报告
> （隐私边界：仅允许评估触发者本人）。

### 1️⃣ 注册 GitHub App（仅首次，可选）

点击下方按钮一键注册 `hexascope` App（GitHub App Manifest 流程）：

[![注册 HexaScope App](https://img.shields.io/badge/Register-HexaScope_App-2ea44f?style=for-the-badge&logo=github)](https://zhaozg.github.io/HexaScope/app-manifest.html)

### 2️⃣ 安装 GitHub App

点击下方按钮，一键安装 HexaScope 到你的 GitHub 账户：

[![安装 HexaScope](https://img.shields.io/badge/🚀_Install_HexaScope-2ea44f?style=for-the-badge&logo=github)](https://github.com/apps/hexascope)

安装时授予以下只读权限：
- `read:user` — 读取基本信息
- `repo` (只读) — 读取公开仓库
- `read:org` — 读取组织信息（可选）

### 3️⃣ 等待评估完成

安装完成后，到本仓库任意 Issue 评论 `/evaluate 你的用户名`（或到 Actions 页手动运行评估），约 **1-2 分钟** 即可生成报告。

你可以通过仓库的 **Actions** 标签页查看实时进度：

```
https://github.com/zhaozg/HexaScope/actions
```

### 4️⃣ 查看你的雷达图

评估完成后，通过以下任一方式查看报告：

| 方式 | 地址/操作 |
|------|---------|
| 🌐 **GitHub Pages** | `https://zhaozg.github.io/HexaScope/?user=[你的用户名]` |
| 🏷️ **README Badge** | 将 `![HexaScope](https://zhaozg.github.io/HexaScope/[用户名]/badge.svg)` 嵌入个人主页 |
| 💬 **Copilot Chat** | 在 IDE 中输入 `@HexaScope 查看我的报告`（仅本人） |

### 5️⃣ 自动更新

系统每周日自动重新评估，你的雷达图将随着贡献活动动态变化。

## 📸 效果预览

> 雷达图示例（mermaid.js 渲染 radar-beta 图表）

```
           技术硬实力
              ▲
             / \
            /   \
           /     \
工程化效能│       │ 架构设计
          │       │
          │       │
          │       │
 沟通协作 │       │ 问题排查
           \     /
            \   /
             \ /
              ▼
          业务洞察
```

> 实际页面为交互式雷达图，支持悬停查看分数明细。（效果图待补充）

## 🧩 六维能力模型（设计哲学）

HexaScope 的能力评估基于经典的**程序员六维模型**，六个顶点共同构成完整的技术人画像：

### 1. 技术硬实力（编程语言与框架）
把想法转化为代码的执行力。不仅熟悉语法，更掌握生态与底层原理（内存模型、GC机制）。从“会用”到“用好”。

### 2. 架构与设计能力（系统设计与抽象）
决定代码能“活多久”的关键。涵盖设计模式、SOLID 原则、DDD 以及高并发/高可用架构选型。具备业务前瞻性，在需求与资源间做出权衡。

### 3. 问题排查与调试能力（逻辑与根因分析）
优秀程序员与普通程序员的“分水岭”。不仅看报错信息，更追问“为什么发生”和“如何避免”。涵盖日志分析、性能剖析（Profiling）、内存泄漏检测。

### 4. 工程化与效能意识（工具链与自动化）
决定团队“奔跑速度”的维度。涵盖 CI/CD 流水线、自动化测试、容器化部署（Docker/K8s）。信奉“Don't repeat yourself”，主动用工具消灭重复劳动。

### 5. 沟通与团队协作（透明化与共情）
连接技术与业务的桥梁。涵盖技术文档、需求评审表达、跨部门沟通、Code Review 反馈。将复杂术语转化为业务方听得懂的收益。

### 6. 业务洞察与价值导向（产品思维）
决定“代码是否创造了真实价值”。理解需求的商业背景与用户画像，敢于对不合理需求提出挑战，从“接需求”转变为“共同创造”。

---

**平衡之道**：最理想的状态是六边形**面积最大且均匀**。找到最短的那条边，那就是你下一阶段要重点突破的方向。

## 🛠️ 技术栈

| 组件 | 技术选型 | 说明 |
|------|---------|------|
| **GitHub App** | GitHub App Framework | OAuth 授权、Webhook 处理 |
| **自动化引擎** | GitHub Actions | 定时采集、计算、提交 |
| **评分核心** | Bun (TypeScript) | 确定性六维评分算法 |
| **雷达图生成** | Bun (Mermaid radar) | 生成 Mermaid radar 代码（报告产物 + 前端渲染） |
| **前端仪表板** | NueJS (Nuekit 2.0 SPA) | GitHub Pages 静态托管，mermaid.js 渲染雷达图 |
| **Copilot 集成** | Copilot Extensions API | 自然语言交互 |
| **数据缓存** | GitHub Actions Cache | 减少 API 调用次数 |

## 📁 项目结构

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
│   ├── index.html               # SPA 入口（?user= 查询路由）
│   ├── ui/entry.html            # 组件库（首页 + 用户仪表板）
│   ├── demo-report.json         # 内置演示报告（构建时复制到 .dist/，生产离线可用）
│   ├── server/                  # 开发路由（demo mock / raw 代理）
│   └── css/                     # 设计令牌 + 组件样式
├── results/                     # 评估结果（自动提交）
│   └── {username}/
│       ├── report.json
│       ├── radar.mmd
│       └── badge.svg
├── docs/
│   ├── API.md                   # Copilot Extension API
│   └── USER_GUIDE.md
├── DESIGN.md                    # 详细设计文档
├── LICENSE                      # MIT
└── README.md
```

## 💻 本地开发（前端仪表板）

前端基于 NueJS（Nuekit 2.0 SPA），依赖统一在根目录（`bun install` 即可）：

```bash
# 开发服务器（含演示数据，默认 http://localhost:4000）
bun run frontend:dev

# 构建静态产物 → frontend/.dist/（自动改写资源为相对路径，适配 GitHub Pages 子路径）
bun run frontend:build

# 预览构建产物
bun run frontend:preview
```

> 开发环境访问 `/?user=demo` 可查看本地演示报告；其余用户名经 dev server 代理
> 直读 `raw.githubusercontent.com` 上的真实报告（ADR-001）。生产环境
> `?user=demo` 直接读取站点内置演示报告（`./demo-report.json`），无需后端。

## 🚀 持续集成与部署（CI/CD）

项目通过 GitHub Actions 自动化质量检查与站点发布（工作流见 `.github/workflows/`）：

| 工作流 | 触发时机 | 作用 |
|--------|----------|------|
| `ci.yml` | main 推送 / 每个 PR | 单元测试（覆盖率 ≥ 85%）、TypeScript 类型检查、ESLint、Prettier、前端构建验证 |
| `deploy-pages.yml` | main 推送（frontend/ 变更） | 构建 Nuekit SPA 并部署到 GitHub Pages |

**Pages 部署前提**（一次性配置）：

1. 仓库 **Settings → Pages → Build and deployment**
2. **Source** 选择 **GitHub Actions**
3. 此后每次 `frontend/` 变更推送 main，站点自动发布到 `https://zhaozg.github.io/HexaScope/`

> 部署脚本会将构建产物的资源引用改写为相对路径，天然适配 GitHub Pages
> 子路径托管；CI 通过 `paths-ignore` 排除 `results/**`，避免评估数据自动提交
> 时触发无意义的 CI 循环（节省 Actions 分钟数）。

## 🤝 贡献指南

欢迎贡献代码、提交 Issue 或提出新功能建议！

1. Fork 本仓库
2. 创建你的特性分支 (`git checkout -b feature/amazing`)
3. 提交你的修改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing`)
5. 打开一个 Pull Request

详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 📄 开源协议

本项目采用 [MIT License](LICENSE) 开源协议，可自由使用、修改、分发，包括商业用途。

## 💬 社区交流

- **Issues**：报告 Bug 或提出建议 → [提交 Issue](https://github.com/zhaozg/HexaScope/issues)
- **Discussions**：技术交流与使用反馈 → [加入讨论](https://github.com/zhaozg/HexaScope/discussions)

---

**Star 🌟 本项目**，让更多开发者发现自己的成长方向！

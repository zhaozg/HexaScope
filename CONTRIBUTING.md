# 贡献指南 🤝

感谢你考虑为 **HexaScope** 贡献代码、文档或创意！我们欢迎任何形式的贡献，无论是修复一个 Bug、提出一个新功能建议，还是改进文档。

在开始之前，请花几分钟阅读以下指南，以确保贡献流程顺畅高效。

---

## 📜 行为准则

本项目遵循 [GitHub 开源社区行为准则](https://docs.github.com/en/site-policy/github-terms/github-community-code-of-conduct)。参与本项目即表示你同意遵守该准则。

如有任何疑问或举报不当行为，请联系项目维护者：`zhaozg` (可通过 GitHub Issue 联系)。

---

## 🚀 快速入门

### 1. 先决条件

在本地开发 HexaScope 之前，请确保已安装以下工具：

| 工具 | 最低版本 | 用途 |
|------|---------|------|
| **Node.js** | 18+ | 评分引擎、数据采集脚本、前端仪表板 |
| **npm** | 9+ | 依赖管理 |
| **Git** | 2.30+ | 版本控制 |
| **act** (可选) | 0.2+ | 本地测试 GitHub Actions |

### 2. Fork & Clone 仓库

```bash
# 1. Fork 本项目到你的 GitHub 账户（点击右上角 Fork）

# 2. 克隆你的 Fork 到本地
git clone https://github.com/你的用户名/HexaScope.git
cd HexaScope

# 3. 添加上游仓库（便于同步主分支更新）
git remote add upstream https://github.com/zhaozg/HexaScope.git
```

### 3. 安装依赖

**根目录依赖（脚本 + 评分引擎）：**

```bash
# 在项目根目录安装全部依赖
npm install
```

**前端环境（React 仪表板）：**

```bash
npm --prefix frontend install
```

### 4. 配置环境变量

在项目根目录创建 `.env` 文件（或复制 `.env.example`）：

```bash
# .env
GITHUB_TOKEN=your_personal_access_token  # 用于调用 GitHub API（需 repo 权限）
LOG_LEVEL=INFO
DEBUG=true
```

> ⚠️ **注意**：`GITHUB_TOKEN` 仅在本地开发/测试时使用。在生产环境（GitHub Actions）中，系统会自动使用内置的 `GITHUB_TOKEN`。

### 5. 运行测试

确保所有测试通过后再提交代码：

```bash
```bash
# 运行单元测试
npm test

# 前端 lint 检查
npm run lint
```

---

## 🔍 如何贡献

### 报告 Bug 🐛

如果你发现了 Bug，请通过 [GitHub Issues](https://github.com/zhaozg/HexaScope/issues) 提交，并尽可能提供以下信息：

- **标题**：简明扼要地描述问题
- **复现步骤**：详细列出触发 Bug 的操作步骤
- **预期行为**：你期望发生什么
- **实际行为**：实际发生了什么（附截图或日志）
- **环境信息**：浏览器版本、操作系统等（如适用）
- **相关代码**：如果与特定脚本或组件相关，请附上代码片段

### 建议新功能 ✨

我们欢迎新功能建议！提交 Issue 时请注明 `[Feature Request]` 前缀，并说明：

- **使用场景**：这个功能解决什么问题？
- **期望行为**：你希望这个功能如何工作？
- **替代方案**：是否有其他方式可以实现类似效果？（如果有，为什么不够好？）

### 改进文档 📖

文档是开源项目的“门面”。你可以帮助改进：

- 修复错别字、语法错误
- 补充缺失的 API 文档
- 添加使用示例或截图
- 翻译文档（欢迎多语言支持）

---

## 💻 开发工作流

### 1. 保持同步

在开始工作之前，确保你的 `main` 分支与上游保持同步：

```bash
git checkout main
git fetch upstream
git rebase upstream/main
```

### 2. 创建特性分支

请使用有描述性的分支名称：

```bash
git checkout -b feature/add-something-amazing
# 或
git checkout -b fix/bug-in-scoring-algorithm
```

**分支命名规范**：
- `feature/` — 新功能
- `fix/` — Bug 修复
- `docs/` — 文档更新
- `refactor/` — 代码重构（不改变功能）
- `test/` — 测试相关

### 3. 编写代码与测试

- **代码风格**：
  - TypeScript/Node.js：遵循 [Airbnb 风格指南](https://github.com/airbnb/javascript)，使用 `prettier` 格式化
  - JavaScript/React：遵循 [Airbnb 风格指南](https://github.com/airbnb/javascript)，使用 `eslint` 检查
  - YAML（Actions 工作流）：使用 2 空格缩进

- **测试要求**：
  - 新增功能应附带对应的单元测试
  - 修复 Bug 应添加回归测试，防止问题再次出现
  - 确保所有测试通过：`npm test`

- **提交信息规范**：

我们推荐使用 [Conventional Commits](https://www.conventionalcommits.org/) 格式：

```
<type>(<scope>): <subject>

<body>

<footer>
```

**类型（type）**：`feat`、`fix`、`docs`、`style`、`refactor`、`perf`、`test`、`chore`

**示例**：
```
feat(scoring): 增加对 Zig 语言的支持权重

- 在 LANGUAGE_SCORES 中新增 Zig 语言评分 1.2
- 更新相关单元测试

Closes #42
```

> ⚠️ **注意**：避免使用 "update"、"fix" 等无意义提交信息——毕竟我们自己的红牌检测算法会标记它们！😉

### 4. Push 与提交 Pull Request

```bash
git push origin feature/your-branch-name
```

然后前往 GitHub 上的 Fork 仓库，点击 **"Compare & pull request"** 创建 PR。

**PR 描述模板**：

```markdown
## 变更概述
[简要描述本次 PR 做了什么]

## 关联 Issue
Closes #[Issue编号]

## 测试验证
- [ ] 本地所有测试通过
- [ ] 新增了相关测试（如有新功能）
- [ ] 已在真实 GitHub API 数据上验证（如适用）

## 检查清单
- [ ] 代码遵循项目风格规范
- [ ] 提交信息符合 Conventional Commits 规范
- [ ] 文档已同步更新
- [ ] 未引入新的 lint 警告
```

---

## 🧪 测试指南

### Node.js 测试（Vitest / Jest）

```bash
# 运行所有测试
npm test

# 运行特定测试文件
npm test -- tests/testScoring.ts

# 带覆盖率报告
npm run test:coverage
```

### 前端测试

```bash
cd frontend

# Lint 检查
npm run lint

# 构建测试
npm run build
```

### GitHub Actions 本地测试（可选）

如果你修改了 `.github/workflows/` 中的 YAML 文件，可以使用 `act` 在本地模拟运行：

```bash
# 列出可用事件
act -l

# 模拟 analyze.yml 工作流
act push -j evaluate
```

> 注意：`act` 需要 Docker 环境支持。

---

## 📁 贡献范围指引

| 目录/文件 | 贡献方向 | 技能要求 |
|----------|---------|---------|
| `scripts/` | 评分算法、数据采集、红牌检测逻辑 | TypeScript、GitHub API |
| `frontend/` | UI/UX 优化、雷达图交互、仪表板功能 | React、ECharts、CSS |
| `.github/workflows/` | CI/CD 流程优化、自动化策略 | YAML、GitHub Actions |
| `docs/` | 使用指南、API 文档、部署文档 | Markdown、技术写作 |
| `results/` | **请勿手动编辑** — 该目录由 Actions 自动管理 | — |

---

## ✅ PR 合并前检查清单

在 PR 被合并之前，请确保：

- [ ] 分支与 `upstream/main` 无冲突
- [ ] 所有 CI 检查通过（GitHub Actions 绿色）
- [ ] 代码已通过自 Review（无明显的拼写/逻辑错误）
- [ ] 已更新相关文档（如有 API 变更）
- [ ] 新增依赖已添加到 `package.json`（含 `package-lock.json` 同步提交）
- [ ] 无硬编码的敏感信息（Token、密钥等）

---

## 🏆 贡献者荣誉

所有贡献者将被列入 [CONTRIBUTORS.md](CONTRIBUTORS.md) 文件。

我们衷心感谢每一位贡献者，无论贡献大小，都在让 HexaScope 变得更好！

---

## ❓ 需要帮助？

如果你在贡献过程中遇到任何困难，可以通过以下方式寻求帮助：

1. 在 [Discussions](https://github.com/zhaozg/HexaScope/discussions) 中提问
2. 在相关 Issue 下留言
3. 联系项目维护者：`@zhaozg`

---

**再次感谢你的贡献！** 🚀

[返回 README](README.md) · [查看设计文档](DESIGN.md)

---

## 附录：常用 Git 命令速查

```bash
# 同步上游分支
git fetch upstream && git rebase upstream/main

# 修改最后一次提交信息
git commit --amend -m "新的提交信息"

# 暂存当前修改（切换分支时使用）
git stash
git stash pop

# 查看提交历史
git log --oneline --graph --all
```

---

> 本贡献指南基于 [GitHub 开源指南](https://opensource.guide/zh-cn/) 编写，并针对 HexaScope 项目特点进行了定制。

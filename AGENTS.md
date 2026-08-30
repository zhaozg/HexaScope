# AGENTS.md — HexaScope AI 协作指南

> 本文档为 AI 编程助手（如 GitHub Copilot、Cline、Aider、Cursor）提供项目上下文。
> 遵循以下规则可确保 AI 生成的代码符合项目规范，并通过 CI 审查。

---

## 1. 项目身份

- **名称**: HexaScope
- **仓库**: `https://github.com/zhaozg/HexaScope`
- **定位**: 基于 GitHub 原生生态（App + Actions + Copilot）的开发者六维能力雷达图生成器。
- **核心理念**: 开源、免费、深度集成 GitHub、不依赖外部付费服务。

---

## 2. 核心原则（AI 必须遵守）

| 原则 | 说明 |
|------|------|
| **GitHub First** | 所有功能必须基于 GitHub API、Actions、Pages 或 Copilot 实现，不得引入外部第三方评估 API（如 OpenAI 商业接口），除非经过维护者明确批准。 |
| **零成本运营** | 在默认配置下，项目必须完全运行于 GitHub Free 额度内（2000 min/month Actions）。AI 提出的方案若涉及高算力消耗，需附带成本分析。 |
| **确定性优先** | 评分算法必须是确定性的（给定相同输入，输出相同结果）。AI 生成的红牌检测或评分逻辑不得包含随机因素。 |
| **透明度** | 评分公式必须可解释、可追溯。AI 提出的复杂计算需在 DESIGN.md 中更新说明。 |
| **隐私边界** | **仅支持用户评估自己**（安装 App 的账户）。不得评估或公开他人画像。自我评估存在主观偏差（戏剧化），报告中必须附带免责声明。 |

---

## 3. 技术栈约束

### 3.1 语言与版本

| 领域 | 技术栈 | 版本要求 |
|------|--------|----------|
| **后端/脚本（评分引擎）** | Node.js (TypeScript) | Node.js ≥ 18, npm ≥ 9 |
| **前端仪表板** | React + ECharts | Node.js ≥ 18, npm ≥ 9 |
| **自动化** | GitHub Actions (YAML) | 使用 `ubuntu-latest` 运行器 |
| **数据格式** | JSON, SVG, YAML | — |

### 3.2 依赖管理

- **Node.js**: 所有依赖（脚本 + 前端）统一在根目录 `package.json` 中定义，`package-lock.json` 同步提交。
- **禁止**: 严禁在代码中动态下载或执行外部二进制文件。

### 3.3 环境变量

AI 生成的代码必须通过环境变量读取敏感信息（如 Token），**严禁硬编码**。

```typescript
// ✅ 正确
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// ❌ 错误
const GITHUB_TOKEN = "ghp_xxxxxxxxxxxx";
```

---

## 4. 编码规范

### 4.1 TypeScript / Node.js（`scripts/`, `tests/`）

- **风格**: 遵循 [Airbnb JavaScript Style Guide](https://github.com/airbnb/javascript)，统一使用 TypeScript。
- **格式化**: 使用 `prettier`（默认配置），行宽 ≤ 100 字符。
- **类型注解**: 所有函数签名必须包含类型注解。

```typescript
// ✅ 正确示例
export interface LanguageWeights {
  [lang: string]: number;
}

export function calculateLanguageScore(
  languages: string[],
  weights: LanguageWeights,
): number {
  /** 计算语言广度得分。 */
  return languages.reduce((sum, lang) => sum + (weights[lang] ?? 0.7), 0);
}
```

- **JSDoc**: 公共函数必须包含 JSDoc 风格注释。

### 4.2 JavaScript / React（`frontend/`）

- **风格**: 遵循 [Airbnb JavaScript Style Guide](https://github.com/airbnb/javascript)。
- **组件**: 使用**函数式组件**和 Hooks，禁用 Class Components。
- **Lint**: 所有 PR 必须通过 `npm run lint` 检查（零警告）。

```jsx
// ✅ 正确示例
import React, { useState, useEffect } from 'react';

export const RadarChart = ({ username }) => {
  const [data, setData] = useState(null);
  // ...
};
```

### 4.3 YAML（`.github/workflows/`）

- **缩进**: 统一使用 **2 个空格**。
- **引用**: 优先使用 `${{ }}` 上下文引用，避免使用 `env.` 旧语法。

---

## 5. 目录职责与 AI 修改权限

| 路径 | 职责 | AI 修改限制 |
|------|------|-------------|
| `scripts/` | 数据采集、评分逻辑、红牌检测、图片生成 | ✅ 允许修改，需附带测试更新 |
| `frontend/` | 可视化仪表板 | ✅ 允许修改 UI 逻辑，禁止引入大型无关依赖 |
| `.github/workflows/` | CI/CD 流水线 | ⚠️ 修改时需评估 Actions 分钟数消耗 |
| `results/` | 用户评估结果 | ❌ **严禁 AI 修改**（仅由 Actions 自动提交） |
| `docs/` | 文档 | ✅ 鼓励修改，需保持 Markdown 格式规范 |
| `tests/` | 单元测试 | ✅ 强制要求：新增功能必须附带对应测试 |

---

## 6. 提交规范（Conventional Commits）

AI 生成的提交信息必须符合 [Conventional Commits](https://www.conventionalcommits.org/) 规范，**严禁使用模糊信息**（如 `update`、`fix bug`）。

- **格式**:
  ```
  <type>(<scope>): <subject>
  ```
- **允许的 type**:
  - `feat`: 新功能
  - `fix`: Bug 修复
  - `docs`: 文档更新
  - `style`: 代码格式（不影响逻辑）
  - `refactor`: 重构
  - `perf`: 性能优化
  - `test`: 测试相关
  - `chore`: 构建/工具变更

**示例**:
```
feat(scoring): add Zig language support with weight 1.2

- Update LANGUAGE_SCORES dictionary in scoring module
- Add unit test for Zig scoring
```

> ⚠️ **特别警示**: 本项目内置红牌检测算法会标记无意义提交信息（红牌 #8）。AI 提交的日志若触发该规则，将被 CI 拒绝。

---

## 7. 测试要求

- **覆盖率**: 核心算法（`scripts/scoreCalculator.ts`）的单元测试覆盖率需 ≥ 85%。
- **命令**:
  ```bash
  # 本地运行测试
  npm test

  # 带覆盖率报告
  npm run test:coverage
  ```
- **数据模拟**: 调用 GitHub API 的测试必须使用 `nock` 或 `msw` 模拟网络请求，严禁在单元测试中真正发起网络调用。

---

## 8. 针对 Copilot Extensions 开发的特别指引

当 AI 需要编写或修改 Copilot 相关集成代码时：

- **API 路由**: 遵循 GitHub Copilot Extensions 规范，使用 `POST /copilot/v1/...`。
- **响应格式**: 必须返回符合 Copilot 接口规范的 Markdown 或结构化 JSON。
- **鉴权**: 验证请求头中的 `X-GitHub-Token`，不得硬编码。

---

## 9. 安全红线

1. **Token 泄露**: 严禁在任何代码或日志中打印 `GITHUB_TOKEN` 或 `PAT`。
2. **注入防护**: 采集或处理用户输入（如仓库名、用户名）时，必须进行 SQL/Shell 转义，防止注入攻击（尽管 Actions 环境相对隔离，仍需警惕）。
3. **权限最小化**: 工作流中 `permissions` 块必须显式声明，不得使用宽泛的 `contents: write` 以外的权限（除非必要）。

---

## 10. AI 自我检测清单

在 AI 输出代码或 PR 前，请自行检查：

- [ ] 是否引入了外部非 GitHub 原生依赖？
- [ ] 是否包含硬编码的敏感信息？
- [ ] 函数是否包含类型注解和 JSDoc 注释？
- [ ] 是否更新了对应的测试文件？
- [ ] 提交信息是否符合 Conventional Commits 格式？
- [ ] 是否无意中修改了 `results/` 目录？

---

## 11. 本地环境快速复现命令

供 AI 生成代码时参考环境初始化流程：

```bash
# 1. 安装根目录依赖（脚本 + 评分引擎）
npm install

# 2. 前端依赖
npm --prefix frontend install

# 3. 运行测试
npm test
```

---

## 附录：常见决策参考（ADR 速查）

当 AI 对架构有疑问时，优先查阅 `DESIGN.md` 中的 ADR 记录：

- **ADR-001**: 前端通过 `raw.githubusercontent.com` 直读数据，而非构建时注入。
- **ADR-002**: 采取增量更新策略（只评估 7 天内活跃用户），保障免费额度够用。

---

*本文件将随项目演进持续更新。若有冲突，以 `DESIGN.md` 和 `README.md` 为准。*

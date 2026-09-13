/**
 * HexaScope 六维评分引擎。
 *
 * 确定性算法：给定相同输入必然产生相同输出，不含任何随机因素。
 * 六个维度：技术硬实力、架构与设计、问题排查、工程化效能、沟通协作、业务洞察。
 *
 * Phase 2 起每个维度额外输出：
 *  - `available`：是否有足够数据支撑（数据不足时不计入综合加权，而非记 0 分）；
 *  - `evidence`：支撑该得分的关键证据，供报告展示与解读层引用。
 */

import type { DimensionScore, EvaluationInput, RepoInfo } from './types.ts';

/** 语言权重表（技术硬实力）。 */
export const LANGUAGE_SCORES: Record<string, number> = {
  Rust: 1.2,
  C: 1.1,
  'C++': 1.1,
  Python: 1.0,
  Go: 1.1,
  Java: 1.0,
  TypeScript: 1.0,
  JavaScript: 0.9,
  Ruby: 0.9,
  PHP: 0.8,
  Lua: 1.1,
  Zig: 1.2,
  其他: 0.7,
};

/** 未知语言的默认权重。 */
export const DEFAULT_LANGUAGE_WEIGHT = 0.7;

/** 各维度权重（合计 100%）。 */
export const DIMENSION_WEIGHTS: Record<string, number> = {
  technical: 0.25,
  architecture: 0.2,
  debugging: 0.15,
  engineering: 0.15,
  collaboration: 0.15,
  business: 0.1,
};

/**
 * 各维度中文名（键名顺序即报告与雷达图的展示顺序）。
 *
 * 作为单一事实来源导出，供报告结构校验（scripts/reportSchema.ts）复用，
 * 避免维度名称在两处定义后发生漂移。
 */
export const DIMENSION_NAMES: Record<string, string> = {
  technical: '技术硬实力',
  architecture: '架构与设计',
  debugging: '问题排查',
  engineering: '工程化效能',
  collaboration: '沟通协作',
  business: '业务洞察',
};

/** 单个维度的计算结果（内部结构）。 */
export interface DimensionOutcome {
  /** 0-100 得分。 */
  score: number;
  /** 是否有足够数据支撑。 */
  available: boolean;
  /** 支撑得分的关键证据。 */
  evidence: string[];
}

const clamp = (value: number, min = 0, max = 100): number => Math.min(Math.max(value, min), max);

/** 按 Star 数降序取前 N 个非 Fork 仓库。 */
function topRepos(repos: RepoInfo[], n: number): RepoInfo[] {
  return repos
    .filter((repo) => !repo.isFork)
    .sort((a, b) => b.stars - a.stars)
    .slice(0, n);
}

/** 仅保留结构信号采集成功的仓库。 */
function scannableRepos(repos: RepoInfo[]): RepoInfo[] {
  return repos.filter((repo) => repo.signalsCollected !== false);
}

/** 去重语言列表。 */
function uniqueLanguages(repos: RepoInfo[]): string[] {
  return [...new Set(repos.flatMap((repo) => repo.languages))];
}

/** 数值格式化（保留 1 位小数，避免浮点噪声进入证据文本）。 */
const fmt = (value: number): string => value.toFixed(1);

/** 判断结构信号维度是否可用。 */
function repoDimensionAvailable(repos: RepoInfo[], collected: RepoInfo[]): boolean {
  return collected.length > 0 && repos.length > 0;
}

/**
 * 技术硬实力：语言广度 + Top 3 项目质量。
 * @see DESIGN.md 4.2 维度 1
 */
export function calculateTechnicalScore(repos: RepoInfo[]): number {
  return computeTechnical(repos).score;
}

/** 技术硬实力（含可用性与证据）。 */
export function computeTechnical(repos: RepoInfo[]): DimensionOutcome {
  const collected = scannableRepos(repos);
  // 语言来自仓库列表 API（始终可得），不因"未扫描文件树"而丢失；Fork 不算自研能力
  const languages = uniqueLanguages(repos.filter((repo) => !repo.isFork));
  let score = 0;
  const evidence: string[] = [];

  const avgWeight =
    languages.length > 0
      ? languages.reduce(
          (sum, lang) => sum + (LANGUAGE_SCORES[lang] ?? DEFAULT_LANGUAGE_WEIGHT),
          0,
        ) / languages.length
      : 0;

  const breadth = languages.length > 0 ? Math.min(languages.length * 5 * avgWeight, 40) : 0;
  score += breadth;
  if (languages.length > 0) {
    evidence.push(
      `掌握 ${languages.length} 种语言（${languages.slice(0, 6).join('/')}），平均权重 ${fmt(avgWeight)}，语言广度得分 ${fmt(breadth)}/40`,
    );
  }

  const top = topRepos(collected, 3);
  if (top.length > 0) {
    const perRepo = top.map((repo) => {
      const starScore = Math.min(Math.log(repo.stars + 1) * 8, 30);
      const complexityScore = Math.min((repo.complexityMetric / 100) * 20, 20);
      return { repo, value: (starScore + complexityScore) / 3 };
    });
    score += perRepo.reduce((sum, item) => sum + item.value, 0);
    for (const item of perRepo) {
      evidence.push(
        `仓库 ${item.repo.name}：${item.repo.stars} Star、复杂度 ${fmt(item.repo.complexityMetric)}/100、源码 ${item.repo.sourceFileCount ?? 0} 文件，项目质量得分 ${fmt(item.value)}`,
      );
    }
  }

  return {
    score: clamp(score),
    available: repoDimensionAvailable(repos, collected),
    evidence,
  };
}

/**
 * 架构与设计：架构文档 + 测试 + CI + 模块化。
 * 取 Top 仓库各项信号的最优值（任一仓库具备即计分）。
 * @see DESIGN.md 4.2 维度 2
 */
export function calculateArchitectureScore(repos: RepoInfo[]): number {
  return computeArchitecture(repos).score;
}

/** 架构与设计（含可用性与证据）。 */
export function computeArchitecture(repos: RepoInfo[]): DimensionOutcome {
  const collected = scannableRepos(repos);
  const top = topRepos(collected, 3);
  const evidence: string[] = [];
  if (top.length === 0) {
    return { score: 0, available: false, evidence };
  }

  let score = 0;
  if (top.some((repo) => repo.hasArchitectureMd)) {
    score += 20;
    evidence.push('存在 ARCHITECTURE.md 架构说明');
  }
  if (top.some((repo) => repo.hasDesignDoc)) {
    score += 10;
    evidence.push('存在设计文档 / ADR 目录');
  }
  if (top.some((repo) => repo.hasTestDirectory)) {
    score += 15;
    const testFiles = Math.max(...top.map((repo) => repo.testFileCount ?? 0));
    evidence.push(`建立测试目录（最多 ${testFiles} 个测试文件）`);
  }
  if (top.some((repo) => repo.hasCiConfig)) {
    score += 15;
    evidence.push('配置了 CI 流水线');
  }

  const modularity = top.reduce((sum, repo) => sum + repo.modularityScore, 0) / top.length;
  score += Math.min((modularity / 100) * 40, 40);
  const best = top.reduce((max, repo) => Math.max(max, repo.modularityScore), 0);
  evidence.push(
    `平均模块化得分 ${fmt(modularity)}/100（最佳仓库 ${best}/100，依据目录分层与测试分离）`,
  );

  return { score: clamp(score), available: true, evidence };
}

/**
 * 问题排查：Issue 响应 + Bug 修复提交 + PR 合并率。
 * @see DESIGN.md 4.2 维度 3
 */
export function calculateDebuggingScore(input: Pick<EvaluationInput, 'activity'>): number {
  return computeDebugging(input).score;
}

/** 问题排查（含可用性与证据）。 */
export function computeDebugging(input: Pick<EvaluationInput, 'activity'>): DimensionOutcome {
  const { activity } = input;
  const evidence: string[] = [];
  const available = activity.activityCollected === true;
  if (!available) {
    return { score: 0, available: false, evidence: ['未采集到 Issue / PR / 提交样本，无法评估'] };
  }

  let score = 0;
  const hours = activity.avgIssueResponseHours;
  if (hours === null) {
    evidence.push('Issue 响应样本不足，响应速度项不计分');
  } else if (hours < 2) {
    score += 40;
    evidence.push(`平均 Issue 响应 ${fmt(hours)} 小时（极快）`);
  } else if (hours < 24) {
    score += 30;
    evidence.push(`平均 Issue 响应 ${fmt(hours)} 小时`);
  } else if (hours < 72) {
    score += 20;
    evidence.push(`平均 Issue 响应 ${fmt(hours)} 小时（偏慢）`);
  } else {
    score += 10;
    evidence.push(`平均 Issue 响应 ${fmt(hours)} 小时（明显滞后）`);
  }

  score += Math.min(activity.bugfixPrCount * 3, 30);
  evidence.push(
    `Bug 修复提交 ${activity.bugfixPrCount} 次，修复项得分 ${fmt(Math.min(activity.bugfixPrCount * 3, 30))}/30`,
  );

  score += activity.prMergeRate * 30;
  evidence.push(
    `PR 合并率 ${fmt(activity.prMergeRate * 100)}%，合并项得分 ${fmt(activity.prMergeRate * 30)}/30`,
  );

  return { score: clamp(score), available: true, evidence };
}

/**
 * 工程化效能：CI/CD、容器化、自动化工具链。
 * @see DESIGN.md 4.2 维度 4
 */
export function calculateEngineeringScore(repos: RepoInfo[]): number {
  return computeEngineering(repos).score;
}

/** 工程化效能（含可用性与证据）。 */
export function computeEngineering(repos: RepoInfo[]): DimensionOutcome {
  const collected = scannableRepos(repos);
  const top = topRepos(collected, 3);
  const evidence: string[] = [];
  if (top.length === 0) {
    return { score: 0, available: false, evidence };
  }

  let score = 0;
  const add = (present: boolean, points: number, label: string): void => {
    if (present) {
      score += points;
      evidence.push(label);
    }
  };

  add(
    top.some((r) => r.hasCiConfig),
    25,
    'CI 流水线',
  );
  add(
    top.some((r) => r.hasDockerfile),
    15,
    'Dockerfile 容器化',
  );
  add(
    top.some((r) => r.hasDockerCompose),
    5,
    'Docker Compose 编排',
  );
  add(
    top.some((r) => r.hasKubernetesManifest),
    5,
    'Kubernetes/Helm 部署清单',
  );
  add(
    top.some((r) => r.hasPreCommitHooks),
    10,
    'Git Hooks / pre-commit 校验',
  );
  add(
    top.some((r) => r.hasDependencyBot),
    10,
    '依赖自动升级机器人（Dependabot/Renovate）',
  );
  add(
    top.some((r) => r.hasReleaseWorkflow),
    10,
    '自动化发布流水线',
  );
  add(
    top.some((r) => r.hasCodeqlOrSecurityScan),
    10,
    '安全扫描（CodeQL 等）',
  );
  add(
    top.some((r) => r.hasChangelog),
    5,
    'CHANGELOG 版本记录',
  );
  add(
    top.some((r) => r.hasContributing),
    5,
    'CONTRIBUTING 协作规范',
  );

  const automationDepth = top.reduce((sum, repo) => sum + repo.automationDepth, 0) / top.length;
  score += Math.min(automationDepth * 10, 10);
  evidence.push(`平均自动化深度 ${fmt(automationDepth * 100)}%（工具链加权覆盖率）`);

  return { score: clamp(score), available: true, evidence };
}

/**
 * 沟通协作：PR 描述质量 + Review 参与 + Issue 讨论 + 协作广度。
 * @see DESIGN.md 4.2 维度 5
 */
export function calculateCollaborationScore(input: Pick<EvaluationInput, 'activity'>): number {
  return computeCollaboration(input).score;
}

/** 沟通协作（含可用性与证据）。 */
export function computeCollaboration(input: Pick<EvaluationInput, 'activity'>): DimensionOutcome {
  const { activity } = input;
  const evidence: string[] = [];
  if (activity.activityCollected !== true) {
    return { score: 0, available: false, evidence: ['未采集到 PR / Issue / 协作样本，无法评估'] };
  }

  let score = 0;
  const { avgPrDescriptionLength } = activity;
  if (avgPrDescriptionLength > 200) {
    score += 30;
    evidence.push(`PR 平均描述 ${fmt(avgPrDescriptionLength)} 字符（详实）`);
  } else if (avgPrDescriptionLength > 100) {
    score += 20;
    evidence.push(`PR 平均描述 ${fmt(avgPrDescriptionLength)} 字符`);
  } else if (avgPrDescriptionLength > 50) {
    score += 10;
    evidence.push(`PR 平均描述 ${fmt(avgPrDescriptionLength)} 字符（偏简短）`);
  } else {
    evidence.push('PR 描述过短，此项不计分');
  }

  score += Math.min(activity.reviewCommentCount * 2, 30);
  evidence.push(
    `Review 评论 ${activity.reviewCommentCount} 条，得分 ${fmt(Math.min(activity.reviewCommentCount * 2, 30))}/30`,
  );

  score += Math.min(activity.issueDiscussionCount * 1.5, 20);
  evidence.push(
    `Issue 讨论参与 ${activity.issueDiscussionCount} 次，得分 ${fmt(Math.min(activity.issueDiscussionCount * 1.5, 20))}/20`,
  );

  score += Math.min(activity.uniqueCollaborators * 2, 20);
  evidence.push(
    `协作过的贡献者 ${activity.uniqueCollaborators} 人，得分 ${fmt(Math.min(activity.uniqueCollaborators * 2, 20))}/20`,
  );

  const conventional = activity.conventionalCommitRatio ?? null;
  if (conventional !== null) {
    score += Math.min(conventional * 10, 10);
    evidence.push(
      `规范提交（Conventional Commits）占比 ${fmt(conventional * 100)}%，得分 ${fmt(Math.min(conventional * 10, 10))}/10`,
    );
  }

  return { score: clamp(score), available: true, evidence };
}

/**
 * 业务洞察：README 质量 + 使用场景 + 真实用户信号。
 * @see DESIGN.md 4.2 维度 6
 */
export function calculateBusinessScore(repos: RepoInfo[]): number {
  return computeBusiness(repos).score;
}

/** 业务洞察（含可用性与证据）。 */
export function computeBusiness(repos: RepoInfo[]): DimensionOutcome {
  const collected = scannableRepos(repos);
  const top = topRepos(collected, 3);
  const evidence: string[] = [];
  if (top.length === 0) {
    return { score: 0, available: false, evidence };
  }

  let score = 0;
  const readmeScore = top.reduce((sum, r) => sum + r.readmeScore, 0) / top.length;
  score += Math.min(readmeScore * 0.4, 40);
  evidence.push(
    `平均 README 质量 ${fmt(readmeScore)}/100，得分 ${fmt(Math.min(readmeScore * 0.4, 40))}/40`,
  );

  if (top.some((r) => r.hasUseCasesDoc)) {
    score += 20;
    evidence.push('README 包含使用场景 / 功能说明');
  }
  if (top.some((r) => r.hasExampleCode)) {
    score += 20;
    evidence.push('提供示例代码 / examples 目录');
  }
  if (top.some((r) => r.hasInstallSection)) {
    score += 10;
    evidence.push('提供安装指引（降低上手门槛）');
  }
  if (top.some((r) => r.hasIssuesFromRealUsers)) {
    score += 10;
    evidence.push('存在真实用户反馈（外部 Issue）');
  }
  if (top.some((r) => r.hasForksWithCommits)) {
    score += 10;
    evidence.push('存在他人 Fork 后继续贡献');
  }

  return { score: clamp(score), available: true, evidence };
}

/**
 * 计算六维得分列表（含权重、可用性与证据）。
 * @param input 评估输入
 * @returns 六个维度的得分数组
 */
export function calculateDimensions(input: EvaluationInput): DimensionScore[] {
  const technical = computeTechnical(input.repos);
  const architecture = computeArchitecture(input.repos);
  const debugging = computeDebugging(input);
  const engineering = computeEngineering(input.repos);
  const collaboration = computeCollaboration(input);
  const business = computeBusiness(input.repos);

  const entries: [string, DimensionOutcome][] = [
    ['technical', technical],
    ['architecture', architecture],
    ['debugging', debugging],
    ['engineering', engineering],
    ['collaboration', collaboration],
    ['business', business],
  ];

  return entries.map(([key, outcome]) => ({
    key,
    name: DIMENSION_NAMES[key] ?? key,
    score: outcome.score,
    weight: DIMENSION_WEIGHTS[key] ?? 0,
    available: outcome.available,
    evidence: outcome.evidence,
  }));
}

/**
 * 计算加权综合得分。
 *
 * 仅在 `available` 的维度上做权重归一化：数据不足的维度既不计 0 分，
 * 也不稀释其他维度的表现，避免"因为 API 没采到数据所以整体低分"。
 * @param dimensions 六维得分
 * @returns 0-100 综合得分
 */
export function calculateOverallScore(dimensions: DimensionScore[]): number {
  const usable = dimensions.filter((d) => d.available !== false);
  const totalWeight = usable.reduce((sum, d) => sum + d.weight, 0);
  if (totalWeight === 0) {
    return 0;
  }
  const weighted = usable.reduce((sum, d) => sum + d.score * d.weight, 0);
  return clamp(weighted / totalWeight);
}

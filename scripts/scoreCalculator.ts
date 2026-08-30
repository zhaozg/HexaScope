/**
 * HexaScope 六维评分引擎。
 *
 * 确定性算法：给定相同输入必然产生相同输出，不含任何随机因素。
 * 六个维度：技术硬实力、架构与设计、问题排查、工程化效能、沟通协作、业务洞察。
 */

import type { DimensionScore, EvaluationInput, RepoInfo } from './types.js';

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

const clamp = (value: number, min = 0, max = 100): number => Math.min(Math.max(value, min), max);

/** 按 Star 数降序取前 N 个非 Fork 仓库。 */
function topRepos(repos: RepoInfo[], n: number): RepoInfo[] {
  return repos
    .filter((repo) => !repo.isFork)
    .sort((a, b) => b.stars - a.stars)
    .slice(0, n);
}

/** 去重语言列表。 */
function uniqueLanguages(repos: RepoInfo[]): string[] {
  return [...new Set(repos.flatMap((repo) => repo.languages))];
}

/**
 * 技术硬实力：语言广度 + Top 3 项目质量。
 * @see DESIGN.md 4.2 维度 1
 */
export function calculateTechnicalScore(repos: RepoInfo[]): number {
  let score = 0;
  const languages = uniqueLanguages(repos);

  // 语言广度：每种语言 +5 分 × 平均权重，上限 40
  if (languages.length > 0) {
    const avgWeight =
      languages.reduce((sum, lang) => sum + (LANGUAGE_SCORES[lang] ?? DEFAULT_LANGUAGE_WEIGHT), 0) /
      languages.length;
    score += Math.min(languages.length * 5 * avgWeight, 40);
  }

  // Top 3 项目质量：Star 对数 + 复杂度
  for (const repo of topRepos(repos, 3)) {
    const starScore = Math.min(Math.log(repo.stars + 1) * 8, 30);
    const complexityScore = Math.min((repo.complexityMetric / 100) * 20, 20);
    score += (starScore + complexityScore) / 3;
  }

  return clamp(score);
}

/**
 * 架构与设计：架构文档 + 测试 + CI + 模块化。
 * 取 Top 仓库各项信号的最优值（任一仓库具备即计分）。
 * @see DESIGN.md 4.2 维度 2
 */
export function calculateArchitectureScore(repos: RepoInfo[]): number {
  const top = topRepos(repos, 3);
  if (top.length === 0) {
    return 0;
  }
  let score = 0;
  if (top.some((r) => r.hasArchitectureMd)) score += 20;
  if (top.some((r) => r.hasDesignDoc)) score += 10;
  if (top.some((r) => r.hasTestDirectory)) score += 15;
  if (top.some((r) => r.hasCiConfig)) score += 15;
  const modularity = top.reduce((sum, r) => sum + r.modularityScore, 0) / top.length;
  score += Math.min((modularity / 100) * 40, 40);
  return clamp(score);
}

/**
 * 问题排查：Issue 响应 + Bug 修复 PR + PR 合并率。
 * @see DESIGN.md 4.2 维度 3
 */
export function calculateDebuggingScore(input: Pick<EvaluationInput, 'activity'>): number {
  const { activity } = input;
  let score = 0;
  const { avgIssueResponseHours } = activity;

  if (avgIssueResponseHours < 2) score += 40;
  else if (avgIssueResponseHours < 24) score += 30;
  else if (avgIssueResponseHours < 72) score += 20;
  else score += 10;

  score += Math.min(activity.bugfixPrCount * 3, 30);
  score += activity.prMergeRate * 30;

  return clamp(score);
}

/**
 * 工程化效能：CI/CD、容器化、自动化工具链。
 * @see DESIGN.md 4.2 维度 4
 */
export function calculateEngineeringScore(repos: RepoInfo[]): number {
  const top = topRepos(repos, 3);
  if (top.length === 0) {
    return 0;
  }
  let score = 0;
  if (top.some((r) => r.hasCiConfig)) score += 25;
  if (top.some((r) => r.hasDockerfile)) score += 15;
  if (top.some((r) => r.hasDockerCompose)) score += 5;
  if (top.some((r) => r.hasKubernetesManifest)) score += 5;
  if (top.some((r) => r.hasPreCommitHooks)) score += 10;
  if (top.some((r) => r.hasDependencyBot)) score += 10;
  if (top.some((r) => r.hasReleaseWorkflow)) score += 10;
  if (top.some((r) => r.hasCodeqlOrSecurityScan)) score += 10;
  const automationDepth = top.reduce((sum, r) => sum + r.automationDepth, 0) / top.length;
  score += Math.min(automationDepth * 10, 10);
  return clamp(score);
}

/**
 * 沟通协作：PR 描述质量 + Review 参与 + Issue 讨论 + 协作广度。
 * @see DESIGN.md 4.2 维度 5
 */
export function calculateCollaborationScore(input: Pick<EvaluationInput, 'activity'>): number {
  const { activity } = input;
  let score = 0;
  const { avgPrDescriptionLength } = activity;

  if (avgPrDescriptionLength > 200) score += 30;
  else if (avgPrDescriptionLength > 100) score += 20;
  else if (avgPrDescriptionLength > 50) score += 10;

  score += Math.min(activity.reviewCommentCount * 2, 30);
  score += Math.min(activity.issueDiscussionCount * 1.5, 20);
  score += Math.min(activity.uniqueCollaborators * 2, 20);

  return clamp(score);
}

/**
 * 业务洞察：README 质量 + 使用场景 + 真实用户信号。
 * @see DESIGN.md 4.2 维度 6
 */
export function calculateBusinessScore(repos: RepoInfo[]): number {
  const top = topRepos(repos, 3);
  if (top.length === 0) {
    return 0;
  }
  let score = 0;
  const readmeScore = top.reduce((sum, r) => sum + r.readmeScore, 0) / top.length;
  score += Math.min(readmeScore * 0.4, 40);
  if (top.some((r) => r.hasUseCasesDoc)) score += 20;
  if (top.some((r) => r.hasExampleCode)) score += 20;
  if (top.some((r) => r.hasIssuesFromRealUsers)) score += 10;
  if (top.some((r) => r.hasForksWithCommits)) score += 10;
  return clamp(score);
}

/**
 * 计算六维得分列表（含权重）。
 * @param input 评估输入
 * @returns 六个维度的得分数组
 */
export function calculateDimensions(input: EvaluationInput): DimensionScore[] {
  const dimensions: DimensionScore[] = [
    {
      key: 'technical',
      name: '技术硬实力',
      score: calculateTechnicalScore(input.repos),
      weight: DIMENSION_WEIGHTS['technical'] ?? 0.25,
    },
    {
      key: 'architecture',
      name: '架构与设计',
      score: calculateArchitectureScore(input.repos),
      weight: DIMENSION_WEIGHTS['architecture'] ?? 0.2,
    },
    {
      key: 'debugging',
      name: '问题排查',
      score: calculateDebuggingScore(input),
      weight: DIMENSION_WEIGHTS['debugging'] ?? 0.15,
    },
    {
      key: 'engineering',
      name: '工程化效能',
      score: calculateEngineeringScore(input.repos),
      weight: DIMENSION_WEIGHTS['engineering'] ?? 0.15,
    },
    {
      key: 'collaboration',
      name: '沟通协作',
      score: calculateCollaborationScore(input),
      weight: DIMENSION_WEIGHTS['collaboration'] ?? 0.15,
    },
    {
      key: 'business',
      name: '业务洞察',
      score: calculateBusinessScore(input.repos),
      weight: DIMENSION_WEIGHTS['business'] ?? 0.1,
    },
  ];
  return dimensions;
}

/**
 * 计算加权综合得分。
 * @param dimensions 六维得分
 * @returns 0-100 综合得分
 */
export function calculateOverallScore(dimensions: DimensionScore[]): number {
  const totalWeight = dimensions.reduce((sum, d) => sum + d.weight, 0);
  if (totalWeight === 0) {
    return 0;
  }
  const weighted = dimensions.reduce((sum, d) => sum + d.score * d.weight, 0);
  return clamp(weighted / totalWeight);
}

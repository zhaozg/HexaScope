/**
 * 六维评分引擎单元测试。
 * @see DESIGN.md 4.2
 */

import { describe, expect, it } from 'bun:test';
import {
  DIMENSION_WEIGHTS,
  calculateArchitectureScore,
  calculateBusinessScore,
  calculateCollaborationScore,
  calculateDebuggingScore,
  calculateDimensions,
  calculateEngineeringScore,
  calculateOverallScore,
  calculateTechnicalScore,
} from '../scripts/scoreCalculator.ts';
import type { EvaluationInput, RepoInfo } from '../scripts/types.ts';

/** 构造一个标准仓库。 */
function makeRepo(overrides: Partial<RepoInfo> = {}): RepoInfo {
  return {
    name: 'demo',
    stars: 0,
    isFork: false,
    isEmpty: false,
    hasArchitectureMd: false,
    hasDesignDoc: false,
    hasTestDirectory: false,
    hasCiConfig: false,
    hasDockerfile: false,
    hasDockerCompose: false,
    hasKubernetesManifest: false,
    hasPreCommitHooks: false,
    hasDependencyBot: false,
    hasReleaseWorkflow: false,
    hasCodeqlOrSecurityScan: false,
    complexityMetric: 0,
    modularityScore: 0,
    automationDepth: 0,
    languages: [],
    readmeScore: 0,
    hasUseCasesDoc: false,
    hasExampleCode: false,
    hasIssuesFromRealUsers: false,
    hasForksWithCommits: false,
    ...overrides,
  };
}

/** 构造评估输入。 */
function makeInput(overrides: Partial<EvaluationInput> = {}): EvaluationInput {
  return {
    username: 'test-user',
    repos: [makeRepo()],
    activity: {
      avgIssueResponseHours: 48,
      bugfixPrCount: 0,
      prMergeRate: 0.5,
      avgPrDescriptionLength: 20,
      reviewCommentCount: 0,
      issueDiscussionCount: 0,
      uniqueCollaborators: 0,
      selfMergedPrRatio: 0,
      forkRatio: 0,
      aiCodeProbability: 0,
      botLikeCommitPattern: false,
      starFollowRatio: 0,
      emptyRepoRatio: 0,
      duplicateRepoRatio: 0,
      meaninglessCommitRatio: 0,
      selfResolvedIssueRatio: 0,
      contributionVariance: 2,
      activityCollected: true,
    },
    ...overrides,
  };
}

describe('技术硬实力', () => {
  it('无仓库时得分为 0', () => {
    expect(calculateTechnicalScore([])).toBe(0);
  });

  it('语言广度得分随语言数增长', () => {
    const one = calculateTechnicalScore([makeRepo({ languages: ['TypeScript'] })]);
    const three = calculateTechnicalScore([makeRepo({ languages: ['TypeScript', 'Go', 'Rust'] })]);
    expect(three).toBeGreaterThan(one);
  });

  it('高 Star 高复杂度项目得分更高', () => {
    const strong = calculateTechnicalScore([makeRepo({ stars: 1000, complexityMetric: 90 })]);
    const weak = calculateTechnicalScore([makeRepo({ stars: 0, complexityMetric: 0 })]);
    expect(strong).toBeGreaterThan(weak);
  });

  it('Fork 仓库不计入项目质量', () => {
    const forkOnly = calculateTechnicalScore([makeRepo({ isFork: true, stars: 1000 })]);
    const original = calculateTechnicalScore([makeRepo({ isFork: false, stars: 1000 })]);
    expect(original).toBeGreaterThan(forkOnly);
  });
});

describe('架构与设计', () => {
  it('架构文档、测试目录、CI 齐备时得满分', () => {
    const good = calculateArchitectureScore([
      makeRepo({
        hasArchitectureMd: true,
        hasDesignDoc: true,
        hasTestDirectory: true,
        hasCiConfig: true,
        modularityScore: 100,
      }),
    ]);
    const bad = calculateArchitectureScore([makeRepo()]);
    expect(good).toBeGreaterThan(bad);
    expect(good).toBe(100);
  });

  it('空仓库列表返回 0', () => {
    expect(calculateArchitectureScore([])).toBe(0);
  });
});

describe('问题排查', () => {
  it('响应越快得分越高', () => {
    const fast = calculateDebuggingScore(
      makeInput({
        activity: { ...makeInput().activity, avgIssueResponseHours: 1 },
      }),
    );
    const slow = calculateDebuggingScore(
      makeInput({
        activity: { ...makeInput().activity, avgIssueResponseHours: 100 },
      }),
    );
    expect(fast).toBeGreaterThan(slow);
  });

  it('Bug 修复 PR 与合并率贡献分数', () => {
    const active = calculateDebuggingScore(
      makeInput({
        activity: { ...makeInput().activity, bugfixPrCount: 10, prMergeRate: 1 },
      }),
    );
    const idle = calculateDebuggingScore(makeInput());
    expect(active).toBeGreaterThan(idle);
  });

  it('得分被限制在 0-100', () => {
    const score = calculateDebuggingScore(
      makeInput({
        activity: {
          ...makeInput().activity,
          bugfixPrCount: 100,
          prMergeRate: 1,
          avgIssueResponseHours: 0,
        },
      }),
    );
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe('工程化效能', () => {
  it('工具链齐备时得分更高', () => {
    const good = calculateEngineeringScore([
      makeRepo({
        hasCiConfig: true,
        hasDockerfile: true,
        hasDockerCompose: true,
        hasKubernetesManifest: true,
        hasPreCommitHooks: true,
        hasDependencyBot: true,
        hasReleaseWorkflow: true,
        hasCodeqlOrSecurityScan: true,
        automationDepth: 1,
      }),
    ]);
    const bad = calculateEngineeringScore([makeRepo()]);
    expect(good).toBeGreaterThan(bad);
  });
});

describe('沟通协作', () => {
  it('描述长、Review 多、协作广时得分更高', () => {
    const good = calculateCollaborationScore(
      makeInput({
        activity: {
          ...makeInput().activity,
          avgPrDescriptionLength: 250,
          reviewCommentCount: 20,
          issueDiscussionCount: 15,
          uniqueCollaborators: 10,
        },
      }),
    );
    const bad = calculateCollaborationScore(makeInput());
    expect(good).toBeGreaterThan(bad);
  });
});

describe('业务洞察', () => {
  it('README 质量与真实用户信号贡献分数', () => {
    const good = calculateBusinessScore([
      makeRepo({
        readmeScore: 100,
        hasUseCasesDoc: true,
        hasExampleCode: true,
        hasIssuesFromRealUsers: true,
        hasForksWithCommits: true,
      }),
    ]);
    const bad = calculateBusinessScore([makeRepo()]);
    expect(good).toBeGreaterThan(bad);
  });
});

describe('综合评分', () => {
  it('calculateDimensions 返回 6 个维度且权重合计为 1', () => {
    const dims = calculateDimensions(makeInput());
    expect(dims).toHaveLength(6);
    const totalWeight = dims.reduce((sum, d) => sum + d.weight, 0);
    expect(totalWeight).toBeCloseTo(1, 5);
  });

  it('综合得分 = 各维度加权平均', () => {
    const dims = calculateDimensions(
      makeInput({
        repos: [makeRepo({ stars: 500, complexityMetric: 80, languages: ['TypeScript', 'Go'] })],
        activity: { ...makeInput().activity, bugfixPrCount: 5, prMergeRate: 0.9 },
      }),
    );
    const overall = calculateOverallScore(dims);
    const expected =
      dims.reduce((sum, d) => sum + d.score * d.weight, 0) /
      dims.reduce((sum, d) => sum + d.weight, 0);
    expect(overall).toBeCloseTo(expected, 5);
    expect(overall).toBeGreaterThanOrEqual(0);
    expect(overall).toBeLessThanOrEqual(100);
  });

  it('权重表与设计文档一致', () => {
    expect(DIMENSION_WEIGHTS.technical).toBe(0.25);
    expect(DIMENSION_WEIGHTS.architecture).toBe(0.2);
    expect(DIMENSION_WEIGHTS.debugging).toBe(0.15);
    expect(DIMENSION_WEIGHTS.engineering).toBe(0.15);
    expect(DIMENSION_WEIGHTS.collaboration).toBe(0.15);
    expect(DIMENSION_WEIGHTS.business).toBe(0.1);
  });
});

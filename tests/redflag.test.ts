/**
 * 红牌检测引擎单元测试。
 * @see DESIGN.md 4.3
 */

import { describe, expect, it } from 'bun:test';
import {
  AI_CODE_THRESHOLD,
  CONTRIBUTION_VARIANCE_THRESHOLD,
  DUPLICATE_REPO_THRESHOLD,
  EMPTY_REPO_THRESHOLD,
  FORK_RATIO_THRESHOLD,
  MEANINGLESS_COMMIT_THRESHOLD,
  SELF_MERGE_THRESHOLD,
  SELF_RESOLVED_THRESHOLD,
  STAR_FOLLOW_THRESHOLD,
  countTriggeredRedFlags,
  detectRedFlags,
} from '../scripts/redflagDetector.ts';
import type { EvaluationInput, RepoInfo } from '../scripts/types.ts';

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

/** 构造一个"健康"账户（不触发任何红牌）。 */
function makeHealthyInput(overrides: Partial<EvaluationInput> = {}): EvaluationInput {
  return {
    username: 'healthy-user',
    repos: [makeRepo({ stars: 50 })],
    activity: {
      avgIssueResponseHours: 10,
      bugfixPrCount: 5,
      prMergeRate: 0.8,
      avgPrDescriptionLength: 120,
      reviewCommentCount: 8,
      issueDiscussionCount: 5,
      uniqueCollaborators: 4,
      selfMergedPrRatio: 0.2,
      forkRatio: 0.1,
      aiCodeProbability: 0.2,
      botLikeCommitPattern: false,
      starFollowRatio: 10,
      emptyRepoRatio: 0.1,
      duplicateRepoRatio: 0.1,
      meaninglessCommitRatio: 0.2,
      selfResolvedIssueRatio: 0.1,
      contributionVariance: 3,
    },
    ...overrides,
  };
}

/** 构造一个"刷分"账户（触发全部红牌）。 */
function makeCheaterInput(): EvaluationInput {
  return makeHealthyInput({
    repos: [
      makeRepo({ name: 'clone-a', stars: 0, isFork: true }),
      makeRepo({ name: 'clone-b', stars: 0, isFork: true }),
      makeRepo({ name: 'clone-c', stars: 0, isFork: true }),
      makeRepo({ name: 'clone-d', stars: 0, isFork: true }),
    ],
    activity: {
      avgIssueResponseHours: 100,
      bugfixPrCount: 0,
      prMergeRate: 0.1,
      avgPrDescriptionLength: 10,
      reviewCommentCount: 0,
      issueDiscussionCount: 0,
      uniqueCollaborators: 0,
      selfMergedPrRatio: 0.9,
      forkRatio: 0.95,
      aiCodeProbability: 0.9,
      botLikeCommitPattern: true,
      starFollowRatio: 500,
      emptyRepoRatio: 0.8,
      duplicateRepoRatio: 0.95,
      meaninglessCommitRatio: 0.9,
      selfResolvedIssueRatio: 0.9,
      contributionVariance: 0.1,
    },
  });
}

describe('红牌检测', () => {
  it('健康账户不触发任何红牌', () => {
    const flags = detectRedFlags(makeHealthyInput());
    expect(countTriggeredRedFlags(flags)).toBe(0);
  });

  it('刷分账户触发全部 10 项红牌', () => {
    const flags = detectRedFlags(makeCheaterInput());
    expect(flags).toHaveLength(10);
    expect(countTriggeredRedFlags(flags)).toBe(10);
  });

  it('红牌列表始终包含 10 项（含未触发项，便于报告展示）', () => {
    const flags = detectRedFlags(makeHealthyInput());
    expect(flags).toHaveLength(10);
    expect(flags.map((f) => f.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('触发项包含详情说明', () => {
    const flags = detectRedFlags(makeCheaterInput());
    const selfMerge = flags.find((f) => f.id === 1);
    expect(selfMerge?.detected).toBe(true);
    expect(selfMerge?.detail).toContain('90.0%');
  });

  it('未触发项 detail 为空字符串', () => {
    const flags = detectRedFlags(makeHealthyInput());
    expect(flags.every((f) => f.detail === '')).toBe(true);
  });
});

describe('红牌阈值常量', () => {
  it('阈值与设计文档一致', () => {
    expect(SELF_MERGE_THRESHOLD).toBe(0.6);
    expect(FORK_RATIO_THRESHOLD).toBe(0.8);
    expect(AI_CODE_THRESHOLD).toBe(0.7);
    expect(STAR_FOLLOW_THRESHOLD).toBe(100);
    expect(EMPTY_REPO_THRESHOLD).toBe(0.5);
    expect(DUPLICATE_REPO_THRESHOLD).toBe(0.9);
    expect(MEANINGLESS_COMMIT_THRESHOLD).toBe(0.6);
    expect(SELF_RESOLVED_THRESHOLD).toBe(0.7);
    expect(CONTRIBUTION_VARIANCE_THRESHOLD).toBe(0.5);
  });
});

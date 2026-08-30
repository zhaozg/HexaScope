/**
 * 数据采集与报告构建测试。
 *
 * 使用 MSW（Mock Service Worker）模拟 GitHub API 请求，
 * 严禁在单元测试中真正发起网络调用。
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { buildReport, fetchEvaluationInput } from '../scripts/cli.js';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('fetchEvaluationInput（MSW 模拟 GitHub API）', () => {
  it('采集用户与仓库数据并构造评估输入', async () => {
    server.use(
      http.get('https://api.github.com/users/alice', () =>
        HttpResponse.json({
          login: 'alice',
          public_repos: 3,
          followers: 10,
        }),
      ),
      http.get('https://api.github.com/users/alice/repos', () =>
        HttpResponse.json([
          {
            name: 'awesome',
            stargazers_count: 500,
            fork: false,
            size: 1024,
            language: 'TypeScript',
          },
          {
            name: 'notes',
            stargazers_count: 0,
            fork: false,
            size: 0,
            language: null,
          },
        ]),
      ),
    );

    const input = await fetchEvaluationInput('alice', 'ghp_test_token');
    expect(input.username).toBe('alice');
    expect(input.repos).toHaveLength(2);
    expect(input.repos[0]?.name).toBe('awesome');
    expect(input.repos[0]?.stars).toBe(500);
    expect(input.repos[1]?.isEmpty).toBe(true);
    expect(input.activity.starFollowRatio).toBeCloseTo(0.3, 5);
  });

  it('无仓库时各比例指标为 0', async () => {
    server.use(
      http.get('https://api.github.com/users/bob', () =>
        HttpResponse.json({ login: 'bob', public_repos: 0, followers: 0 }),
      ),
      http.get('https://api.github.com/users/bob/repos', () => HttpResponse.json([])),
    );

    const input = await fetchEvaluationInput('bob');
    expect(input.repos).toHaveLength(0);
    expect(input.activity.forkRatio).toBe(0);
    expect(input.activity.emptyRepoRatio).toBe(0);
    expect(input.activity.starFollowRatio).toBe(0);
  });
});

describe('buildReport', () => {
  it('生成包含免责声明的完整报告', () => {
    const input = {
      username: 'alice',
      repos: [
        {
          name: 'awesome',
          stars: 500,
          isFork: false,
          isEmpty: false,
          hasArchitectureMd: true,
          hasDesignDoc: true,
          hasTestDirectory: true,
          hasCiConfig: true,
          hasDockerfile: false,
          hasDockerCompose: false,
          hasKubernetesManifest: false,
          hasPreCommitHooks: false,
          hasDependencyBot: false,
          hasReleaseWorkflow: false,
          hasCodeqlOrSecurityScan: false,
          complexityMetric: 80,
          modularityScore: 70,
          automationDepth: 0.5,
          languages: ['TypeScript'],
          readmeScore: 90,
          hasUseCasesDoc: true,
          hasExampleCode: true,
          hasIssuesFromRealUsers: true,
          hasForksWithCommits: true,
        },
      ],
      activity: {
        avgIssueResponseHours: 5,
        bugfixPrCount: 6,
        prMergeRate: 0.9,
        avgPrDescriptionLength: 150,
        reviewCommentCount: 10,
        issueDiscussionCount: 6,
        uniqueCollaborators: 5,
        selfMergedPrRatio: 0.2,
        forkRatio: 0,
        aiCodeProbability: 0.1,
        botLikeCommitPattern: false,
        starFollowRatio: 10,
        emptyRepoRatio: 0,
        duplicateRepoRatio: 0,
        meaninglessCommitRatio: 0.1,
        selfResolvedIssueRatio: 0,
        contributionVariance: 2,
      },
    };

    const report = buildReport(input, '2026-08-30T00:00:00.000Z');
    expect(report.username).toBe('alice');
    expect(report.dimensions).toHaveLength(6);
    expect(report.redFlags).toHaveLength(10);
    expect(report.overallScore).toBeGreaterThan(0);
    expect(report.overallScore).toBeLessThanOrEqual(100);
    expect(report.disclaimer).toContain('仅供参考');
    expect(report.disclaimer).toContain('戏剧化');
  });

  it('空数据账户报告得分不为 NaN', () => {
    const report = buildReport({
      username: 'empty',
      repos: [],
      activity: {
        avgIssueResponseHours: 0,
        bugfixPrCount: 0,
        prMergeRate: 0,
        avgPrDescriptionLength: 0,
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
        contributionVariance: 0,
      },
    });
    expect(Number.isNaN(report.overallScore)).toBe(false);
  });
});

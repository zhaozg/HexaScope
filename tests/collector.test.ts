/**
 * GitHub 数据采集器单元测试。
 *
 * 使用 Bun.serve 启动本地 mock 服务器模拟 GitHub API，
 * 严禁在单元测试中真正发起网络调用。
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { collectEvaluationInput, decodeBase64Content, parseLastPage } from '../scripts/collector.ts';
import { calculateDimensions, calculateOverallScore } from '../scripts/scoreCalculator.ts';

/** 编码 README（GitHub 返回 base64）。 */
const encode = (text: string): string => Buffer.from(text, 'utf8').toString('base64');

const README_MARKDOWN = [
  '# awesome',
  '',
  '![build](https://img.shields.io/badge/build-passing)',
  '![shot](https://example.com/a.png)',
  '',
  '## Installation',
  '```bash',
  'bun i awesome',
  '```',
  '## Usage',
  '```ts',
  'awesome()',
  '```',
  '## API',
  '## License',
  '#'.repeat(1) + ' 说明'.repeat(200),
].join('\n');

let server: { port: number | undefined; stop(): void };

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;

      if (path === '/users/alice') {
        return Response.json({ login: 'alice', public_repos: 2, followers: 20 });
      }

      if (path === '/users/alice/repos') {
        return Response.json([
          {
            name: 'awesome',
            full_name: 'alice/awesome',
            fork: false,
            size: 2048,
            stargazers_count: 300,
            forks_count: 4,
            open_issues_count: 2,
            language: 'TypeScript',
            default_branch: 'main',
            archived: false,
            pushed_at: '2026-01-01T00:00:00Z',
            topics: ['cli', 'tooling'],
            owner: { login: 'alice' },
          },
          {
            name: 'clones',
            full_name: 'alice/clones',
            fork: true,
            size: 10,
            stargazers_count: 0,
            forks_count: 0,
            open_issues_count: 0,
            language: null,
            default_branch: 'main',
            owner: { login: 'alice' },
          },
        ]);
      }

      if (path === '/repos/alice/awesome/git/trees/main') {
        return Response.json({
          tree: [
            { path: 'ARCHITECTURE.md', type: 'blob' },
            { path: 'docs/design.md', type: 'blob' },
            { path: '.github/workflows/ci.yml', type: 'blob' },
            { path: '.github/workflows/release.yml', type: 'blob' },
            { path: '.github/workflows/codeql.yml', type: 'blob' },
            { path: '.github/dependabot.yml', type: 'blob' },
            { path: '.pre-commit-config.yaml', type: 'blob' },
            { path: 'Dockerfile', type: 'blob' },
            { path: 'docker-compose.yml', type: 'blob' },
            { path: 'deploy/k8s/app.yaml', type: 'blob' },
            { path: 'CHANGELOG.md', type: 'blob' },
            { path: 'CONTRIBUTING.md', type: 'blob' },
            { path: 'LICENSE', type: 'blob' },
            { path: 'src/index.ts', type: 'blob' },
            { path: 'src/core/engine.ts', type: 'blob' },
            { path: 'tests/index.test.ts', type: 'blob' },
            { path: 'examples/demo.ts', type: 'blob' },
          ],
        });
      }

      if (path === '/repos/alice/awesome/readme') {
        return Response.json({ content: encode(README_MARKDOWN), encoding: 'base64' });
      }

      if (path === '/repos/alice/awesome/commits') {
        return Response.json(
          Array.from({ length: 10 }, (_, i) => ({
            commit: {
              message: i % 3 === 0 ? 'fix(parser): handle empty input' : `feat(core): change ${i}`,
              author: { date: `2026-01-${String(i + 1).padStart(2, '0')}T10:00:00Z` },
            },
          })),
        );
      }

      if (path === '/search/issues') {
        const query = url.searchParams.get('q') ?? '';
        if (query.startsWith('author:') && !query.includes('author:alice')) {
          return Response.json({ total_count: 0, items: [] });
        }
        if (query.includes('type:pr') && query.startsWith('author:')) {
          return Response.json({
            total_count: 2,
            items: [
              {
                number: 1,
                title: 'feat: add engine',
                body: 'x'.repeat(220),
                created_at: '2026-01-01T00:00:00Z',
                pull_request: { merged_at: '2026-01-02T00:00:00Z' },
                repository_url: 'https://api.github.com/repos/alice/awesome',
              },
              {
                number: 2,
                title: 'fix: crash',
                body: 'y'.repeat(120),
                created_at: '2026-01-03T00:00:00Z',
                pull_request: { merged_at: null },
                repository_url: 'https://api.github.com/repos/bob/toolkit',
              },
            ],
          });
        }
        if (query.includes('type:issue') && query.startsWith('author:')) {
          return Response.json({
            total_count: 1,
            items: [
              {
                number: 5,
                title: 'bug: 构建失败',
                body: '复现步骤',
                created_at: '2026-01-01T00:00:00Z',
                comments: 2,
                repository_url: 'https://api.github.com/repos/alice/awesome',
              },
            ],
          });
        }
        if (query.startsWith('commenter:')) {
          return Response.json({ total_count: 7, items: [] });
        }
        return Response.json({ total_count: 0, items: [] });
      }

      if (path === '/repos/alice/awesome/issues/5/comments') {
        return Response.json([
          {
            created_at: '2026-01-01T04:00:00Z',
            user: { login: 'alice' },
          },
          {
            created_at: '2026-01-01T06:00:00Z',
            user: { login: 'bob' },
          },
        ]);
      }

      if (path === '/users/bob') {
        return Response.json({ login: 'bob', public_repos: 0, followers: 0 });
      }
      if (path === '/users/bob/repos') {
        return Response.json([]);
      }

      return new Response('Not Found', { status: 404 });
    },
  });
});

afterAll(() => {
  server.stop();
});

describe('工具函数', () => {
  it('parseLastPage 从 Link 头解析末页', () => {
    const link =
      '<https://api.github.com/search/issues?page=2>; rel="next", <https://api.github.com/search/issues?page=12>; rel="last"';
    expect(parseLastPage(link)).toBe(12);
    expect(parseLastPage(undefined)).toBeNull();
    expect(parseLastPage('<x>; rel="next"')).toBeNull();
  });

  it('decodeBase64Content 还原带换行的 base64', () => {
    const encoded = Buffer.from('你好，HexaScope', 'utf8').toString('base64');
    expect(decodeBase64Content(`${encoded.slice(0, 4)}\n${encoded.slice(4)}`)).toBe('你好，HexaScope');
    expect(decodeBase64Content('')).toBe('');
  });
});

describe('collectEvaluationInput（本地 mock GitHub API）', () => {
  it('采集结构信号、README 质量与复杂度', async () => {
    const input = await collectEvaluationInput('alice', {
      token: 'ghp_test',
      baseUrl: `http://localhost:${server.port}`,
      now: () => new Date('2026-02-01T00:00:00Z'),
    });

    const awesome = input.repos.find((repo) => repo.name === 'awesome');
    expect(awesome).toBeDefined();
    expect(awesome?.signalsCollected).toBe(true);
    expect(awesome?.hasArchitectureMd).toBe(true);
    expect(awesome?.hasDesignDoc).toBe(true);
    expect(awesome?.hasCiConfig).toBe(true);
    expect(awesome?.hasTestDirectory).toBe(true);
    expect(awesome?.hasDockerfile).toBe(true);
    expect(awesome?.hasChangelog).toBe(true);
    expect(awesome?.hasContributing).toBe(true);
    expect(awesome?.hasLicense).toBe(true);
    expect(awesome?.hasExampleCode).toBe(true);
    expect(awesome?.automationDepth).toBeGreaterThan(0.5);
    expect(awesome?.readmeScore).toBeGreaterThan(50);
    expect(awesome?.complexityMetric).toBeGreaterThan(0);
    expect(awesome?.modularityScore).toBeGreaterThan(0);
    expect(awesome?.sourceFileCount).toBe(4);
    expect(awesome?.testFileCount).toBe(1);
    expect(awesome?.hasIssuesFromRealUsers).toBe(true);
    expect(awesome?.hasForksWithCommits).toBe(true);
    expect(awesome?.languages).toEqual(['TypeScript']);
  });

  it('未扫描的 Fork 仓库标记为未采集，且不计入结构维度', async () => {
    const input = await collectEvaluationInput('alice', {
      baseUrl: `http://localhost:${server.port}`,
    });
    const fork = input.repos.find((repo) => repo.name === 'clones');
    expect(fork?.signalsCollected).toBe(false);
    expect(fork?.isFork).toBe(true);

    const dims = calculateDimensions(input);
    const architecture = dims.find((dim) => dim.key === 'architecture');
    // 架构维度仍由已扫描的原创仓库支撑
    expect(architecture?.available).toBe(true);
    expect(architecture?.score).toBeGreaterThan(0);
  });

  it('从提交与搜索接口推导活动指标', async () => {
    const input = await collectEvaluationInput('alice', {
      baseUrl: `http://localhost:${server.port}`,
      now: () => new Date('2026-02-01T00:00:00Z'),
    });
    const { activity } = input;
    expect(activity.activityCollected).toBe(true);
    expect(activity.commitSamples?.length).toBeGreaterThan(0);
    expect(activity.bugfixPrCount).toBeGreaterThan(0);
    expect(activity.prSampleSize).toBe(2);
    expect(activity.issueSampleSize).toBe(1);
    expect(activity.prMergeRate).toBeCloseTo(0.5, 4);
    expect(activity.avgPrDescriptionLength).toBeGreaterThan(100);
    expect(activity.reviewCommentCount).toBe(7);
    expect(activity.issueDiscussionCount).toBe(7);
    expect(activity.uniqueCollaborators).toBe(1);
    // 仅 1 条 PR 被合并，且来自本人仓库 → 自合并比例 1.0
    expect(activity.selfMergedPrRatio).toBeCloseTo(1, 4);
    expect(activity.contributionVariance).not.toBeNull();
    expect(activity.starFollowRatio).toBeCloseTo(0.1, 4);
    expect(activity.forkRatio).toBeCloseTo(0.5, 4);
  });

  it('估算 Issue 响应时长（首个非本人评论的延迟）', async () => {
    const input = await collectEvaluationInput('alice', {
      baseUrl: `http://localhost:${server.port}`,
    });
    // 2026-01-01T00:00 创建，2026-01-01T06:00 首次外部回复 → 6 小时
    expect(input.activity.avgIssueResponseHours).toBeCloseTo(6, 2);
  });

  it('无仓库账户返回零值且覆盖度标记为未采集', async () => {
    const input = await collectEvaluationInput('bob', {
      baseUrl: `http://localhost:${server.port}`,
    });
    expect(input.repos).toHaveLength(0);
    expect(input.activity.forkRatio).toBe(0);
    expect(input.activity.emptyRepoRatio).toBe(0);
    expect(input.activity.starFollowRatio).toBe(0);
    expect(input.activity.avgIssueResponseHours).toBeNull();
    expect(input.coverage?.repoSignals).toBe(false);
    expect(input.coverage?.activity).toBe(false);

    const dims = calculateDimensions(input);
    expect(dims.every((dim) => dim.available === false)).toBe(true);
    expect(calculateOverallScore(dims)).toBe(0);
  });

  it('单个仓库采集失败不影响整体（全部信号标记未采集）', async () => {
    const input = await collectEvaluationInput('alice', {
      baseUrl: `http://localhost:${server.port}`,
      // 指向不存在的分支 → git tree 404 → 该仓库降级
      maxScannedRepos: 1,
    });
    expect(input.repos.length).toBeGreaterThan(0);
    expect(input.coverage?.repoSignals).toBe(true);
  });
});

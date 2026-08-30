/**
 * HexaScope CLI 统一入口。
 *
 * 用法：
 *   node scripts/cli.ts evaluate <username>   # 采集 + 评分 + 红牌检测
 *   node scripts/cli.ts score <json>          # 仅评分（读 JSON 输入）
 *
 * 生产环境（GitHub Actions）通过 GITHUB_TOKEN 环境变量注入令牌。
 */

import { Octokit } from '@octokit/rest';
import { calculateDimensions, calculateOverallScore } from './scoreCalculator.js';
import { detectRedFlags } from './redflagDetector.js';
import type { EvaluationInput, EvaluationReport } from './types.js';

/** 自我评估免责声明（隐私边界要求）。 */
export const DISCLAIMER =
  '本报告基于 GitHub 公开数据自动生成，仅供参考。' +
  '自我评估存在主观偏差（戏剧化），不构成招聘、评级或任何决策依据。';

/** 生成评估报告（纯函数，便于测试）。 */
export function buildReport(
  input: EvaluationInput,
  generatedAt = new Date().toISOString(),
): EvaluationReport {
  const dimensions = calculateDimensions(input);
  const redFlags = detectRedFlags(input);
  return {
    username: input.username,
    generatedAt,
    dimensions,
    redFlags,
    overallScore: calculateOverallScore(dimensions),
    disclaimer: DISCLAIMER,
  };
}

/**
 * 从 GitHub API 采集用户数据并构造评估输入。
 * @param username GitHub 用户名
 * @param token GitHub Token（可选，公开数据可不传）
 */
export async function fetchEvaluationInput(
  username: string,
  token?: string,
): Promise<EvaluationInput> {
  const octokit = new Octokit(token ? { auth: token } : {});

  const { data: user } = await octokit.rest.users.getByUsername({ username });

  const { data: rawRepos } = await octokit.rest.repos.listForUser({
    username,
    per_page: 100,
    sort: 'updated',
  });

  // Phase 1 骨架：先基于可获得的公开字段构造 RepoInfo，
  // 仓库级信号（测试目录、Dockerfile 等）后续通过 git trees API 增量补全。
  const repos = rawRepos.map((repo) => ({
    name: repo.name,
    stars: repo.stargazers_count ?? 0,
    isFork: repo.fork ?? false,
    isEmpty: (repo.size ?? 0) === 0,
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
    languages: repo.language ? [repo.language] : [],
    readmeScore: 0,
    hasUseCasesDoc: false,
    hasExampleCode: false,
    hasIssuesFromRealUsers: false,
    hasForksWithCommits: false,
  }));

  return {
    username,
    repos,
    activity: {
      avgIssueResponseHours: 0,
      bugfixPrCount: 0,
      prMergeRate: 0,
      avgPrDescriptionLength: 0,
      reviewCommentCount: 0,
      issueDiscussionCount: 0,
      uniqueCollaborators: 0,
      selfMergedPrRatio: 0,
      forkRatio: repos.length > 0 ? repos.filter((r) => r.isFork).length / repos.length : 0,
      aiCodeProbability: 0,
      botLikeCommitPattern: false,
      starFollowRatio:
        user.followers && user.followers > 0 ? user.public_repos / user.followers : 0,
      emptyRepoRatio: repos.length > 0 ? repos.filter((r) => r.isEmpty).length / repos.length : 0,
      duplicateRepoRatio: 0,
      meaninglessCommitRatio: 0,
      selfResolvedIssueRatio: 0,
      contributionVariance: 0,
    },
  };
}

/** CLI 入口。 */
async function main(): Promise<void> {
  const [command, arg] = process.argv.slice(2);

  if (command === 'evaluate' && arg) {
    const token = process.env.GITHUB_TOKEN;
    const input = await fetchEvaluationInput(arg, token);
    const report = buildReport(input);
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return;
  }

  if (command === 'score' && arg) {
    const input = JSON.parse(arg) as EvaluationInput;
    const report = buildReport(input);
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return;
  }

  process.stderr.write(
    '用法: node scripts/cli.ts evaluate <username> | node scripts/cli.ts score <json>\n',
  );
  process.exitCode = 1;
}

// 仅在直接执行时运行（被 import 时不触发）
if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file://').href) {
  void main();
}

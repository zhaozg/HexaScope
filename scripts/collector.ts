/**
 * HexaScope GitHub 数据采集器。
 *
 * 职责：把 GitHub 公开数据转换为评分引擎所需的 `EvaluationInput`。
 * 原则：
 *  - **请求预算可控**：单用户评估的 API 调用量上限约 60 次（ADR-002，保障免费额度）；
 *  - **失败可降级**：单个仓库采集失败只影响该仓库，标记 `signalsCollected: false`，
 *    对应维度判为"数据不足"而非 0 分；
 *  - **无臆测**：`false` 表示"确认不存在"，`undefined`/`null` 表示"未采集/无法判定"。
 */

import { Octokit } from '@octokit/rest';
import {
  analyzeCommits,
  computeRepoStats,
  computeAutomationDepth,
  detectRepoSignals,
  nameSimilarityRatio,
  scoreComplexity,
  scoreModularity,
  scoreReadme,
  type CommitSample,
  type TreeEntry,
} from './metrics.ts';
import type { EvaluationInput, RepoInfo, UserActivity } from './types.ts';

/** 采集参数。 */
export interface CollectOptions {
  /** GitHub Token（可选，未提供则受匿名限流 60 次/小时）。 */
  token?: string;
  /** API 基础地址（测试指向本地 mock）。 */
  baseUrl?: string;
  /** 时间基准（用于"近一年"窗口，便于测试确定性）。 */
  now?: () => Date;
  /** 扫描文件树的仓库数上限（每个消耗 1 次 API）。 */
  maxScannedRepos?: number;
  /** 拉取提交历史的仓库数上限。 */
  maxCommitRepos?: number;
}

/** 默认扫描预算：文件树 8 个仓库。 */
export const DEFAULT_MAX_SCANNED_REPOS = 8;
/** 默认提交预算：5 个仓库。 */
export const DEFAULT_MAX_COMMIT_REPOS = 5;
/** 单仓库读取的提交样本上限。 */
export const COMMITS_PER_REPO = 100;
/** 搜索接口单页大小。 */
export const SEARCH_PAGE_SIZE = 50;
/** Issue 响应时长采样的最大 Issue 数。 */
export const MAX_ISSUE_SAMPLES = 5;

/** GitHub API 仓库对象（仅取用到的字段，避免依赖完整类型）。 */
interface RawRepo {
  name?: string;
  full_name?: string;
  fork?: boolean;
  size?: number;
  stargazers_count?: number;
  forks_count?: number;
  open_issues_count?: number;
  language?: string | null;
  languages_url?: string;
  default_branch?: string;
  archived?: boolean;
  pushed_at?: string | null;
  topics?: string[];
  license?: unknown;
  owner?: { login?: string };
  has_issues?: boolean;
}

/** GitHub API 搜索条目。 */
interface RawSearchItem {
  number?: number;
  title?: string;
  body?: string | null;
  created_at?: string;
  closed_at?: string | null;
  state?: string;
  comments?: number;
  pull_request?: { merged_at?: string | null; html_url?: string };
  repository_url?: string;
  user?: { login?: string };
}

/** GitHub 提交条目。 */
interface RawCommit {
  commit?: {
    message?: string;
    author?: { date?: string } | null;
    committer?: { date?: string } | null;
  };
  author?: { login?: string } | null;
}

/** 从 Link 头解析末页页码（用于零成本获取总数）。 */
export function parseLastPage(linkHeader: string | undefined): number | null {
  if (!linkHeader) {
    return null;
  }
  const match = linkHeader.match(/[?&]page=(\d+)>;\s*rel="last"/);
  if (!match || !match[1]) {
    return null;
  }
  const page = Number.parseInt(match[1], 10);
  return Number.isFinite(page) ? page : null;
}

/** 解析仓库 owner/name。 */
function parseRepoFullName(fullName: string): { owner: string; name: string } | null {
  const [owner, name] = fullName.split('/');
  if (!owner || !name) {
    return null;
  }
  return { owner, name };
}

/** 从 repository_url 提取 owner/name。 */
function repoFullNameFromUrl(url: string | undefined): string {
  if (!url) {
    return '';
  }
  return url.replace('https://api.github.com/repos/', '');
}

/** base64 解码 README（GitHub 返回带换行的 base64）。 */
export function decodeBase64Content(content: string): string {
  try {
    return Buffer.from(content.replace(/\n/g, ''), 'base64').toString('utf8');
  } catch {
    return '';
  }
}

/** 安全执行请求，失败返回 null（单点失败不影响整体评估）。 */
async function safe<T>(task: () => Promise<T>): Promise<T | null> {
  try {
    return await task();
  } catch {
    return null;
  }
}

/**
 * 从 GitHub 采集用户公开数据并构造评分输入。
 * @param username 用户名
 * @param options 采集参数
 * @returns 评分引擎输入（含 coverage 标记）
 */
export async function collectEvaluationInput(
  username: string,
  options: CollectOptions = {},
): Promise<EvaluationInput> {
  const baseUrl = options.baseUrl ?? 'https://api.github.com';
  const now = options.now ?? (() => new Date());
  const octokit = new Octokit({
    baseUrl,
    ...(options.token ? { auth: options.token } : {}),
  });
  const since = new Date(now().getTime() - 365 * 24 * 3600 * 1000).toISOString();
  const maxScanned = options.maxScannedRepos ?? DEFAULT_MAX_SCANNED_REPOS;
  const maxCommitRepos = options.maxCommitRepos ?? DEFAULT_MAX_COMMIT_REPOS;

  const userResponse = await octokit.rest.users.getByUsername({ username });
  const user = userResponse.data as unknown as {
    login?: string;
    public_repos?: number;
    followers?: number;
  };

  const repoResponse = await octokit.rest.repos.listForUser({
    username,
    per_page: 100,
    sort: 'updated',
  });
  const rawRepos = repoResponse.data as unknown as RawRepo[];

  // 只扫描原创仓库（按 Star 降序），Fork 与空仓库不消耗采集预算
  const scanTargets = rawRepos
    .filter((repo) => !repo.fork && (repo.size ?? 0) > 0)
    .sort((a, b) => (b.stargazers_count ?? 0) - (a.stargazers_count ?? 0))
    .slice(0, maxScanned);
  const commitTargets = scanTargets.slice(0, maxCommitRepos);

  const allCommits: CommitSample[] = [];
  const scanResults = new Map<string, RepoInfo>();

  for (const repo of scanTargets) {
    const name = repo.name ?? '';
    const owner = repo.owner?.login ?? username;
    if (!name) {
      continue;
    }

    const tree = await safe(() =>
      octokit.rest.git.getTree({
        owner,
        repo: name,
        tree_sha: repo.default_branch ?? 'HEAD',
        recursive: 'true',
      }),
    );

    const readme = await safe(() => octokit.rest.repos.getReadme({ owner, repo: name }));

    const collected = tree !== null;
    const entries: TreeEntry[] = collected
      ? ((tree.data.tree ?? []) as { path?: string; type?: string }[])
          .filter((entry): entry is { path: string; type: string } =>
            Boolean(entry.path && entry.type),
          )
          .map((entry) => ({ path: entry.path, type: entry.type }))
      : [];

    const signals = collected ? detectRepoSignals(entries.map((entry) => entry.path)) : null;
    const stats = collected
      ? computeRepoStats(entries)
      : {
          fileCount: 0,
          sourceFileCount: 0,
          testFileCount: 0,
          maxDepth: 0,
          dirCount: 0,
          topLevelDirCount: 0,
        };

    const readmeContent =
      readme && typeof readme.data.content === 'string'
        ? decodeBase64Content(readme.data.content)
        : '';
    const readmeAnalysis = readmeContent ? scoreReadme(readmeContent) : null;
    const topics = repo.topics ?? [];

    const repoInfo: RepoInfo = {
      name,
      fullName: repo.full_name ?? `${owner}/${name}`,
      stars: repo.stargazers_count ?? 0,
      isFork: repo.fork ?? false,
      isEmpty: (repo.size ?? 0) === 0,
      // 结构信号：仅当采集成功且确实存在时为 true
      hasArchitectureMd: signals?.hasArchitectureMd ?? false,
      hasDesignDoc: signals?.hasDesignDoc ?? false,
      hasTestDirectory: signals?.hasTestDirectory ?? false,
      hasCiConfig: signals?.hasCiConfig ?? false,
      hasDockerfile: signals?.hasDockerfile ?? false,
      hasDockerCompose: signals?.hasDockerCompose ?? false,
      hasKubernetesManifest: signals?.hasKubernetesManifest ?? false,
      hasPreCommitHooks: signals?.hasPreCommitHooks ?? false,
      hasDependencyBot: signals?.hasDependencyBot ?? false,
      hasReleaseWorkflow: signals?.hasReleaseWorkflow ?? false,
      hasCodeqlOrSecurityScan: signals?.hasCodeqlOrSecurityScan ?? false,
      complexityMetric: scoreComplexity(stats, repo.language ? [repo.language] : []),
      modularityScore: signals ? scoreModularity(stats, signals) : 0,
      automationDepth: signals ? computeAutomationDepth(signals) : 0,
      languages: repo.language ? [repo.language] : [],
      readmeScore: readmeAnalysis?.score ?? 0,
      // 真实用户信号
      hasUseCasesDoc: topics.length > 0 || (readmeAnalysis?.hasUseCasesDoc ?? false),
      hasExampleCode: signals?.hasExampleCode ?? false,
      hasIssuesFromRealUsers: (repo.open_issues_count ?? 0) > 0,
      hasForksWithCommits: (repo.forks_count ?? 0) > 0,
      // Phase 2 细粒度信号
      signalsCollected: collected,
      ...(signals
        ? {
            hasDocs: signals.hasDocs,
            hasChangelog: signals.hasChangelog,
            hasContributing: signals.hasContributing,
            hasLicense: signals.hasLicense,
          }
        : {}),
      ...(readmeAnalysis
        ? {
            hasBadges: readmeAnalysis.hasBadges,
            hasScreenshots: readmeAnalysis.hasScreenshots,
            hasInstallSection: readmeAnalysis.hasInstallSection,
            hasUsageSection: readmeAnalysis.hasUsageSection,
            readmeLength: readmeAnalysis.length,
          }
        : {}),
      ...(collected
        ? {
            fileCount: stats.fileCount,
            sourceFileCount: stats.sourceFileCount,
            testFileCount: stats.testFileCount,
            maxDepth: stats.maxDepth,
          }
        : {}),
      forkCount: repo.forks_count ?? 0,
      openIssueCount: repo.open_issues_count ?? 0,
      topics,
      archived: repo.archived ?? false,
      ...(repo.pushed_at ? { pushedAt: repo.pushed_at } : {}),
    };

    scanResults.set(`${owner}/${name}`, repoInfo);

    if (commitTargets.includes(repo)) {
      const commits = await safe(() =>
        octokit.rest.repos.listCommits({
          owner,
          repo: name,
          author: username,
          per_page: COMMITS_PER_REPO,
          since,
        }),
      );
      if (commits) {
        for (const item of commits.data as unknown as RawCommit[]) {
          const message = item.commit?.message ?? '';
          const date = item.commit?.author?.date ?? item.commit?.committer?.date ?? '';
          if (message && date) {
            allCommits.push({ message, date });
          }
        }
      }
    }
  }

  const repos: RepoInfo[] = rawRepos.map((repo) => {
    const name = repo.name ?? '';
    const owner = repo.owner?.login ?? username;
    const scanned = scanResults.get(`${owner}/${name}`);
    if (scanned) {
      return scanned;
    }
    return {
      name,
      fullName: repo.full_name ?? `${owner}/${name}`,
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
      hasUseCasesDoc: (repo.topics ?? []).length > 0,
      hasExampleCode: false,
      hasIssuesFromRealUsers: (repo.open_issues_count ?? 0) > 0,
      hasForksWithCommits: (repo.forks_count ?? 0) > 0,
      // 未扫描：结构信号视为"未采集"
      signalsCollected: false,
      forkCount: repo.forks_count ?? 0,
      openIssueCount: repo.open_issues_count ?? 0,
      topics: repo.topics ?? [],
      archived: repo.archived ?? false,
    };
  });

  const activity = await collectActivity(octokit, username, allCommits, repos, since, {
    followers: user.followers ?? 0,
    publicRepos: user.public_repos ?? repos.length,
  });

  return {
    username,
    repos,
    activity,
    coverage: {
      repoSignals: scanResults.size > 0,
      activity: activity.activityCollected === true,
    },
  };
}

/**
 * 采集用户级活动指标。
 * @param octokit Octokit 实例
 * @param username 用户名
 * @param commits 已采集的提交样本
 * @param repos 仓库列表
 * @param since 一年前的时间戳（ISO）
 * @param userStats 用户级统计（粉丝数 / 公开仓库数）
 * @returns 活动指标
 */
async function collectActivity(
  octokit: Octokit,
  username: string,
  commits: CommitSample[],
  repos: RepoInfo[],
  since: string,
  userStats: { followers: number; publicRepos: number },
): Promise<UserActivity> {
  const commitAnalysis = analyzeCommits(commits);

  const prSearch = await safe(() =>
    octokit.rest.search.issuesAndPullRequests({
      q: `author:${username} type:pr created:>=${since.slice(0, 10)}`,
      per_page: SEARCH_PAGE_SIZE,
      sort: 'created',
      order: 'desc',
    }),
  );
  const issueSearch = await safe(() =>
    octokit.rest.search.issuesAndPullRequests({
      q: `author:${username} type:issue created:>=${since.slice(0, 10)}`,
      per_page: SEARCH_PAGE_SIZE,
      sort: 'created',
      order: 'desc',
    }),
  );

  const prs = (prSearch?.data.items ?? []) as unknown as RawSearchItem[];
  const issues = (issueSearch?.data.items ?? []) as unknown as RawSearchItem[];

  // Code Review / Issue 讨论参与：search 的 total_count 零额外成本
  const reviewSearch = await safe(() =>
    octokit.rest.search.issuesAndPullRequests({
      q: `commenter:${username} type:pr`,
      per_page: 1,
    }),
  );
  const discussionSearch = await safe(() =>
    octokit.rest.search.issuesAndPullRequests({
      q: `commenter:${username} type:issue`,
      per_page: 1,
    }),
  );

  const mergedPrs = prs.filter((pr) => Boolean(pr.pull_request?.merged_at));
  const prMergeRate = prs.length > 0 ? mergedPrs.length / prs.length : 0;

  const descriptions = prs.map((pr) => (pr.body ?? '').trim()).filter((body) => body.length > 0);
  const avgPrDescriptionLength =
    descriptions.length > 0
      ? descriptions.reduce((sum, body) => sum + body.length, 0) / descriptions.length
      : 0;

  // 自合并代理指标：被合并的 PR 中，仓库属于本人（owner/name 前缀为 username）的比例
  const selfOwnedMerged = mergedPrs.filter((pr) =>
    repoFullNameFromUrl(pr.repository_url).startsWith(`${username}/`),
  ).length;
  const selfMergedPrRatio = mergedPrs.length > 0 ? selfOwnedMerged / mergedPrs.length : 0;

  const collaborators = new Set<string>();
  for (const pr of prs) {
    const fullName = repoFullNameFromUrl(pr.repository_url);
    const [owner] = fullName.split('/');
    if (owner && owner.toLowerCase() !== username.toLowerCase()) {
      collaborators.add(owner.toLowerCase());
    }
  }

  const avgIssueResponseHours = await estimateIssueResponseHours(octokit, username, issues);

  const repoCount = repos.length;
  const nonForkRepos = repos.filter((repo) => !repo.isFork);
  const nameRatio = nameSimilarityRatio(nonForkRepos.map((repo) => repo.name));
  // 红牌 #5：Star/Follow 失调。公开仓库数远大于粉丝数时才可疑，因此取仓库/粉丝比。
  const starFollowRatio =
    userStats.followers > 0 ? Number((userStats.publicRepos / userStats.followers).toFixed(4)) : 0;

  return {
    avgIssueResponseHours,
    bugfixPrCount: commitAnalysis.bugfixCount,
    prMergeRate: Number(prMergeRate.toFixed(4)),
    avgPrDescriptionLength: Number(avgPrDescriptionLength.toFixed(2)),
    reviewCommentCount: reviewSearch?.data.total_count ?? 0,
    issueDiscussionCount: discussionSearch?.data.total_count ?? 0,
    uniqueCollaborators: collaborators.size,
    selfMergedPrRatio: Number(selfMergedPrRatio.toFixed(4)),
    forkRatio:
      repoCount > 0 ? Number((repos.filter((r) => r.isFork).length / repoCount).toFixed(4)) : 0,
    aiCodeProbability: commitAnalysis.aiCodeProbability,
    botLikeCommitPattern: commitAnalysis.botLikeCommitPattern,
    starFollowRatio,
    emptyRepoRatio:
      repoCount > 0 ? Number((repos.filter((r) => r.isEmpty).length / repoCount).toFixed(4)) : 0,
    duplicateRepoRatio: nameRatio,
    meaninglessCommitRatio: Number(commitAnalysis.meaninglessRatio.toFixed(4)),
    selfResolvedIssueRatio: 0,
    contributionVariance: commitAnalysis.contributionVariance,
    activityCollected: commitAnalysis.sampleSize > 0 || prs.length > 0 || issues.length > 0,
    conventionalCommitRatio: commitAnalysis.conventionalRatio,
    commitSamples: commitAnalysis.samples,
    prSampleSize: prs.length,
    issueSampleSize: issues.length,
  };
}

/**
 * 估算平均 Issue 响应时长（本人提的 Issue，首个非本人评论的延迟）。
 * @param octokit Octokit 实例
 * @param username 用户名
 * @param issues 本人提交的 Issue 样本
 * @returns 平均小时数；无有效样本时返回 null
 */
export async function estimateIssueResponseHours(
  octokit: Octokit,
  username: string,
  issues: RawSearchItem[],
): Promise<number | null> {
  const samples = issues
    .filter((issue) => Boolean(issue.comments) && issue.created_at)
    .slice(0, MAX_ISSUE_SAMPLES);
  if (samples.length === 0) {
    return null;
  }

  const delays: number[] = [];
  for (const issue of samples) {
    if (!issue.number || !issue.created_at) {
      continue;
    }
    // 逐条解析所属仓库，避免跨仓库误查
    const parsed = parseRepoFullName(repoFullNameFromUrl(issue.repository_url));
    if (!parsed) {
      continue;
    }
    const comments = await safe(() =>
      octokit.rest.issues.listComments({
        owner: parsed.owner,
        repo: parsed.name,
        issue_number: issue.number as number,
        per_page: 20,
        sort: 'created',
        direction: 'asc',
      }),
    );
    if (!comments) {
      continue;
    }
    const created = new Date(issue.created_at).getTime();
    const firstExternal = (
      comments.data as unknown as { created_at?: string; user?: { login?: string } }[]
    )
      .filter((comment) => comment.user?.login?.toLowerCase() !== username.toLowerCase())
      .map((comment) => new Date(comment.created_at ?? '').getTime())
      .filter((time) => Number.isFinite(time))
      .sort((a, b) => a - b)[0];
    if (firstExternal !== undefined && firstExternal > created) {
      delays.push((firstExternal - created) / 3600000);
    }
  }

  if (delays.length === 0) {
    return null;
  }
  const average = delays.reduce((sum, value) => sum + value, 0) / delays.length;
  return Number(average.toFixed(2));
}

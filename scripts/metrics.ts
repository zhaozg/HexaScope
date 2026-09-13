/**
 * HexaScope 指标启发式库（纯函数，确定性）。
 *
 * 本模块只做"从原始事实到信号"的确定性换算，不做任何网络调用，
 * 因此可被完整单测覆盖，且保证相同输入必然得到相同输出。
 *
 * @see DESIGN.md 4.2 评分逻辑细则
 */

/** git trees 中的单个条目。 */
export interface TreeEntry {
  /** 仓库内相对路径。 */
  path: string;
  /** 条目类型。 */
  type: string;
}

/** 仓库结构信号（由文件清单推导）。 */
export interface RepoSignals {
  hasArchitectureMd: boolean;
  hasDesignDoc: boolean;
  hasTestDirectory: boolean;
  hasCiConfig: boolean;
  hasDockerfile: boolean;
  hasDockerCompose: boolean;
  hasKubernetesManifest: boolean;
  hasPreCommitHooks: boolean;
  hasDependencyBot: boolean;
  hasReleaseWorkflow: boolean;
  hasCodeqlOrSecurityScan: boolean;
  hasDocs: boolean;
  hasChangelog: boolean;
  hasContributing: boolean;
  hasLicense: boolean;
  hasExampleCode: boolean;
}

/** 仓库结构统计。 */
export interface RepoStats {
  /** 文件总数。 */
  fileCount: number;
  /** 源码文件数。 */
  sourceFileCount: number;
  /** 测试文件数。 */
  testFileCount: number;
  /** 目录最大嵌套深度（根目录为 0）。 */
  maxDepth: number;
  /** 目录总数。 */
  dirCount: number;
  /** 顶层目录数。 */
  topLevelDirCount: number;
}

/** README 质量评估结果。 */
export interface ReadmeAnalysis {
  /** 0-100 质量分。 */
  score: number;
  /** 字符数。 */
  length: number;
  hasInstallSection: boolean;
  hasUsageSection: boolean;
  hasUseCasesDoc: boolean;
  hasExampleCode: boolean;
  hasBadges: boolean;
  hasScreenshots: boolean;
}

/** 提交样本。 */
export interface CommitSample {
  /** 提交信息（首行）。 */
  message: string;
  /** 提交时间（ISO 8601）。 */
  date: string;
}

/** 提交历史分析结果。 */
export interface CommitAnalysis {
  /** 样本数。 */
  sampleSize: number;
  /** 无意义提交占比 0-1。 */
  meaninglessRatio: number;
  /** 疑似 Bug 修复提交数。 */
  bugfixCount: number;
  /** 符合 Conventional Commits 的比例 0-1。 */
  conventionalRatio: number;
  /** 平均信息长度（字符）。 */
  avgLength: number;
  /** 提交时间是否呈 Bot 模式。 */
  botLikeCommitPattern: boolean;
  /** AI 生成代码概率 0-1。 */
  aiCodeProbability: number;
  /** 日提交量变异系数；采样跨度不足 7 天时为 null。 */
  contributionVariance: number | null;
  /** 代表性提交信息（最多 5 条）。 */
  samples: string[];
}

const SOURCE_FILE =
  /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|rb|php|java|kt|kts|scala|swift|c|h|cc|cpp|hpp|cxx|cs|lua|zig|sh|bash|zsh|sql|vue|svelte|dart|ex|exs|erl|hs|ml|clj|groovy|pl|r|jl)$/i;
const TEST_FILE = /(^|\/)(test|tests|spec|specs|__tests__)\/|\.(test|spec)\.[a-z]+$/i;
const MEANINGLESS_MESSAGE =
  /^(update|updates|updated|fix|fixes|fixed|fix bug|bugfix|wip|tmp|temp|test|tests|init|initial commit|commit|changes?|misc|minor|patch|save|backup|todo|stuff|hello|first commit|\.+|-+|\d+)$/i;
const BUGFIX_MESSAGE =
  /(^|\b|\/)(fix(e[sd])?|bug(fix)?|hotfix|repair|regression)(\b|:|\(|\/)|修复|修正|缺陷|排错/i;
const AI_COAUTHOR = /co-authored-by:[^\n]*(copilot|claude|cursor|codex|devin|windsurf|chatgpt)/i;
const AI_GENERATED =
  /(generated|created|written|authored)\s+(with|by)\s+(copilot|claude|ai|chatgpt|cursor|codex)/i;
const CONVENTIONAL =
  /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([^)]*\))?!?:\s/;
const TEMPLATE_MESSAGE =
  /^(update|add|create|remove|delete)\s+[a-z0-9._/-]+\.(md|txt|json|ya?ml|lock)$/i;

const clamp = (value: number, min = 0, max = 100): number => Math.min(Math.max(value, min), max);

/** 判断任一路径满足条件。 */
function anyPath(paths: string[], test: (path: string) => boolean): boolean {
  return paths.some((path) => test(path));
}

/**
 * 从全量文件清单推导仓库结构信号。
 * @param paths git trees 返回的相对路径列表
 * @returns 各结构信号是否存在
 */
export function detectRepoSignals(paths: string[]): RepoSignals {
  const lower = paths.map((path) => path.toLowerCase());
  return {
    hasArchitectureMd: anyPath(lower, (p) => /(^|\/)architecture\.mdx?$/.test(p)),
    hasDesignDoc: anyPath(
      lower,
      (p) =>
        /(^|\/)(design|rfc)s?\.mdx?$/.test(p) ||
        /(^|\/)(adr|adrs)\/[^/]+\.mdx?$/.test(p) ||
        /(^|\/)docs?\/(design|rfc|adr)[^/]*\.mdx?$/.test(p),
    ),
    hasTestDirectory: anyPath(lower, (p) => TEST_FILE.test(p)),
    hasCiConfig:
      anyPath(lower, (p) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(p)) ||
      anyPath(lower, (p) =>
        /(^|\/)(\.gitlab-ci\.ya?ml|\.circleci\/config\.ya?ml|azure-pipelines\.ya?ml|jenkinsfile|\.travis\.ya?ml|buildkite\/[^/]+\.ya?ml)$/.test(
          p,
        ),
      ),
    hasDockerfile: anyPath(lower, (p) => /(^|\/)dockerfile(\.[^/]*)?$/.test(p)),
    hasDockerCompose:
      anyPath(lower, (p) => /(^|\/)docker-compose[^/]*\.ya?ml$/.test(p)) ||
      anyPath(lower, (p) => /(^|\/)compose\.ya?ml$/.test(p)),
    hasKubernetesManifest:
      anyPath(lower, (p) =>
        /(^|\/)(k8s|kubernetes|helm|manifests?|deployments?)\/.+\.ya?ml$/.test(p),
      ) || anyPath(lower, (p) => /(^|\/)(kustomization|chart)\.ya?ml$/.test(p)),
    hasPreCommitHooks:
      anyPath(lower, (p) => /(^|\/)\.pre-commit-config\.ya?ml$/.test(p)) ||
      anyPath(lower, (p) => /(^|\/)\.husky\//.test(p)) ||
      anyPath(lower, (p) => /(^|\/)lefthook\.ya?ml$/.test(p)),
    hasDependencyBot:
      anyPath(lower, (p) => /(^|\/)\.github\/dependabot\.ya?ml$/.test(p)) ||
      anyPath(lower, (p) => /(^|\/)renovate\.json5?$/.test(p)),
    hasReleaseWorkflow: anyPath(lower, (p) =>
      /^\.github\/workflows\/[^/]*(release|publish|deploy|semantic-release|goreleaser|docker)[^/]*\.ya?ml$/.test(
        p,
      ),
    ),
    hasCodeqlOrSecurityScan:
      anyPath(lower, (p) =>
        /^\.github\/workflows\/[^/]*(codeql|security|snyk|trivy|scorecard|audit|gitleaks)[^/]*\.ya?ml$/.test(
          p,
        ),
      ) || anyPath(lower, (p) => /(^|\/)(\.gitleaks\.toml|\.snyk|\.semgrep\.ya?ml)$/.test(p)),
    hasDocs: anyPath(lower, (p) => /(^|\/)docs?\//.test(p)),
    hasChangelog: anyPath(lower, (p) => /(^|\/)changelog(\.mdx?|\.txt)?$/.test(p)),
    hasContributing: anyPath(lower, (p) => /(^|\/)contributing(\.mdx?)?$/.test(p)),
    hasLicense: anyPath(lower, (p) => /(^|\/)licen[cs]e(\.mdx?|\.txt)?$/.test(p)),
    hasExampleCode:
      anyPath(lower, (p) => /(^|\/)(examples?|samples?|demos?|playground)\//.test(p)) ||
      anyPath(lower, (p) => /(^|\/)example[^/]*\.[a-z]+$/.test(p)),
  };
}

/**
 * 统计仓库结构。
 * @param entries git trees 条目
 * @returns 文件/目录统计
 */
export function computeRepoStats(entries: TreeEntry[]): RepoStats {
  const files = entries.filter((entry) => entry.type === 'blob');
  const paths = files.map((entry) => entry.path);
  const dirs = new Set<string>();
  let maxDepth = 0;

  for (const path of paths) {
    const segments = path.split('/');
    maxDepth = Math.max(maxDepth, segments.length - 1);
    for (let i = 1; i < segments.length; i += 1) {
      dirs.add(segments.slice(0, i).join('/'));
    }
  }

  const topLevelDirs = new Set<string>();
  for (const dir of dirs) {
    const [head] = dir.split('/');
    if (head) {
      topLevelDirs.add(head);
    }
  }

  return {
    fileCount: files.length,
    sourceFileCount: paths.filter((path) => SOURCE_FILE.test(path)).length,
    testFileCount: paths.filter((path) => TEST_FILE.test(path)).length,
    maxDepth,
    dirCount: dirs.size,
    topLevelDirCount: topLevelDirs.size,
  };
}

/**
 * 模块化评分：目录分层、顶层切分、是否分离测试。
 * @param stats 仓库结构统计
 * @param signals 结构信号
 * @returns 0-100
 */
export function scoreModularity(stats: RepoStats, signals: RepoSignals): number {
  let score = 0;
  score += Math.min(stats.topLevelDirCount * 3, 24);
  score += Math.min(stats.dirCount * 1.5, 26);
  score += Math.min(stats.maxDepth * 5, 20);
  if (signals.hasTestDirectory) {
    score += 12;
  }
  if (signals.hasDocs) {
    score += 8;
  }
  // 单仓多包（monorepo）或分层 src/*/ 结构额外加分
  if (stats.topLevelDirCount >= 5 && stats.maxDepth >= 3) {
    score += 10;
  }
  return clamp(score);
}

/**
 * 复杂度评分：源码规模、语言多样性、嵌套深度、测试密度。
 * @param stats 仓库结构统计
 * @param languages 语言列表
 * @returns 0-100
 */
export function scoreComplexity(stats: RepoStats, languages: string[]): number {
  let score = 0;
  score += Math.min(Math.log2(stats.sourceFileCount + 1) * 9, 42);
  score += Math.min(languages.length * 5, 20);
  score += Math.min(stats.maxDepth * 5, 20);
  score += Math.min(stats.testFileCount * 0.6, 18);
  return clamp(score);
}

/**
 * 自动化深度：CI/CD 与工具链信号的加权覆盖度。
 * @param signals 结构信号
 * @returns 0-1
 */
export function computeAutomationDepth(signals: RepoSignals): number {
  const weights: [boolean, number][] = [
    [signals.hasCiConfig, 0.25],
    [signals.hasReleaseWorkflow, 0.15],
    [signals.hasCodeqlOrSecurityScan, 0.16],
    [signals.hasPreCommitHooks, 0.1],
    [signals.hasDependencyBot, 0.1],
    [signals.hasDockerfile, 0.12],
    [signals.hasDockerCompose, 0.06],
    [signals.hasKubernetesManifest, 0.06],
  ];
  const depth = weights.reduce((sum, [present, weight]) => sum + (present ? weight : 0), 0);
  return Math.min(Math.max(depth, 0), 1);
}

/**
 * README 质量评分（确定性启发式）。
 *
 * 组成：篇幅 20 + 章节完整度 54 + 代码块 16 + 徽章 10 + 截图 10（上限 100）。
 * @param text README 原文
 * @returns 质量分析结果
 */
export function scoreReadme(text: string): ReadmeAnalysis {
  const length = text.length;
  const headings = [...text.matchAll(/^#{1,3}\s*(.+?)\s*$/gm)].map((match) =>
    (match[1] ?? '').toLowerCase(),
  );
  const hasHeading = (pattern: RegExp): boolean => headings.some((head) => pattern.test(head));

  const hasInstallSection = hasHeading(/install|getting started|quick ?start|setup|安装|快速开始/i);
  const hasUsageSection = hasHeading(/usage|how to use|getting started|example|使用|示例|教程/i);
  const hasUseCasesDoc = hasHeading(/use ?cases?|features?|why|场景|特性/i) || hasUsageSection;
  const hasApiSection = hasHeading(/api|reference|docs?|接口|文档/i);
  const hasLicenseSection = hasHeading(/licen[cs]e|许可/i);
  const hasContributingSection = hasHeading(/contribut|贡献/i);

  const codeBlockCount = Math.floor((text.match(/```/g) ?? []).length / 2);
  const badges = (
    text.match(/!\[[^\]]*\]\(https?:\/\/[^)]*(badge|shields\.io|codecov|coveralls|actions)/gi) ?? []
  ).length;
  const images = (text.match(/!\[[^\]]*\]\([^)]+\)/g) ?? []).length;

  let score = 0;
  if (length >= 3000) score += 20;
  else if (length >= 1500) score += 15;
  else if (length >= 600) score += 10;
  else if (length >= 200) score += 5;

  if (hasInstallSection) score += 12;
  if (hasUsageSection) score += 12;
  if (hasUseCasesDoc && !hasUsageSection) score += 6;
  if (hasApiSection) score += 8;
  if (hasLicenseSection) score += 6;
  if (hasContributingSection) score += 6;
  score += Math.min(codeBlockCount * 4, 16);
  score += Math.min(badges * 3, 10);
  score += Math.min(images * 4, 10);

  return {
    score: clamp(score),
    length,
    hasInstallSection,
    hasUsageSection,
    hasUseCasesDoc,
    hasExampleCode: codeBlockCount >= 2,
    hasBadges: badges > 0,
    hasScreenshots: images > 0,
  };
}

/** 去除首尾与多余空白。 */
function normalizeMessage(message: string): string {
  return message.trim().replace(/\s+/g, ' ');
}

/**
 * 分析提交历史：信息质量、Bug 修复密度、Bot 模式、AI 痕迹、贡献方差。
 * @param commits 提交样本（按时间倒序或正序均可，内部自排序）
 * @returns 提交分析结果
 */
export function analyzeCommits(commits: CommitSample[]): CommitAnalysis {
  const sampleSize = commits.length;
  if (sampleSize === 0) {
    return {
      sampleSize: 0,
      meaninglessRatio: 0,
      bugfixCount: 0,
      conventionalRatio: 0,
      avgLength: 0,
      botLikeCommitPattern: false,
      aiCodeProbability: 0,
      contributionVariance: null,
      samples: [],
    };
  }

  const messages = commits.map((commit) => normalizeMessage(commit.message));
  const meaningless = messages.filter((message) => {
    const head = message.split('\n')[0] ?? message;
    return MEANINGLESS_MESSAGE.test(head) || head.length < 5;
  }).length;
  const bugfixCount = messages.filter((message) => BUGFIX_MESSAGE.test(message)).length;
  const conventional = messages.filter((message) => CONVENTIONAL.test(message)).length;
  const aiCoauthored = messages.filter((message) => AI_COAUTHOR.test(message)).length;
  const aiGenerated = messages.filter((message) => AI_GENERATED.test(message)).length;
  const templated = messages.filter((message) => TEMPLATE_MESSAGE.test(message)).length;
  const avgLength = messages.reduce((sum, message) => sum + message.length, 0) / sampleSize;

  // Bot 模式：提交时间高度集中在单一小时且样本足够
  const hourHistogram = new Array<number>(24).fill(0);
  for (const commit of commits) {
    const parsed = new Date(commit.date);
    if (!Number.isNaN(parsed.getTime())) {
      hourHistogram[parsed.getUTCHours()] += 1;
    }
  }
  const peakHour = Math.max(...hourHistogram);
  const botLikeCommitPattern = sampleSize >= 10 && peakHour / sampleSize >= 0.6;

  // AI 痕迹：显式署名权重最高，模板化提交为辅
  const aiCodeProbability = Math.min(
    Math.max(
      (aiCoauthored / sampleSize) * 0.6 +
        (aiGenerated / sampleSize) * 0.7 +
        (templated / sampleSize) * 0.2,
      0,
    ),
    1,
  );

  // 贡献方差：日提交量的变异系数平方（需 ≥7 天样本，否则判为未知）
  const dailyCounts = new Map<string, number>();
  for (const commit of commits) {
    const parsed = new Date(commit.date);
    if (Number.isNaN(parsed.getTime())) continue;
    const day = parsed.toISOString().slice(0, 10);
    dailyCounts.set(day, (dailyCounts.get(day) ?? 0) + 1);
  }
  let contributionVariance: number | null = null;
  if (dailyCounts.size >= 7) {
    const counts = [...dailyCounts.values()];
    const mean = counts.reduce((sum, value) => sum + value, 0) / counts.length;
    if (mean > 0) {
      const variance = counts.reduce((sum, value) => sum + (value - mean) ** 2, 0) / counts.length;
      contributionVariance = Number((variance / mean ** 2).toFixed(4));
    }
  }

  const samples = messages
    .filter((message) => !MEANINGLESS_MESSAGE.test(message))
    .slice(0, 5)
    .map((message) => message.slice(0, 120));

  return {
    sampleSize,
    meaninglessRatio: meaningless / sampleSize,
    bugfixCount,
    conventionalRatio: conventional / sampleSize,
    avgLength: Number(avgLength.toFixed(2)),
    botLikeCommitPattern,
    aiCodeProbability: Number(aiCodeProbability.toFixed(4)),
    contributionVariance,
    samples,
  };
}

/**
 * 仓库同名相似度（模板克隆检测）。
 *
 * 归一化：小写、去版本号/通用后缀/分隔符后统计最高频名称占比。
 * @param names 仓库名列表
 * @returns 最高频归一化名称占比 0-1
 */
export function nameSimilarityRatio(names: string[]): number {
  if (names.length === 0) {
    return 0;
  }
  const counts = new Map<string, number>();
  for (const name of names) {
    const normalized = name
      .toLowerCase()
      .replace(/[-_. ]?(v?\d+(\.\d+)*)$/g, '')
      .replace(/[-_. ](api|demo|test|example|sample|app|web|site|new|old|copy|backup)$/g, '')
      .replace(/[-_. ]/g, '');
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }
  const max = Math.max(...counts.values());
  return Number((max / names.length).toFixed(4));
}

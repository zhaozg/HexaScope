/** HexaScope 共享类型定义。 */

/**
 * 单个仓库信息（评分输入）。
 *
 * 带 `?` 的字段为 Phase 2 采集器新增；
 * 缺省（`undefined`）表示"该信号未采集"，与 `false`（"确认不存在"）语义不同。
 */
export interface RepoInfo {
  /** 仓库名（不含 owner）。 */
  name: string;
  /** 完整仓库名（owner/name）。 */
  fullName?: string;
  /** Star 数量。 */
  stars: number;
  /** 是否为 Fork 仓库。 */
  isFork: boolean;
  /** 是否为空仓库（仅含 README 或完全为空）。 */
  isEmpty: boolean;
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
  /** 代码复杂度指标 0-100。 */
  complexityMetric: number;
  /** 模块化程度评分 0-100。 */
  modularityScore: number;
  /** 自动化深度 0-1。 */
  automationDepth: number;
  /** 使用的主要编程语言列表。 */
  languages: string[];
  /** README 质量评分 0-100。 */
  readmeScore: number;
  hasUseCasesDoc: boolean;
  hasExampleCode: boolean;
  hasIssuesFromRealUsers: boolean;
  hasForksWithCommits: boolean;

  /* ---- Phase 2 采集信号（可选，缺省 = 未采集） ---- */
  /** 是否成功采集到该仓库的结构信号；false 表示 API 失败，全部信号视为未知。 */
  signalsCollected?: boolean;
  /** 是否存在 docs/ 或文档站点目录。 */
  hasDocs?: boolean;
  /** 是否存在 CHANGELOG。 */
  hasChangelog?: boolean;
  /** 是否存在 CONTRIBUTING 指南。 */
  hasContributing?: boolean;
  /** 是否声明开源许可证。 */
  hasLicense?: boolean;
  /** README 是否含徽章（CI/覆盖率/版本）。 */
  hasBadges?: boolean;
  /** README 是否含截图或演示图。 */
  hasScreenshots?: boolean;
  /** README 是否有安装章节。 */
  hasInstallSection?: boolean;
  /** README 是否有使用示例章节。 */
  hasUsageSection?: boolean;
  /** 仓库文件总数（git trees）。 */
  fileCount?: number;
  /** 源码文件数。 */
  sourceFileCount?: number;
  /** 测试文件数。 */
  testFileCount?: number;
  /** 目录最大嵌套深度。 */
  maxDepth?: number;
  /** 采样到的提交数。 */
  commitCount?: number;
  /** 贡献者数量。 */
  contributorCount?: number;
  /** Fork 数量。 */
  forkCount?: number;
  /** 未关闭 Issue 数。 */
  openIssueCount?: number;
  /** README 字符数。 */
  readmeLength?: number;
  /** 仓库主题标签。 */
  topics?: string[];
  /** 是否已归档。 */
  archived?: boolean;
  /** 最近一次推送时间（ISO 8601）。 */
  pushedAt?: string;
}

/**
 * 用户级活动指标（跨仓库聚合）。
 *
 * 计数型字段缺省为 0 表示"确实没有"；比率型字段使用 `null` 表示"样本不足，无法判定"。
 */
export interface UserActivity {
  /** 平均 Issue 响应时长（小时）；`null` = 样本不足。 */
  avgIssueResponseHours: number | null;
  /** 近一年 Bug 修复 PR 数量。 */
  bugfixPrCount: number;
  /** PR 合并率 0-1。 */
  prMergeRate: number;
  /** PR 平均描述长度（字符）。 */
  avgPrDescriptionLength: number;
  /** Code Review 评论总数。 */
  reviewCommentCount: number;
  /** Issue 讨论参与次数。 */
  issueDiscussionCount: number;
  /** 协作过的不同贡献者数量。 */
  uniqueCollaborators: number;
  /** PR 自合并比例 0-1（红牌 #1）。 */
  selfMergedPrRatio: number;
  /** Fork 占仓库总数比例 0-1（红牌 #2）。 */
  forkRatio: number;
  /** AI 生成代码概率 0-1（红牌 #3）。 */
  aiCodeProbability: number;
  /** 提交时间呈 Bot 模式（红牌 #4）。 */
  botLikeCommitPattern: boolean;
  /** Star/Follow 比值（红牌 #5）。 */
  starFollowRatio: number;
  /** 空仓库占比 0-1（红牌 #6）。 */
  emptyRepoRatio: number;
  /** 批量仓库同名占比 0-1（红牌 #7）。 */
  duplicateRepoRatio: number;
  /** 无意义提交信息占比 0-1（红牌 #8）。 */
  meaninglessCommitRatio: number;
  /** Issue 自问自答比例 0-1（红牌 #9）。 */
  selfResolvedIssueRatio: number;
  /** 贡献日提交量变异系数（红牌 #10）；`null` = 采样天数不足。 */
  contributionVariance: number | null;
  /** 是否采到活动数据样本（false 时活动维度标记为"数据不足"）。 */
  activityCollected?: boolean;
  /** 提交信息符合 Conventional Commits 的比例 0-1。 */
  conventionalCommitRatio?: number;
  /** 代表性提交信息样本（最多 5 条，供解读层引用）。 */
  commitSamples?: string[];
  /** 采集到的 PR 样本数。 */
  prSampleSize?: number;
  /** 采集到的 Issue 样本数。 */
  issueSampleSize?: number;
}

/** 数据覆盖度（决定维度是否可计分）。 */
export interface DataCoverage {
  /** 是否成功采集仓库结构信号。 */
  repoSignals: boolean;
  /** 是否成功采集活动样本。 */
  activity: boolean;
}

/** 单维度得分。 */
export interface DimensionScore {
  /** 维度键名（英文小写）。 */
  key: string;
  /** 维度中文名。 */
  name: string;
  /** 0-100 得分。 */
  score: number;
  /** 综合评分权重。 */
  weight: number;
  /** 该维度是否有足够数据支撑；false 时得分不参与综合加权。 */
  available?: boolean;
  /** 支撑该得分的关键证据（人类可读，供报告与解读层引用）。 */
  evidence?: string[];
}

/** 红牌项。 */
export interface RedFlag {
  /** 红牌编号 1-10。 */
  id: number;
  /** 红牌名称。 */
  name: string;
  /** 是否触发。 */
  detected: boolean;
  /** 触发详情（未触发时为空字符串）。 */
  detail: string;
}

/** LLM 解读条目。 */
export interface InsightItem {
  /** 结论标题。 */
  title: string;
  /** 具体解读。 */
  detail: string;
  /** 支撑该结论的确定性数据（必须来自报告事实）。 */
  evidence: string;
}

/**
 * LLM 智能解读层（可选增强）。
 *
 * 设计约束：**不参与打分**。分数与红牌始终由确定性算法产出，
 * 本层仅将已采集的结构化事实转写为可读的洞察与建议。
 */
export interface ReportInsights {
  /** 证据指纹（确定性缓存键，输入不变则复用）。 */
  evidenceHash: string;
  /** 产出该解读的模型标识。 */
  model: string;
  /** 生成时间（ISO 8601）。 */
  generatedAt: string;
  /** 总体画像综述。 */
  summary: string;
  /** 优势项。 */
  strengths: InsightItem[];
  /** 可提升项。 */
  improvements: InsightItem[];
  /** 红牌成因说明。 */
  redFlagNotes?: { id: number; note: string }[];
  /** 免责声明：解读不改变分数。 */
  advisory: string;
}

/** 评分引擎输入。 */
export interface EvaluationInput {
  /** 用户名。 */
  username: string;
  /** 仓库列表（按 Star 降序）。 */
  repos: RepoInfo[];
  /** 用户级活动指标。 */
  activity: UserActivity;
  /** 数据覆盖度（缺省 = 视为全覆盖，兼容 Phase 1 输入）。 */
  coverage?: DataCoverage;
}

/** 报告数据覆盖度摘要。 */
export interface ReportCoverage {
  /** 有效维度数。 */
  availableDimensions: number;
  /** 总维度数。 */
  totalDimensions: number;
  /** 采集信号说明。 */
  notes: string[];
}

/** 完整评估报告。 */
export interface EvaluationReport {
  username: string;
  generatedAt: string;
  dimensions: DimensionScore[];
  redFlags: RedFlag[];
  /** 加权综合得分 0-100（仅在有效维度上重新归一化）。 */
  overallScore: number;
  /** 自我评估免责声明。 */
  disclaimer: string;
  /** 数据覆盖度摘要（可选，Phase 2 报告提供）。 */
  coverage?: ReportCoverage;
  /** LLM 智能解读（可选；未启用或调用失败时为 undefined）。 */
  insights?: ReportInsights;
}

/** 最小可读流接口（CLI 输入，测试对象可轻松满足）。 */
export interface CliReadStream {
  setEncoding(encoding?: string): void;
  on(event: string, listener: (chunk: string) => void): unknown;
}

/** 最小可写流接口（CLI 输出，测试对象可轻松满足）。 */
export interface CliWriteStream {
  write(chunk: string): unknown;
}

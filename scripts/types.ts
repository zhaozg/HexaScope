/** HexaScope 共享类型定义。 */

/** 单个仓库信息（评分输入）。 */
export interface RepoInfo {
  /** 仓库名（不含 owner）。 */
  name: string;
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
}

/** 用户级活动指标（跨仓库聚合）。 */
export interface UserActivity {
  /** 平均 Issue 响应时长（小时）。 */
  avgIssueResponseHours: number;
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
  /** 贡献图提交量方差（红牌 #10）。 */
  contributionVariance: number;
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

/** 评分引擎输入。 */
export interface EvaluationInput {
  /** 用户名。 */
  username: string;
  /** 仓库列表（按 Star 降序）。 */
  repos: RepoInfo[];
  /** 用户级活动指标。 */
  activity: UserActivity;
}

/** 完整评估报告。 */
export interface EvaluationReport {
  username: string;
  generatedAt: string;
  dimensions: DimensionScore[];
  redFlags: RedFlag[];
  /** 加权综合得分 0-100。 */
  overallScore: number;
  /** 自我评估免责声明。 */
  disclaimer: string;
}

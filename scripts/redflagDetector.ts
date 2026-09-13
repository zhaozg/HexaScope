/**
 * HexaScope 红牌检测引擎。
 *
 * 确定性算法：10 项刷分特征检测，用于识别人为刷分的账户。
 *
 * 两条关键约束：
 *  1. **"未采集"不得被当作"异常"**——样本不足（贡献方差为 null、无提交样本）时
 *     必须判为"未触发（无法判定）"，否则空数据账户会被误报；
 *  2. **区分"正常行为"与"刷分特征"**——例如独立维护者合并自己的 PR 属正常，
 *     仅在同时"完全没有协作痕迹"时才计为红牌 #1。
 *
 * @see DESIGN.md 4.3
 */

import type { EvaluationInput, RedFlag, UserActivity } from './types.ts';

/** 红牌 #1：PR 自合并比例阈值。 */
export const SELF_MERGE_THRESHOLD = 0.6;
/** 红牌 #2：Fork 囤积阈值（且无原创代码）。 */
export const FORK_RATIO_THRESHOLD = 0.8;
/** 红牌 #3：AI 生成代码概率阈值。 */
export const AI_CODE_THRESHOLD = 0.7;
/** 红牌 #4：Bot 提交模式的最小样本量。 */
export const BOT_PATTERN_MIN_SAMPLE = 10;
/** 红牌 #5：Star/Follow 失调阈值。 */
export const STAR_FOLLOW_THRESHOLD = 100;
/** 红牌 #6：空仓库占比阈值。 */
export const EMPTY_REPO_THRESHOLD = 0.5;
/** 红牌 #7：批量同名仓库阈值。 */
export const DUPLICATE_REPO_THRESHOLD = 0.9;
/** 红牌 #8：无意义提交占比阈值。 */
export const MEANINGLESS_COMMIT_THRESHOLD = 0.6;
/** 红牌 #9：Issue 自问自答阈值。 */
export const SELF_RESOLVED_THRESHOLD = 0.7;
/** 红牌 #10：贡献日提交量变异系数阈值（低于此值即过于均匀）。 */
export const CONTRIBUTION_VARIANCE_THRESHOLD = 0.5;

/** 是否存在提交样本（用于区分"未采集"与"确认无异常"）。 */
function hasCommitSample(activity: UserActivity): boolean {
  return (activity.commitSamples?.length ?? 0) > 0 || activity.activityCollected === true;
}

/**
 * 检测 PR 自合并比例是否过高。
 *
 * 独立维护者在自有仓库合并自己的 PR 是常态，因此叠加"完全无协作痕迹"作为必要条件。
 * @param activity 用户活动指标
 */
function detectSelfMerge(activity: UserActivity): RedFlag {
  const noCollaboration =
    activity.reviewCommentCount === 0 && activity.uniqueCollaborators === 0;
  const detected = activity.selfMergedPrRatio > SELF_MERGE_THRESHOLD && noCollaboration;
  return {
    id: 1,
    name: 'PR 自合并比例过高',
    detected,
    detail: detected
      ? `自合并比例 ${(activity.selfMergedPrRatio * 100).toFixed(1)}%（阈值 >${SELF_MERGE_THRESHOLD * 100}%）且无协作记录`
      : '',
  };
}

/**
 * 检测 Fork 囤积（Fork 占比高且无原创代码）。
 * @param input 评估输入
 */
function detectForkHoarding(input: EvaluationInput): RedFlag {
  const { repos, activity } = input;
  const hasOriginalCode = repos.some((repo) => !repo.isFork && repo.stars > 0);
  const detected = activity.forkRatio > FORK_RATIO_THRESHOLD && !hasOriginalCode;
  return {
    id: 2,
    name: 'Fork 囤积',
    detected,
    detail: detected
      ? `Fork 占比 ${(activity.forkRatio * 100).toFixed(1)}%（阈值 >${FORK_RATIO_THRESHOLD * 100}%）且无原创项目`
      : '',
  };
}

/**
 * 检测 AI 生成代码特征。
 * @param activity 用户活动指标
 */
function detectAiCode(activity: UserActivity): RedFlag {
  // 无提交样本时概率恒为 0；显式要求样本存在，避免"未采集"被误判
  const detected = hasCommitSample(activity) && activity.aiCodeProbability > AI_CODE_THRESHOLD;
  return {
    id: 3,
    name: 'AI 生成代码特征',
    detected,
    detail: detected
      ? `AI 代码特征概率 ${(activity.aiCodeProbability * 100).toFixed(1)}%（阈值 >${AI_CODE_THRESHOLD * 100}%）`
      : '',
  };
}

/**
 * 检测提交时间分布异常（Bot 模式）。
 * @param activity 用户活动指标
 */
function detectBotPattern(activity: UserActivity): RedFlag {
  const sampleSize = activity.commitSamples?.length ?? 0;
  const detected = activity.botLikeCommitPattern && sampleSize >= BOT_PATTERN_MIN_SAMPLE;
  return {
    id: 4,
    name: '提交时间分布异常（Bot 模式）',
    detected,
    detail: detected ? '提交时间高度集中在固定时段，符合自动化脚本特征' : '',
  };
}

/**
 * 检测 Star/Follow 比例失调。
 * @param activity 用户活动指标
 */
function detectStarFollowRatio(activity: UserActivity): RedFlag {
  const detected = activity.starFollowRatio > STAR_FOLLOW_THRESHOLD;
  return {
    id: 5,
    name: 'Star/Follow 比例失调',
    detected,
    detail: detected
      ? `Star/Follow 比值 ${activity.starFollowRatio.toFixed(1)}:1（阈值 >${STAR_FOLLOW_THRESHOLD}:1）`
      : '',
  };
}

/**
 * 检测空仓库过多。
 * @param activity 用户活动指标
 */
function detectEmptyRepos(activity: UserActivity): RedFlag {
  const detected = activity.emptyRepoRatio > EMPTY_REPO_THRESHOLD;
  return {
    id: 6,
    name: '空仓库过多',
    detected,
    detail: detected
      ? `空仓库占比 ${(activity.emptyRepoRatio * 100).toFixed(1)}%（阈值 >${EMPTY_REPO_THRESHOLD * 100}%）`
      : '',
  };
}

/**
 * 检测批量仓库同名（模板克隆）。
 * @param activity 用户活动指标
 */
function detectDuplicateRepos(activity: UserActivity): RedFlag {
  const detected = activity.duplicateRepoRatio > DUPLICATE_REPO_THRESHOLD;
  return {
    id: 7,
    name: '批量仓库同名（模板克隆）',
    detected,
    detail: detected
      ? `仓库相似度 ${(activity.duplicateRepoRatio * 100).toFixed(1)}%（阈值 >${DUPLICATE_REPO_THRESHOLD * 100}%）`
      : '',
  };
}

/**
 * 检测无意义提交信息。
 * @param activity 用户活动指标
 */
function detectMeaninglessCommits(activity: UserActivity): RedFlag {
  const detected =
    hasCommitSample(activity) && activity.meaninglessCommitRatio > MEANINGLESS_COMMIT_THRESHOLD;
  return {
    id: 8,
    name: '无意义提交信息',
    detected,
    detail: detected
      ? `无意义提交占比 ${(activity.meaninglessCommitRatio * 100).toFixed(1)}%（阈值 >${MEANINGLESS_COMMIT_THRESHOLD * 100}%）`
      : '',
  };
}

/**
 * 检测 Issue 自问自答。
 * @param activity 用户活动指标
 */
function detectSelfResolvedIssues(activity: UserActivity): RedFlag {
  const detected = activity.selfResolvedIssueRatio > SELF_RESOLVED_THRESHOLD;
  return {
    id: 9,
    name: 'Issue 自问自答',
    detected,
    detail: detected
      ? `自问自答比例 ${(activity.selfResolvedIssueRatio * 100).toFixed(1)}%（阈值 >${SELF_RESOLVED_THRESHOLD * 100}%）`
      : '',
  };
}

/**
 * 检测贡献图过于均匀。
 * @param activity 用户活动指标
 */
function detectUniformContribution(activity: UserActivity): RedFlag {
  // null = 采样天数不足，无法判定贡献均匀性（避免空数据假阳性）
  const variance = activity.contributionVariance;
  const detected = variance !== null && variance < CONTRIBUTION_VARIANCE_THRESHOLD;
  return {
    id: 10,
    name: '贡献图过于均匀',
    detected,
    detail: detected
      ? `每日提交量变异系数 ${variance.toFixed(2)}（阈值 <${CONTRIBUTION_VARIANCE_THRESHOLD}）`
      : '',
  };
}

/**
 * 运行全部 10 项红牌检测。
 * @param input 评估输入
 * @returns 红牌列表（含未触发项，便于报告展示）
 */
export function detectRedFlags(input: EvaluationInput): RedFlag[] {
  const { activity } = input;
  return [
    detectSelfMerge(activity),
    detectForkHoarding(input),
    detectAiCode(activity),
    detectBotPattern(activity),
    detectStarFollowRatio(activity),
    detectEmptyRepos(activity),
    detectDuplicateRepos(activity),
    detectMeaninglessCommits(activity),
    detectSelfResolvedIssues(activity),
    detectUniformContribution(activity),
  ];
}

/** 已触发的红牌数量。 */
export function countTriggeredRedFlags(redFlags: RedFlag[]): number {
  return redFlags.filter((flag) => flag.detected).length;
}

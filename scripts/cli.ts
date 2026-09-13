/**
 * HexaScope CLI 统一入口。
 *
 * 用法：
 *   bun scripts/cli.ts evaluate <username> [--insights]   # 采集 + 评分 + 红牌检测
 *   bun scripts/cli.ts score <json>                       # 仅评分（读 JSON 输入）
 *
 * 生产环境（GitHub Actions）通过 GITHUB_TOKEN 环境变量注入令牌。
 * HEXASCOPE_API_BASE 环境变量可覆盖 GitHub API 基础地址（测试/自托管场景）。
 * `--insights` 额外调用 LLM 生成定性解读（分数不变，见 scripts/insights.ts）。
 */

import { collectEvaluationInput } from './collector.ts';
import { generateInsights } from './insights.ts';
import { calculateDimensions, calculateOverallScore } from './scoreCalculator.ts';
import { detectRedFlags } from './redflagDetector.ts';
import type { CliWriteStream, EvaluationInput, EvaluationReport, ReportCoverage } from './types.ts';

/** 自我评估免责声明（隐私边界要求）。 */
export const DISCLAIMER =
  '本报告基于 GitHub 公开数据自动生成，仅供参考。' +
  '自我评估存在主观偏差（戏剧化），不构成招聘、评级或任何决策依据。';

/**
 * 生成评估报告（纯函数，便于测试）。
 *
 * 分数与红牌完全由确定性算法产出；`insights` 由调用方在需要时注入。
 * @param input 采集输入
 * @param generatedAt 生成时间（ISO 8601）
 * @returns 完整报告
 */
export function buildReport(
  input: EvaluationInput,
  generatedAt = new Date().toISOString(),
): EvaluationReport {
  const dimensions = calculateDimensions(input);
  const redFlags = detectRedFlags(input);
  const coverage = buildCoverage(input, dimensions);
  return {
    username: input.username,
    generatedAt,
    dimensions,
    redFlags,
    overallScore: calculateOverallScore(dimensions),
    disclaimer: DISCLAIMER,
    coverage,
  };
}

/**
 * 汇总数据覆盖度说明，让读者明确知道"哪些分数有数据支撑"。
 * @param input 采集输入
 * @param dimensions 六维得分
 * @returns 覆盖度摘要
 */
export function buildCoverage(
  input: EvaluationInput,
  dimensions: { available?: boolean }[],
): ReportCoverage {
  const availableDimensions = dimensions.filter((dim) => dim.available !== false).length;
  const notes: string[] = [];
  const scanned = input.repos.filter((repo) => repo.signalsCollected === true).length;

  if (scanned > 0) {
    notes.push(`已扫描 ${scanned}/${input.repos.length} 个原创仓库的文件结构与 README`);
  } else {
    notes.push('未能读取仓库文件结构（GitHub API 配额或权限限制），结构类维度不计分');
  }

  if (input.activity.activityCollected === true) {
    const commits = input.activity.commitSamples?.length ?? 0;
    notes.push(
      `已采集活动样本：PR ${input.activity.prSampleSize ?? 0} 条、Issue ${input.activity.issueSampleSize ?? 0} 条、代表性提交 ${commits} 条`,
    );
  } else {
    notes.push('未能采集活动样本（提交/PR/Issue），问题排查与沟通协作维度不计分');
  }

  notes.push('未采集数据不会被记为 0 分，也不会稀释其他维度的表现。');

  return { availableDimensions, totalDimensions: dimensions.length, notes };
}

/**
 * 从 GitHub API 采集用户数据并构造评估输入（保留旧签名以兼容调用方）。
 * @param username GitHub 用户名
 * @param token GitHub Token（可选，公开数据可不传）
 * @param baseUrl GitHub API 基础地址（测试时可指向本地 mock 服务器）
 * @returns 评估输入
 */
export async function fetchEvaluationInput(
  username: string,
  token?: string,
  baseUrl = 'https://api.github.com',
): Promise<EvaluationInput> {
  return collectEvaluationInput(username, {
    ...(token ? { token } : {}),
    baseUrl,
  });
}

/** CLI 依赖注入项。 */
export interface CliDeps {
  /** 标准输出流。 */
  stdout?: CliWriteStream;
  /** 标准错误流。 */
  stderr?: CliWriteStream;
  /** 数据采集函数。 */
  fetchInput?: typeof fetchEvaluationInput;
  /** 解读层生成函数。 */
  generateInsightsFn?: typeof generateInsights;
  /** 环境变量表。 */
  env?: Record<string, string | undefined>;
}

/** 用法提示。 */
export const USAGE =
  '用法: bun scripts/cli.ts evaluate <username> [--insights] | bun scripts/cli.ts score <json>\n';

/**
 * CLI 入口。
 *
 * stdout/stderr/fetchInput 可注入（便于测试进程内直接驱动，覆盖率统计生效）。
 * @param argv 命令行参数（默认 process.argv.slice(2)）
 * @param deps 依赖注入
 * @returns 进程退出码（0 成功，1 用法错误）
 */
export async function main(
  argv: string[] = process.argv.slice(2),
  deps: CliDeps = {},
): Promise<number> {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  const fetchInput = deps.fetchInput ?? fetchEvaluationInput;
  const insightsFn = deps.generateInsightsFn ?? generateInsights;
  const env = deps.env ?? process.env;
  const [command, ...rest] = argv;
  const withInsights = rest.includes('--insights');
  const arg = rest.find((item) => !item.startsWith('--'));

  if (command === 'evaluate' && arg) {
    const token = env['GITHUB_TOKEN'];
    const baseUrl = env['HEXASCOPE_API_BASE'];
    const input = await fetchInput(arg, token, baseUrl);
    const report = buildReport(input);

    if (withInsights) {
      const insights = await insightsFn(report, input, { env });
      if (insights) {
        report.insights = insights;
      }
    }

    stdout.write(JSON.stringify(report, null, 2) + '\n');
    return 0;
  }

  if (command === 'score' && arg) {
    const input = JSON.parse(arg) as EvaluationInput;
    const report = buildReport(input);
    stdout.write(JSON.stringify(report, null, 2) + '\n');
    return 0;
  }

  stderr.write(USAGE);
  return 1;
}

// 仅在直接执行时运行（被 import 时不触发）
if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file://').href) {
  const code = await main();
  if (code !== 0) {
    process.exitCode = code;
  }
}

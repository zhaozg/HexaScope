/**
 * HexaScope LLM 智能解读层。
 *
 * 设计约束（务必遵守，见 AGENTS.md §2）：
 *  1. **不参与打分**——分数与红牌始终来自确定性算法；
 *  2. **输入受限**——只把确定性算法产出的结构化事实交给模型，模型不得自行臆测数据；
 *  3. **可复现**——请求 `temperature=0`，并按"证据指纹"缓存：输入不变则结果复用，重跑同分同文；
 *  4. **优雅降级**——未配置 Key、限流、超时、响应不合法时静默跳过，报告照常生成；
 *  5. **无外部依赖**——仅用 `fetch`，密钥只从环境变量读取，绝不硬编码、绝不打印。
 *
 * 兼容任意 OpenAI Chat Completions 兼容端点（OpenRouter / DeepSeek / 自建网关）。
 */

import { createHash } from 'node:crypto';
import type { EvaluationInput, EvaluationReport, InsightItem, ReportInsights } from './types.ts';

/** 默认端点：OpenRouter（提供免费模型池）。 */
export const DEFAULT_LLM_BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';
/** 默认模型：OpenRouter 免费池中响应稳定的通用模型。 */
export const DEFAULT_LLM_MODEL = 'nvidia/nemotron-3-super-120b-a12b:free';
/**
 * 免费模型回退链（实测可用性排序）。
 *
 * 免费池常出现"HTTP 200 但 body 为上游 502"或限流，因此按序重试，
 * 任一成功即返回；全部失败则跳过解读层（不影响评分）。
 */
export const DEFAULT_LLM_MODELS = [
  DEFAULT_LLM_MODEL,
  'cohere/north-mini-code:free',
  'google/gemma-4-31b-it:free',
];
/** 默认超时（毫秒）：免费池较慢，但必须可控以免拖垮 Actions。 */
export const DEFAULT_LLM_TIMEOUT_MS = 45000;
/** 单次解读的最大输出 token（部分模型会先输出思考过程，需留足空间）。 */
export const MAX_INSIGHT_TOKENS = 3200;
/** 解读不改变分数的声明。 */
export const INSIGHT_ADVISORY =
  '以上解读由大模型基于本报告的确定性数据生成，仅用于可读性增强，不参与也不改变任何评分与红牌判定。';

/** LLM 运行配置。 */
export interface LlmConfig {
  /** Chat Completions 兼容端点。 */
  baseUrl: string;
  /** 首选模型（等于 models[0]，保留以便展示）。 */
  model: string;
  /** 按序尝试的模型列表。 */
  models: string[];
  /** API Key（仅内存持有）。 */
  apiKey: string;
  /** 是否使用 OpenRouter 专属排序头。 */
  isOpenRouter: boolean;
}

/** 读取环境变量（大小写键名均可注入，便于测试）。 */
type EnvLike = Record<string, string | undefined>;

/**
 * 从环境变量解析 LLM 配置。
 *
 * 优先级：`HEXASCOPE_LLM_*` > `OPENROUTER_API_KEY` > `DEEPSEEK_API_KEY`。
 * 未找到任何 Key 时返回 `null`（调用方应跳过解读层）。
 * @param env 环境变量表（默认 process.env）
 * @returns 配置对象或 null
 */
export function resolveLlmConfig(env: EnvLike = process.env): LlmConfig | null {
  const explicitKey = env['HEXASCOPE_LLM_API_KEY'];
  const openRouterKey = env['OPENROUTER_API_KEY'];
  const deepSeekKey = env['DEEPSEEK_API_KEY'];
  const apiKey = explicitKey || openRouterKey || deepSeekKey || '';
  if (!apiKey) {
    return null;
  }

  const usingOpenRouter = !explicitKey && Boolean(openRouterKey);
  const defaultBase = usingOpenRouter || explicitKey
    ? DEFAULT_LLM_BASE_URL
    : 'https://api.deepseek.com/chat/completions';
  const baseUrl = env['HEXASCOPE_LLM_BASE_URL'] || defaultBase;
  const explicitModel = env['HEXASCOPE_LLM_MODEL'];
  const models = explicitModel
    ? [explicitModel]
    : usingOpenRouter || explicitKey
      ? DEFAULT_LLM_MODELS
      : ['deepseek-chat'];

  return {
    baseUrl,
    model: models[0] ?? DEFAULT_LLM_MODEL,
    models,
    apiKey,
    isOpenRouter: baseUrl.includes('openrouter.ai'),
  };
}

/**
 * 构建证据文本（确定性）。
 *
 * 只包含算法已产出的事实：维度得分与证据、红牌状态、语言与关键统计。
 * 该文本同时用于生成指纹与提示词，保证"同证据 → 同指纹 → 同解读"。
 * @param report 确定性报告
 * @param input 采集输入（用于补充语言、活动原始值）
 * @returns 紧凑的证据 JSON 字符串
 */
export function buildEvidence(report: EvaluationReport, input: EvaluationInput): string {
  const topRepos = input.repos
    .filter((repo) => !repo.isFork)
    .sort((a, b) => b.stars - a.stars)
    .slice(0, 5)
    .map((repo) => ({
      name: repo.name,
      stars: repo.stars,
      languages: repo.languages,
      sourceFiles: repo.sourceFileCount ?? 0,
      testFiles: repo.testFileCount ?? 0,
      readme: Math.round(repo.readmeScore),
      modularity: Math.round(repo.modularityScore),
    }));

  const evidence = {
    username: report.username,
    overall: Number(report.overallScore.toFixed(2)),
    dimensions: report.dimensions.map((dim) => ({
      key: dim.key,
      name: dim.name,
      score: Number(dim.score.toFixed(1)),
      weight: dim.weight,
      available: dim.available !== false,
      evidence: dim.evidence ?? [],
    })),
    redFlags: report.redFlags.filter((flag) => flag.detected).map((flag) => ({
      id: flag.id,
      name: flag.name,
      detail: flag.detail,
    })),
    activity: {
      commitSamples: input.activity.commitSamples ?? [],
      conventionalCommitRatio: input.activity.conventionalCommitRatio ?? null,
      avgIssueResponseHours: input.activity.avgIssueResponseHours,
      prMergeRate: input.activity.prMergeRate,
      reviewCommentCount: input.activity.reviewCommentCount,
      uniqueCollaborators: input.activity.uniqueCollaborators,
      bugfixPrCount: input.activity.bugfixPrCount,
    },
    topRepos,
    coverage: report.coverage ?? null,
  };

  return JSON.stringify(evidence);
}

/**
 * 计算证据指纹（SHA-256，确定性缓存键）。
 * @param evidence 证据 JSON 字符串
 * @returns 十六进制指纹
 */
export function hashEvidence(evidence: string): string {
  return createHash('sha256').update(evidence).digest('hex');
}

/**
 * 构建提示词。
 * @param evidence 证据 JSON
 * @returns system / user 消息体
 */
export function buildPrompt(evidence: string): { system: string; user: string } {
  return {
    system:
      '你是资深工程师画像分析助手。只依据用户提供的 JSON 证据撰写中文解读，'
      + '严禁编造证据中不存在的数字、仓库或事实；证据未覆盖的维度不要评价。'
      + '直接输出单个 JSON 对象：不要输出思考过程、不要 Markdown 代码围栏、不要任何额外文字。'
      + 'JSON 结构：{"summary": string, "strengths": [{"title": string, "detail": string, "evidence": string}],'
      + ' "improvements": [{"title": string, "detail": string, "evidence": string}],'
      + ' "redFlagNotes": [{"id": number, "note": string}]}。'
      + 'strengths 与 improvements 各 2-3 条，每条 detail 不超过 80 字，evidence 必须引用 JSON 中的原始数字或字段。'      + '整个回复控制在 800 字以内，禁止重复或复述题目。',
    user: `以下是该开发者 GitHub 公开数据的确定性评估结果，请生成解读：\n${evidence}`,
  };
}

/**
 * 从模型返回文本中提取候选 JSON 对象。
 *
 * 采用括号平衡扫描，兼容：Markdown 围栏、前后夹带说明文字、
 * 以及推理模型把思考过程（含花括号）与最终 JSON 混排的情况。
 * @param text 模型输出
 * @returns 可解析的对象列表（按出现顺序）
 */
export function extractJsonObjects(text: string): Record<string, unknown>[] {
  const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/, '');
  const candidates: Record<string, unknown>[] = [];

  for (let start = cleaned.indexOf('{'); start !== -1; start = cleaned.indexOf('{', start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < cleaned.length; i += 1) {
      const ch = cleaned[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) {
        continue;
      }
      if (ch === '{') {
        depth += 1;
      } else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          try {
            const parsed = JSON.parse(cleaned.slice(start, i + 1)) as unknown;
            if (typeof parsed === 'object' && parsed !== null) {
              candidates.push(parsed as Record<string, unknown>);
            }
          } catch {
            // 该片段不是合法 JSON，继续扫描下一个起点
          }
          break;
        }
      }
    }
  }

  return candidates;
}

/**
 * 从候选对象中挑选"信息量最大的一份解读"。
 *
 * 推理模型常先输出草稿、再输出最终答案，也可能因长度上限被截断，
 * 因此逐个候选归一化后按内容丰富度打分，取最完整的一份（同分时取更靠后的）。
 * @param candidates 候选对象列表
 * @returns 最佳候选；无可用候选时返回 null
 */
function pickInsightObject(candidates: Record<string, unknown>[]): Record<string, unknown> | null {
  let best: Record<string, unknown> | null = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const summary = typeof candidate['summary'] === 'string' ? candidate['summary'] : '';
    const strengths = Array.isArray(candidate['strengths']) ? candidate['strengths'].length : 0;
    const improvements = Array.isArray(candidate['improvements'])
      ? candidate['improvements'].length
      : 0;
    const score = (summary ? 3 : 0) + Math.min(strengths, 4) + Math.min(improvements, 4);
    // 取 >= 而非 > ：同分时保留更靠后的候选（模型最终答案通常在草稿之后）
    if (score >= bestScore && score > 0) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

/** 安全取字符串。 */
function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

/** 规范化洞察条目（丢弃空条目，限制条数与长度）。 */
function toItems(value: unknown, limit = 4): InsightItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((raw): InsightItem | null => {
      if (typeof raw !== 'object' || raw === null) return null;
      const record = raw as Record<string, unknown>;
      const title = asString(record['title']);
      const detail = asString(record['detail']);
      if (!title && !detail) return null;
      return {
        title: title.slice(0, 60) || detail.slice(0, 30),
        detail: detail.slice(0, 200),
        evidence: asString(record['evidence']).slice(0, 160),
      };
    })
    .filter((item): item is InsightItem => item !== null)
    .slice(0, limit);
}

/**
 * 解析模型响应为结构化解读。
 * @param text 模型输出文本
 * @param model 模型标识
 * @param evidenceHash 证据指纹
 * @param generatedAt 生成时间（ISO 8601）
 * @returns 解读对象；无法解析时返回 null
 */
export function parseInsightsResponse(
  text: string,
  model: string,
  evidenceHash: string,
  generatedAt: string,
): ReportInsights | null {
  const record = pickInsightObject(extractJsonObjects(text));
  if (!record) {
    return null;
  }
  const summary = asString(record['summary']).slice(0, 600);
  const strengths = toItems(record['strengths']);
  const improvements = toItems(record['improvements']);
  if (!summary && strengths.length === 0 && improvements.length === 0) {
    return null;
  }

  const rawNotes = Array.isArray(record['redFlagNotes']) ? record['redFlagNotes'] : [];
  const redFlagNotes = rawNotes
    .map((raw) => {
      if (typeof raw !== 'object' || raw === null) return null;
      const note = raw as Record<string, unknown>;
      const id = Number(note['id']);
      const text = asString(note['note']);
      if (!Number.isFinite(id) || !text) return null;
      return { id, note: text.slice(0, 200) };
    })
    .filter((note): note is { id: number; note: string } => note !== null)
    .slice(0, 5);

  return {
    evidenceHash,
    model,
    generatedAt,
    summary,
    strengths,
    improvements,
    ...(redFlagNotes.length > 0 ? { redFlagNotes } : {}),
    advisory: INSIGHT_ADVISORY,
  };
}

/** 生成解读的选项（便于测试注入）。 */
export interface GenerateInsightsOptions {
  /** 环境变量表。 */
  env?: EnvLike;
  /** 自定义 fetch（测试注入 mock）。 */
  fetchImpl?: typeof fetch;
  /** 生成时间提供者。 */
  now?: () => string;
  /** 超时毫秒数。 */
  timeoutMs?: number;
  /** 上一版报告中的解读（指纹一致时复用，避免重复计费与结果抖动）。 */
  previous?: ReportInsights | undefined;
}

/**
 * 生成 LLM 解读（失败时返回 undefined，绝不抛错）。
 * @param report 确定性报告
 * @param input 采集输入
 * @param options 注入项
 * @returns 解读对象或 undefined
 */
export async function generateInsights(
  report: EvaluationReport,
  input: EvaluationInput,
  options: GenerateInsightsOptions = {},
): Promise<ReportInsights | undefined> {
  const env = options.env ?? process.env;
  const now = options.now ?? (() => new Date().toISOString());
  const config = resolveLlmConfig(env);
  if (!config) {
    return undefined;
  }

  const evidence = buildEvidence(report, input);
  const evidenceHash = hashEvidence(evidence);

  if (options.previous && options.previous.evidenceHash === evidenceHash) {
    return options.previous;
  }

  const doFetch = options.fetchImpl ?? fetch;
  const prompt = buildPrompt(evidence);

  // 按序尝试回退链；任一模型产出合法解读即返回
  for (const model of config.models) {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      };
      if (config.isOpenRouter) {
        headers['HTTP-Referer'] = 'https://github.com/zhaozg/HexaScope';
        headers['X-Title'] = 'HexaScope';
      }

      const response = await doFetch(config.baseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: MAX_INSIGHT_TOKENS,
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
          ],
        }),
        signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_LLM_TIMEOUT_MS),
      });

      if (!response.ok) {
        continue;
      }

      const payload = (await response.json()) as {
        choices?: { message?: { content?: string | null } }[];
      };
      const content = payload.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.trim().length === 0) {
        continue;
      }

      const parsed = parseInsightsResponse(content, model, evidenceHash, now());
      if (parsed) {
        return parsed;
      }
    } catch {
      // 网络失败 / 限流 / 超时 / JSON 异常：换下一个模型；全部失败则跳过解读层
    }
  }

  return undefined;
}

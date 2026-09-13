/**
 * LLM 智能解读层单元测试。
 *
 * 全部使用注入的 mock fetch，严禁真实网络调用。
 * @see scripts/insights.ts
 */

import { describe, expect, it } from 'bun:test';
import {
  DEFAULT_LLM_MODEL,
  DEFAULT_LLM_MODELS,
  INSIGHT_ADVISORY,
  buildEvidence,
  buildPrompt,
  extractJsonObjects,
  generateInsights,
  hashEvidence,
  parseInsightsResponse,
  resolveLlmConfig,
} from '../scripts/insights.ts';
import { buildReport } from '../scripts/cli.ts';
import type { EvaluationInput, RepoInfo } from '../scripts/types.ts';

function makeRepo(overrides: Partial<RepoInfo> = {}): RepoInfo {
  return {
    name: 'demo',
    stars: 10,
    isFork: false,
    isEmpty: false,
    hasArchitectureMd: true,
    hasDesignDoc: false,
    hasTestDirectory: true,
    hasCiConfig: true,
    hasDockerfile: false,
    hasDockerCompose: false,
    hasKubernetesManifest: false,
    hasPreCommitHooks: false,
    hasDependencyBot: false,
    hasReleaseWorkflow: false,
    hasCodeqlOrSecurityScan: false,
    complexityMetric: 50,
    modularityScore: 40,
    automationDepth: 0.3,
    languages: ['TypeScript'],
    readmeScore: 60,
    hasUseCasesDoc: true,
    hasExampleCode: true,
    hasIssuesFromRealUsers: true,
    hasForksWithCommits: false,
    signalsCollected: true,
    sourceFileCount: 20,
    testFileCount: 3,
    ...overrides,
  };
}

function makeInput(): EvaluationInput {
  return {
    username: 'alice',
    repos: [makeRepo()],
    activity: {
      avgIssueResponseHours: 6,
      bugfixPrCount: 4,
      prMergeRate: 0.8,
      avgPrDescriptionLength: 150,
      reviewCommentCount: 9,
      issueDiscussionCount: 5,
      uniqueCollaborators: 3,
      selfMergedPrRatio: 0.2,
      forkRatio: 0,
      aiCodeProbability: 0.1,
      botLikeCommitPattern: false,
      starFollowRatio: 2,
      emptyRepoRatio: 0,
      duplicateRepoRatio: 0.2,
      meaninglessCommitRatio: 0.1,
      selfResolvedIssueRatio: 0,
      contributionVariance: 2.5,
      activityCollected: true,
      conventionalCommitRatio: 0.7,
      commitSamples: ['feat(api): add endpoint'],
      prSampleSize: 5,
      issueSampleSize: 3,
    },
    coverage: { repoSignals: true, activity: true },
  };
}

/** 构造一个成功的 OpenAI 兼容响应。 */
function okResponse(content: string): Response {
  return Response.json({ choices: [{ message: { content } }] });
}

const VALID_CONTENT = JSON.stringify({
  summary: '后端工程能力扎实。',
  strengths: [{ title: '工程化', detail: 'CI 与测试齐备。', evidence: 'hasCiConfig=true' }],
  improvements: [{ title: '文档', detail: '缺少架构文档。', evidence: 'readmeScore=60' }],
  redFlagNotes: [{ id: 1, note: '自合并比例 20%，低于阈值。' }],
});

describe('resolveLlmConfig', () => {
  it('无任何 Key 时返回 null（跳过解读层）', () => {
    expect(resolveLlmConfig({})).toBeNull();
  });

  it('识别 OpenRouter Key 并使用默认模型回退链', () => {
    const config = resolveLlmConfig({ OPENROUTER_API_KEY: 'sk-test' });
    expect(config?.baseUrl).toContain('openrouter.ai');
    expect(config?.model).toBe(DEFAULT_LLM_MODEL);
    expect(config?.models).toEqual(DEFAULT_LLM_MODELS);
    expect(config?.isOpenRouter).toBe(true);
  });

  it('识别 DeepSeek Key 并切换默认端点', () => {
    const config = resolveLlmConfig({ DEEPSEEK_API_KEY: 'sk-test' });
    expect(config?.baseUrl).toContain('deepseek.com');
    expect(config?.model).toBe('deepseek-chat');
  });

  it('显式配置优先于自动推断', () => {
    const config = resolveLlmConfig({
      OPENROUTER_API_KEY: 'sk-or',
      HEXASCOPE_LLM_API_KEY: 'sk-explicit',
      HEXASCOPE_LLM_BASE_URL: 'https://gateway.internal/v1/chat/completions',
      HEXASCOPE_LLM_MODEL: 'self-hosted-model',
    });
    expect(config?.apiKey).toBe('sk-explicit');
    expect(config?.baseUrl).toBe('https://gateway.internal/v1/chat/completions');
    expect(config?.model).toBe('self-hosted-model');
    expect(config?.models).toEqual(['self-hosted-model']);
    expect(config?.isOpenRouter).toBe(false);
  });
});

describe('buildEvidence / hashEvidence', () => {
  it('证据包含维度、红牌与仓库事实', () => {
    const input = makeInput();
    const report = buildReport(input, '2026-01-01T00:00:00.000Z');
    const parsed = JSON.parse(buildEvidence(report, input)) as Record<string, unknown>;
    expect(parsed['username']).toBe('alice');
    expect(Array.isArray(parsed['dimensions'])).toBe(true);
    expect(Array.isArray(parsed['topRepos'])).toBe(true);
    expect(parsed['activity']).toBeDefined();
  });

  it('相同输入产生相同指纹（确定性）', () => {
    const input = makeInput();
    const report = buildReport(input, '2026-01-01T00:00:00.000Z');
    const first = hashEvidence(buildEvidence(report, input));
    const second = hashEvidence(buildEvidence(report, input));
    expect(first).toBe(second);
    expect(first).toHaveLength(64);
  });
});

describe('buildPrompt', () => {
  it('提示词包含禁止编造与 JSON 结构约束', () => {
    const prompt = buildPrompt('{"username":"alice"}');
    expect(prompt.system).toContain('严禁编造');
    expect(prompt.system).toContain('summary');
    expect(prompt.user).toContain('alice');
  });
});

describe('parseInsightsResponse', () => {
  it('解析标准 JSON 响应', () => {
    const insights = parseInsightsResponse(VALID_CONTENT, 'm', 'hash', '2026-01-01T00:00:00.000Z');
    expect(insights?.summary).toBe('后端工程能力扎实。');
    expect(insights?.strengths).toHaveLength(1);
    expect(insights?.improvements).toHaveLength(1);
    expect(insights?.redFlagNotes).toHaveLength(1);
    expect(insights?.advisory).toBe(INSIGHT_ADVISORY);
  });

  it('容忍 Markdown 代码围栏包裹', () => {
    const insights = parseInsightsResponse(
      '```json\n' + VALID_CONTENT + '\n```',
      'm',
      'hash',
      'now',
    );
    expect(insights?.summary).toBe('后端工程能力扎实。');
  });

  it('容忍前后夹带说明文字', () => {
    const insights = parseInsightsResponse(`解读如下：${VALID_CONTENT} 以上。`, 'm', 'hash', 'now');
    expect(insights?.summary).toBe('后端工程能力扎实。');
  });

  it('从推理模型混排的思考过程与最终 JSON 中提取答案', () => {
    const noisy = [
      'We need to output JSON with summary... Let us compute: {"draft": 1, "note": "草稿"}',
      'Evidence: 掌握 5 种语言 { 项目质量偏低 } 得分 25.5/40',
      VALID_CONTENT,
    ].join('\n');
    const insights = parseInsightsResponse(noisy, 'm', 'hash', 'now');
    expect(insights?.summary).toBe('后端工程能力扎实。');
  });

  it('extractJsonObjects 兼容字符串内的花括号与转义引号', () => {
    const objects = extractJsonObjects('前言 {"summary": "含 } 与 \\" 引号", "n": 1} 结尾');
    expect(objects).toHaveLength(1);
    expect(objects[0]?.['summary']).toBe('含 } 与 " 引号');
  });

  it('extractJsonObjects 忽略不完整的片段', () => {
    expect(extractJsonObjects('{"summary": "unterminated')).toEqual([]);
    expect(extractJsonObjects('没有 JSON')).toEqual([]);
  });

  it('存在草稿与最终答案时选取信息量更大的一份', () => {
    const draft = JSON.stringify({ summary: '草稿', strengths: [], improvements: [] });
    const final = JSON.stringify({
      summary: '最终结论',
      strengths: [{ title: 'a', detail: 'd', evidence: 'e' }],
      improvements: [{ title: 'b', detail: 'd', evidence: 'e' }],
    });
    const insights = parseInsightsResponse(`${draft}\n思考中...\n${final}`, 'm', 'hash', 'now');
    expect(insights?.summary).toBe('最终结论');
    expect(insights?.strengths).toHaveLength(1);
  });

  it('非法内容返回 null', () => {
    expect(parseInsightsResponse('抱歉，我无法完成。', 'm', 'hash', 'now')).toBeNull();
    expect(parseInsightsResponse('{}', 'm', 'hash', 'now')).toBeNull();
  });

  it('丢弃结构不合法的条目', () => {
    const content = JSON.stringify({
      summary: 's',
      strengths: ['bad', { title: 'ok', detail: 'd', evidence: 'e' }, null],
      improvements: [],
      redFlagNotes: [{ id: 'x', note: 'n' }, { id: 2, note: '有效说明' }],
    });
    const insights = parseInsightsResponse(content, 'm', 'hash', 'now');
    expect(insights?.strengths).toHaveLength(1);
    expect(insights?.redFlagNotes).toHaveLength(1);
    expect(insights?.redFlagNotes?.[0]?.id).toBe(2);
  });
});

describe('generateInsights', () => {
  const env = { OPENROUTER_API_KEY: 'sk-test' };

  it('未配置 Key 时返回 undefined（不抛错）', async () => {
    const input = makeInput();
    const report = buildReport(input);
    expect(await generateInsights(report, input, { env: {} })).toBeUndefined();
  });

  it('成功调用并返回结构化解读', async () => {
    const input = makeInput();
    const report = buildReport(input);
    let calledUrl = '';
    const insights = await generateInsights(report, input, {
      env,
      now: () => '2026-01-01T00:00:00.000Z',
      fetchImpl: (async (url: string | URL | Request) => {
        calledUrl = String(url);
        return okResponse(VALID_CONTENT);
      }) as unknown as typeof fetch,
    });
    expect(calledUrl).toContain('openrouter.ai');
    expect(insights?.summary).toBe('后端工程能力扎实。');
    expect(insights?.model).toBe(DEFAULT_LLM_MODEL);
    expect(insights?.evidenceHash).toHaveLength(64);
  });

  it('证据指纹一致时复用上一版解读（不重复调用模型）', async () => {
    const input = makeInput();
    const report = buildReport(input);
    const first = await generateInsights(report, input, {
      env,
      fetchImpl: (async () => okResponse(VALID_CONTENT)) as unknown as typeof fetch,
    });
    let calls = 0;
    const second = await generateInsights(report, input, {
      env,
      previous: first,
      fetchImpl: (async () => {
        calls += 1;
        return okResponse('{"summary":"不应被调用"}');
      }) as unknown as typeof fetch,
    });
    expect(calls).toBe(0);
    expect(second?.summary).toBe(first?.summary);
  });

  it('首个模型失败时按回退链尝试下一个模型', async () => {
    const input = makeInput();
    const report = buildReport(input);
    const tried: string[] = [];
    const insights = await generateInsights(report, input, {
      env,
      fetchImpl: (async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as { model?: string };
        tried.push(body.model ?? '');
        // 第一个模型模拟上游故障（HTTP 200 但无 choices）
        if (tried.length === 1) {
          return Response.json({ error: { message: 'upstream overloaded', code: 502 } });
        }
        return okResponse(VALID_CONTENT);
      }) as unknown as typeof fetch,
    });
    expect(tried).toHaveLength(2);
    expect(tried[0]).toBe(DEFAULT_LLM_MODELS[0] as string);
    expect(insights?.model).toBe(DEFAULT_LLM_MODELS[1] as string);
  });

  it('全部模型失败时降级为 undefined', async () => {
    const input = makeInput();
    const report = buildReport(input);
    let calls = 0;
    const insights = await generateInsights(report, input, {
      env,
      fetchImpl: (async () => {
        calls += 1;
        return Response.json({ error: { message: 'down' } });
      }) as unknown as typeof fetch,
    });
    expect(calls).toBe(DEFAULT_LLM_MODELS.length);
    expect(insights).toBeUndefined();
  });

  it('非 2xx 响应时降级为 undefined', async () => {
    const input = makeInput();
    const report = buildReport(input);
    const insights = await generateInsights(report, input, {
      env,
      fetchImpl: (async () => new Response('rate limited', { status: 429 })) as unknown as typeof fetch,
    });
    expect(insights).toBeUndefined();
  });

  it('网络异常时降级为 undefined', async () => {
    const input = makeInput();
    const report = buildReport(input);
    const insights = await generateInsights(report, input, {
      env,
      fetchImpl: (async () => {
        throw new Error('network down');
      }) as unknown as typeof fetch,
    });
    expect(insights).toBeUndefined();
  });

  it('空响应内容时降级为 undefined', async () => {
    const input = makeInput();
    const report = buildReport(input);
    const insights = await generateInsights(report, input, {
      env,
      fetchImpl: (async () => okResponse('')) as unknown as typeof fetch,
    });
    expect(insights).toBeUndefined();
  });

  it('模型返回不可解析内容时降级为 undefined', async () => {
    const input = makeInput();
    const report = buildReport(input);
    const insights = await generateInsights(report, input, {
      env,
      fetchImpl: (async () => okResponse('我无法回答。')) as unknown as typeof fetch,
    });
    expect(insights).toBeUndefined();
  });
});

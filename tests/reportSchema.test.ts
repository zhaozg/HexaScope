/**
 * 报告结构校验器单元测试（PLAN.md P0-2）。
 *
 * 重点覆盖两类能力：
 * 1. 结构层：缺字段、类型错误、越界、必填/可选区分；
 * 2. 一致性层：综合得分与评分算法重算结果一致、维度名/权重与算法一致
 *    （这正是「演示报告与评分算法脱节」的防线）。
 *
 * 另含一条端到端用例：直接校验仓库内真实的 frontend/demo-report.json，
 * 使 CI 在演示报告漂移时立即失败。
 */

import { describe, expect, it } from 'bun:test';
import {
  DIMENSION_NAMES,
  DIMENSION_WEIGHTS,
  calculateOverallScore,
} from '../scripts/scoreCalculator.ts';
import {
  DIMENSION_ORDER,
  RED_FLAG_COUNT,
  formatIssues,
  validateReport,
} from '../scripts/reportSchema.ts';
import type { DimensionScore } from '../scripts/types.ts';

/** 构造合法维度列表（得分统一 80，权重取自算法）。 */
function makeDimensions(score = 80): DimensionScore[] {
  return DIMENSION_ORDER.map((key) => ({
    key,
    name: DIMENSION_NAMES[key],
    score,
    weight: DIMENSION_WEIGHTS[key],
    available: true,
    evidence: [`${DIMENSION_NAMES[key]} 证据`],
  }));
}

/** 构造合法红牌列表（10 项，全部未触发）。 */
function makeRedFlags() {
  return Array.from({ length: RED_FLAG_COUNT }, (_, i) => ({
    id: i + 1,
    name: `红牌 #${i + 1}`,
    detected: false,
    detail: '',
  }));
}

/** 构造一份最小合法报告，可通过 overrides 注入漂移。 */
function makeReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const dimensions = (overrides.dimensions as DimensionScore[]) ?? makeDimensions();
  return {
    username: 'demo',
    generatedAt: '2026-09-13T00:00:00.000Z',
    dimensions,
    redFlags: makeRedFlags(),
    overallScore: calculateOverallScore(dimensions),
    disclaimer: '本报告仅供参考，不构成任何决策依据。',
    ...overrides,
  };
}

describe('validateReport — 结构层', () => {
  it('合法报告无问题（含 coverage 与 insights 可选字段）', () => {
    const report = makeReport({
      coverage: {
        availableDimensions: 6,
        totalDimensions: 6,
        notes: ['已扫描 3/3 个原创仓库'],
      },
      insights: {
        evidenceHash: 'abc123',
        model: 'demo-model',
        generatedAt: '2026-09-13T03:43:31.526Z',
        summary: '总体综述',
        strengths: [{ title: '优势', detail: '细节', evidence: '依据' }],
        improvements: [{ title: '短板', detail: '细节', evidence: '依据' }],
        redFlagNotes: [{ id: 1, note: '说明' }],
        advisory: '不改变任何评分。',
      },
    });
    expect(validateReport(report)).toEqual([]);
  });

  it('非对象根节点只报一条根错误', () => {
    expect(validateReport(null)).toEqual([{ path: '$', message: '报告根节点必须是 JSON 对象' }]);
    expect(validateReport([])).toEqual([{ path: '$', message: '报告根节点必须是 JSON 对象' }]);
  });

  it('缺少必填字段时报出对应路径', () => {
    const report = makeReport();
    delete report.username;
    delete report.disclaimer;
    const paths = validateReport(report).map((issue) => issue.path);
    expect(paths).toContain('$.username');
    expect(paths).toContain('$.disclaimer');
  });

  it('generatedAt 必须是可解析的 ISO 时间字符串', () => {
    const issues = validateReport(makeReport({ generatedAt: '不是时间' }));
    expect(issues.map((i) => i.path)).toContain('$.generatedAt');
  });

  it('维度数量不符时给出明确提示', () => {
    const issues = validateReport(makeReport({ dimensions: makeDimensions().slice(0, 5) }));
    expect(issues[0].path).toBe('dimensions');
    expect(issues[0].message).toContain('必须包含 6 个维度');
  });

  it('维度得分越界会报错', () => {
    const dimensions = makeDimensions();
    dimensions[0].score = 120;
    dimensions[1].score = -1;
    const paths = validateReport(makeReport({ dimensions })).map((i) => i.path);
    expect(paths).toContain('dimensions[0].score');
    expect(paths).toContain('dimensions[1].score');
  });

  it('维度顺序错乱会报错（雷达图轴序依赖该顺序）', () => {
    const dimensions = makeDimensions();
    [dimensions[0], dimensions[1]] = [dimensions[1], dimensions[0]];
    const issues = validateReport(makeReport({ dimensions }));
    expect(issues.some((i) => i.path === 'dimensions[0].key' && i.message.includes('顺序'))).toBe(
      true,
    );
  });

  it('维度键名重复会报错', () => {
    const dimensions = makeDimensions();
    dimensions[3].key = dimensions[0].key;
    const issues = validateReport(makeReport({ dimensions }));
    expect(issues.some((i) => i.message.includes('维度键名重复'))).toBe(true);
  });

  it('红牌数量不足、编号重复、触发却无详情都会报错', () => {
    const missing = validateReport(makeReport({ redFlags: makeRedFlags().slice(0, 9) }));
    expect(missing[0].path).toBe('redFlags');
    expect(missing[0].message).toContain('必须包含 10 项红牌');

    const duplicated = makeRedFlags();
    duplicated[5].id = 1;
    expect(
      validateReport(makeReport({ redFlags: duplicated })).some((i) =>
        i.message.includes('红牌编号重复'),
      ),
    ).toBe(true);

    const triggered = makeRedFlags();
    triggered[0].detected = true;
    expect(
      validateReport(makeReport({ redFlags: triggered })).some(
        (i) => i.path === 'redFlags[0].detail' && i.message.includes('必须给出 detail'),
      ),
    ).toBe(true);
  });

  it('可选字段缺失不报错，但出现时类型必须正确', () => {
    const base = makeReport();
    expect(validateReport(base)).toEqual([]);

    const badCoverage = validateReport(makeReport({ coverage: { notes: [1, 2] } }));
    expect(badCoverage.map((i) => i.path)).toContain('coverage.notes[0]');
    expect(badCoverage.map((i) => i.path)).toContain('coverage.availableDimensions');

    const badInsights = validateReport(makeReport({ insights: { summary: 'ok' } }));
    const paths = badInsights.map((i) => i.path);
    expect(paths).toContain('insights.evidenceHash');
    expect(paths).toContain('insights.advisory');
    expect(paths).toContain('insights.generatedAt');
  });

  it('解读条目缺少 evidence 会报错', () => {
    const issues = validateReport(
      makeReport({
        insights: {
          evidenceHash: 'h',
          model: 'm',
          generatedAt: '2026-09-13T00:00:00.000Z',
          summary: 's',
          advisory: 'a',
          strengths: [{ title: 't', detail: 'd' }],
        },
      }),
    );
    expect(issues.map((i) => i.path)).toContain('insights.strengths[0].evidence');
  });

  it('一次性报出全部问题，而非只报第一个', () => {
    const report = makeReport();
    delete report.username;
    delete report.disclaimer;
    report.overallScore = 12;
    expect(validateReport(report).length).toBeGreaterThanOrEqual(3);
  });
});

describe('validateReport — 与评分算法的一致性', () => {
  it('维度中文名与 scoreCalculator.DIMENSION_NAMES 不一致时报错', () => {
    const dimensions = makeDimensions();
    dimensions[2].name = '调试能力';
    const issues = validateReport(makeReport({ dimensions }));
    expect(
      issues.some((i) => i.path === 'dimensions[2].name' && i.message.includes('问题排查')),
    ).toBe(true);
  });

  it('维度权重与算法不一致时报错', () => {
    const dimensions = makeDimensions();
    dimensions[0].weight = 0.5;
    const issues = validateReport(makeReport({ dimensions }));
    expect(issues.some((i) => i.path === 'dimensions[0].weight')).toBe(true);
  });

  it('综合得分与按维度重算结果不一致时报错（算法已变更但报告未同步）', () => {
    const issues = validateReport(makeReport({ overallScore: 60 }));
    expect(
      issues.some((i) => i.path === '$.overallScore' && i.message.includes('评分算法已变更')),
    ).toBe(true);
  });

  it('综合得分仅在 available 维度上归一化（与算法语义一致）', () => {
    const dimensions = makeDimensions();
    dimensions[5].available = false;
    dimensions[5].score = 0;
    const report = makeReport({
      dimensions,
      overallScore: calculateOverallScore(dimensions),
      coverage: { availableDimensions: 5, totalDimensions: 6, notes: [] },
    });
    expect(validateReport(report)).toEqual([]);
  });

  it('coverage 计数与 dimensions 自洽性', () => {
    const dimensions = makeDimensions();
    dimensions[0].available = false;
    const issues = validateReport(
      makeReport({
        dimensions,
        coverage: { availableDimensions: 6, totalDimensions: 5, notes: [] },
      }),
    );
    const paths = issues.map((i) => i.path);
    expect(paths).toContain('coverage.totalDimensions');
    expect(paths).toContain('coverage.availableDimensions');
  });
});

describe('formatIssues', () => {
  it('输出包含字段路径，便于快速定位', () => {
    const text = formatIssues([{ path: 'dimensions[0].weight', message: '权重应为 0.25' }]);
    expect(text).toContain('dimensions[0].weight');
    expect(text).toContain('权重应为 0.25');
  });

  it('无问题时不输出内容', () => {
    expect(formatIssues([])).toBe('');
  });
});

describe('内置演示报告', () => {
  it('frontend/demo-report.json 与当前 schema 及评分算法一致', async () => {
    const report = JSON.parse(await Bun.file('frontend/demo-report.json').text());
    const issues = validateReport(report);
    expect(formatIssues(issues)).toBe('');
  });
});

/**
 * 评估报告结构校验（零第三方依赖）。
 *
 * 用途（PLAN.md P0-2）：`frontend/demo-report.json` 是站点内置的演示数据，
 * 若评分算法或报告结构变更而该文件未同步，演示报告会展示旧结构
 * （缺字段、维度名不符、综合得分与算法脱节）。CI 必须能拦下这种漂移。
 *
 * 设计原则：
 * - **确定性**：纯函数，同一输入必然产出同一问题列表，不含随机与时间因素；
 * - **全量收集**：一次性报出全部问题（而非首个），便于快速定位不匹配字段；
 * - **单一事实来源**：维度键名/中文名/权重直接复用 scoreCalculator.ts，
 *   综合得分用同一算法重算比对，因此能捕获「算法改了、报告没更新」的脱节。
 *
 * 校验分两层：
 * 1. 结构层：字段存在性、类型、取值范围、必填/可选；
 * 2. 一致性层：综合得分与维度加权结果一致、覆盖度计数自洽、维度顺序与权重正确。
 */

import { DIMENSION_NAMES, DIMENSION_WEIGHTS, calculateOverallScore } from './scoreCalculator.ts';
import type { DimensionScore } from './types.ts';

/** 单条校验问题（`path` 为 JSON 路径，便于直接定位字段）。 */
export interface SchemaIssue {
  /** 出错字段的 JSON 路径，如 `dimensions[2].weight`。 */
  path: string;
  /** 人类可读的问题说明。 */
  message: string;
}

/** 红牌总数（DESIGN.md：内置 10 项红牌指标）。 */
export const RED_FLAG_COUNT = 10;

/** 综合得分重算比对的容差（浮点累加顺序差异）。 */
const SCORE_TOLERANCE = 1e-6;

/** 维度顺序（报告与雷达图按此顺序展示）。 */
export const DIMENSION_ORDER: string[] = Object.keys(DIMENSION_NAMES);

/* ------------------------------------------------------------------ *
 * 基础断言助手：命中即记录问题并返回 false，调用方可据此决定是否继续深入
 * ------------------------------------------------------------------ */

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== '';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isIsoDateString = (value: unknown): boolean =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value));

/** 数值是否落在 [min, max] 闭区间。 */
const inRange = (value: number, min: number, max: number): boolean => value >= min && value <= max;

/** 校验必填字符串。 */
function requireString(
  issues: SchemaIssue[],
  obj: Record<string, unknown>,
  key: string,
  path: string,
): void {
  if (!isNonEmptyString(obj[key])) {
    issues.push({ path: `${path}.${key}`, message: '必须是非空字符串' });
  }
}

/** 校验必填布尔值。 */
function requireBoolean(
  issues: SchemaIssue[],
  obj: Record<string, unknown>,
  key: string,
  path: string,
): void {
  if (typeof obj[key] !== 'boolean') {
    issues.push({ path: `${path}.${key}`, message: '必须是布尔值' });
  }
}

/** 校验必填数值并限定范围。 */
function requireNumberInRange(
  issues: SchemaIssue[],
  obj: Record<string, unknown>,
  key: string,
  path: string,
  min: number,
  max: number,
): void {
  const value = obj[key];
  if (!isFiniteNumber(value)) {
    issues.push({ path: `${path}.${key}`, message: '必须是有限数值' });
  } else if (!inRange(value, min, max)) {
    issues.push({
      path: `${path}.${key}`,
      message: `必须在 ${min} 到 ${max} 之间，实际为 ${value}`,
    });
  }
}

/** 校验字符串数组（含元素类型）。 */
function requireStringArray(
  issues: SchemaIssue[],
  obj: Record<string, unknown>,
  key: string,
  path: string,
): void {
  const value = obj[key];
  if (!Array.isArray(value)) {
    issues.push({ path: `${path}.${key}`, message: '必须是数组' });
    return;
  }
  value.forEach((item, index) => {
    if (typeof item !== 'string') {
      issues.push({ path: `${path}.${key}[${index}]`, message: '必须是字符串' });
    }
  });
}

/* ------------------------------------------------------------------ *
 * 各区块校验
 * ------------------------------------------------------------------ */

/** 校验 dimensions：数量、顺序、键名、中文名、权重、得分与证据。 */
function validateDimensions(issues: SchemaIssue[], report: Record<string, unknown>): void {
  const { dimensions } = report;
  if (!Array.isArray(dimensions)) {
    issues.push({ path: 'dimensions', message: '必须是数组' });
    return;
  }

  if (dimensions.length !== DIMENSION_ORDER.length) {
    issues.push({
      path: 'dimensions',
      message: `必须包含 ${DIMENSION_ORDER.length} 个维度，实际为 ${dimensions.length}`,
    });
    return;
  }

  const seen = new Set<string>();
  dimensions.forEach((item, index) => {
    const path = `dimensions[${index}]`;
    if (!isPlainObject(item)) {
      issues.push({ path, message: '必须是对象' });
      return;
    }

    const expectedKey = DIMENSION_ORDER[index];
    if (item.key !== expectedKey) {
      issues.push({
        path: `${path}.key`,
        message: `维度顺序必须与 scoreCalculator.DIMENSION_NAMES 一致，此处应为 "${expectedKey}"，实际为 "${String(item.key)}"`,
      });
    }
    if (typeof item.key === 'string') {
      if (seen.has(item.key)) {
        issues.push({ path: `${path}.key`, message: `维度键名重复："${item.key}"` });
      }
      seen.add(item.key);
    }

    const canonicalName = DIMENSION_NAMES[expectedKey];
    if (item.name !== canonicalName) {
      issues.push({
        path: `${path}.name`,
        message: `维度中文名应为 "${canonicalName}"，实际为 "${String(item.name)}"`,
      });
    }

    requireNumberInRange(issues, item, 'score', path, 0, 100);

    const expectedWeight = DIMENSION_WEIGHTS[expectedKey];
    if (item.weight !== expectedWeight) {
      issues.push({
        path: `${path}.weight`,
        message: `权重应为 ${expectedWeight}，实际为 ${String(item.weight)}（算法权重已变更？）`,
      });
    }

    if (item.available !== undefined && typeof item.available !== 'boolean') {
      issues.push({ path: `${path}.available`, message: '必须是布尔值' });
    }

    if (item.evidence !== undefined) {
      requireStringArray(issues, item, 'evidence', path);
    }
  });
}

/** 校验 redFlags：10 项、编号 1..10 不重复、触发详情与标志位自洽。 */
function validateRedFlags(issues: SchemaIssue[], report: Record<string, unknown>): void {
  const { redFlags } = report;
  if (!Array.isArray(redFlags)) {
    issues.push({ path: 'redFlags', message: '必须是数组' });
    return;
  }

  if (redFlags.length !== RED_FLAG_COUNT) {
    issues.push({
      path: 'redFlags',
      message: `必须包含 ${RED_FLAG_COUNT} 项红牌，实际为 ${redFlags.length}`,
    });
  }

  const seen = new Set<number>();
  redFlags.forEach((item, index) => {
    const path = `redFlags[${index}]`;
    if (!isPlainObject(item)) {
      issues.push({ path, message: '必须是对象' });
      return;
    }
    if (!Number.isInteger(item.id) || !inRange(item.id as number, 1, RED_FLAG_COUNT)) {
      issues.push({ path: `${path}.id`, message: `红牌编号必须是 1-${RED_FLAG_COUNT} 的整数` });
    } else if (seen.has(item.id as number)) {
      issues.push({ path: `${path}.id`, message: `红牌编号重复：${String(item.id)}` });
    } else {
      seen.add(item.id as number);
    }
    requireString(issues, item, 'name', path);
    requireBoolean(issues, item, 'detected', path);
    if (typeof item.detail !== 'string') {
      issues.push({ path: `${path}.detail`, message: '必须是字符串（未触发时为空字符串）' });
    } else if (item.detected === true && item.detail.trim() === '') {
      issues.push({ path: `${path}.detail`, message: '已触发的红牌必须给出 detail 说明' });
    }
  });
}

/** 校验可选字段 coverage（覆盖度摘要）。 */
function validateCoverage(issues: SchemaIssue[], report: Record<string, unknown>): void {
  const { coverage } = report;
  if (coverage === undefined) return;
  if (!isPlainObject(coverage)) {
    issues.push({ path: 'coverage', message: '必须是对象' });
    return;
  }

  requireNumberInRange(issues, coverage, 'availableDimensions', 'coverage', 0, 999);
  requireNumberInRange(issues, coverage, 'totalDimensions', 'coverage', 0, 999);
  requireStringArray(issues, coverage, 'notes', 'coverage');

  const dimensions = report.dimensions;
  if (Array.isArray(dimensions) && coverage.totalDimensions !== dimensions.length) {
    issues.push({
      path: 'coverage.totalDimensions',
      message: `必须等于 dimensions 长度（${dimensions.length}），实际为 ${String(coverage.totalDimensions)}`,
    });
  }

  // 一致性：availableDimensions 应等于 available !== false 的维度数量
  if (Array.isArray(dimensions)) {
    const expected = (dimensions as unknown[]).filter(
      (dim) => isPlainObject(dim) && dim.available !== false,
    ).length;
    if (coverage.availableDimensions !== expected) {
      issues.push({
        path: 'coverage.availableDimensions',
        message: `与 dimensions 中 available 的维度数不一致（应为 ${expected}，实际为 ${String(coverage.availableDimensions)}）`,
      });
    }
  }
}

/** 校验可选的解读条目数组（title/detail/evidence 三件套）。 */
function validateInsightItems(
  issues: SchemaIssue[],
  container: Record<string, unknown>,
  key: string,
  path: string,
): void {
  const items = container[key];
  if (items === undefined) return;
  if (!Array.isArray(items)) {
    issues.push({ path: `${path}.${key}`, message: '必须是数组' });
    return;
  }
  items.forEach((item, index) => {
    const itemPath = `${path}.${key}[${index}]`;
    if (!isPlainObject(item)) {
      issues.push({ path: itemPath, message: '必须是对象' });
      return;
    }
    requireString(issues, item, 'title', itemPath);
    requireString(issues, item, 'detail', itemPath);
    requireString(issues, item, 'evidence', itemPath);
  });
}

/** 校验可选字段 insights（LLM 解读层；不参与打分，故仅做结构校验）。 */
function validateInsights(issues: SchemaIssue[], report: Record<string, unknown>): void {
  const { insights } = report;
  if (insights === undefined) return;
  if (!isPlainObject(insights)) {
    issues.push({ path: 'insights', message: '必须是对象' });
    return;
  }

  requireString(issues, insights, 'evidenceHash', 'insights');
  requireString(issues, insights, 'model', 'insights');
  requireString(issues, insights, 'summary', 'insights');
  requireString(issues, insights, 'advisory', 'insights');

  if (!isIsoDateString(insights.generatedAt)) {
    issues.push({ path: 'insights.generatedAt', message: '必须是可解析的 ISO 8601 时间字符串' });
  }

  validateInsightItems(issues, insights, 'strengths', 'insights');
  validateInsightItems(issues, insights, 'improvements', 'insights');

  const notes = insights.redFlagNotes;
  if (notes !== undefined) {
    if (!Array.isArray(notes)) {
      issues.push({ path: 'insights.redFlagNotes', message: '必须是数组' });
    } else {
      notes.forEach((note, index) => {
        const notePath = `insights.redFlagNotes[${index}]`;
        if (!isPlainObject(note)) {
          issues.push({ path: notePath, message: '必须是对象' });
          return;
        }
        if (!Number.isInteger(note.id) || !inRange(note.id as number, 1, RED_FLAG_COUNT)) {
          issues.push({
            path: `${notePath}.id`,
            message: `红牌编号必须是 1-${RED_FLAG_COUNT} 的整数`,
          });
        }
        requireString(issues, note, 'note', notePath);
      });
    }
  }
}

/* ------------------------------------------------------------------ *
 * 入口
 * ------------------------------------------------------------------ */

/**
 * 校验一份评估报告 JSON。
 *
 * @param value 已解析的 JSON 值（通常来自 `JSON.parse`）
 * @returns 全部问题列表；空数组表示校验通过
 */
export function validateReport(value: unknown): SchemaIssue[] {
  const issues: SchemaIssue[] = [];

  if (!isPlainObject(value)) {
    return [{ path: '$', message: '报告根节点必须是 JSON 对象' }];
  }
  const report = value;

  requireString(issues, report, 'username', '$');
  if (!isIsoDateString(report.generatedAt)) {
    issues.push({ path: '$.generatedAt', message: '必须是可解析的 ISO 8601 时间字符串' });
  }
  requireNumberInRange(issues, report, 'overallScore', '$', 0, 100);
  requireString(issues, report, 'disclaimer', '$');

  validateDimensions(issues, report);
  validateRedFlags(issues, report);
  validateCoverage(issues, report);
  validateInsights(issues, report);

  // 一致性层：综合得分必须与确定性算法重算结果一致（捕获「算法改了报告没更新」）
  const dimensions = report.dimensions;
  if (Array.isArray(dimensions) && isFiniteNumber(report.overallScore)) {
    const usable = dimensions.filter(
      (dim): dim is DimensionScore =>
        isPlainObject(dim) && isFiniteNumber(dim.score) && isFiniteNumber(dim.weight),
    );
    if (usable.length === dimensions.length && dimensions.length > 0) {
      const recomputed = calculateOverallScore(usable);
      if (Math.abs(recomputed - report.overallScore) > SCORE_TOLERANCE) {
        issues.push({
          path: '$.overallScore',
          message: `与按维度权重重算的结果不一致（重算值 ${recomputed}，报告值 ${report.overallScore}）：疑似评分算法已变更，演示报告未同步`,
        });
      }
    }
  }

  return issues;
}

/** 将问题列表格式化为多行文本（供 CLI 与 CI 日志输出）。 */
export function formatIssues(issues: SchemaIssue[]): string {
  return issues.map((issue) => `  ✗ ${issue.path} — ${issue.message}`).join('\n');
}

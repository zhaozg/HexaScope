/**
 * 雷达图 SVG 生成器单元测试。
 */

import { describe, expect, it } from 'vitest';
import { CANVAS_SIZE, CENTER, generateRadarSvg } from '../scripts/generateRadar.js';
import type { DimensionScore } from '../scripts/types.js';

function makeDimensions(scores: number[]): DimensionScore[] {
  const names = ['技术硬实力', '架构与设计', '问题排查', '工程化效能', '沟通协作', '业务洞察'];
  return scores.map((score, i) => ({
    key: `dim-${i}`,
    name: names[i] ?? `维度${i}`,
    score,
    weight: 1 / 6,
  }));
}

describe('generateRadarSvg', () => {
  it('生成合法 SVG 结构', () => {
    const svg = generateRadarSvg(makeDimensions([80, 70, 60, 50, 40, 30]));
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toContain(`width="${CANVAS_SIZE}"`);
    expect(svg).toContain(`height="${CANVAS_SIZE}"`);
    expect(svg).toContain('<polygon');
    expect(svg).toContain('<text');
  });

  it('维度数不足 6 时抛错', () => {
    expect(() => generateRadarSvg(makeDimensions([80, 70, 60]))).toThrow('恰好 6 个维度');
  });

  it('满分时数据多边形顶点到达最大半径，零分时顶点汇聚于中心', () => {
    const full = generateRadarSvg(makeDimensions([100, 100, 100, 100, 100, 100]));
    const low = generateRadarSvg(makeDimensions([0, 0, 0, 0, 0, 0]));
    expect(full).toContain(`x1="${CENTER}"`);
    expect(low).toContain(`${CENTER},${CENTER}`);
  });
});

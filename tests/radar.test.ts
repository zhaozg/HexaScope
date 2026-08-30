/**
 * 雷达图 Mermaid 生成器单元测试。
 */

import { describe, expect, it } from 'bun:test';
import {
  RADAR_MAX,
  RADAR_MIN,
  RADAR_TICKS,
  generateRadarMermaid,
} from '../scripts/generateRadar.ts';
import type { DimensionScore } from '../scripts/types.ts';

function makeDimensions(scores: number[]): DimensionScore[] {
  const names = ['技术硬实力', '架构与设计', '问题排查', '工程化效能', '沟通协作', '业务洞察'];
  return scores.map((score, i) => ({
    key: `dim-${i}`,
    name: names[i] ?? `维度${i}`,
    score,
    weight: 1 / 6,
  }));
}

describe('generateRadarMermaid', () => {
  it('生成合法 Mermaid radar-beta 结构（ASCII ID + 中文标签）', () => {
    const code = generateRadarMermaid(makeDimensions([80, 70, 60, 50, 40, 30]), 'alice');
    expect(code.startsWith('radar-beta')).toBe(true);
    expect(code).toContain('title "HexaScope 六维能力雷达图 - alice"');
    // 轴必须使用 ASCII ID + 引号标签（Mermaid ID 词法不接受中文）
    expect(code).toContain(
      'axis a1["技术硬实力"], a2["架构与设计"], a3["问题排查"], a4["工程化效能"], a5["沟通协作"], a6["业务洞察"]',
    );
    expect(code).toContain('curve c1["综合能力"]{80, 70, 60, 50, 40, 30}');
    expect(code).toContain(`max ${RADAR_MAX}`);
    expect(code).toContain(`min ${RADAR_MIN}`);
    expect(code).toContain(`ticks ${RADAR_TICKS}`);
    expect(code).toContain('graticule circle');
  });

  it('未提供用户名时使用默认标题', () => {
    const code = generateRadarMermaid(makeDimensions([80, 70, 60, 50, 40, 30]));
    expect(code).toContain('title "HexaScope 六维能力雷达图"');
  });

  it('维度数不足 6 时抛错', () => {
    expect(() => generateRadarMermaid(makeDimensions([80, 70, 60]))).toThrow('恰好 6 个维度');
  });

  it('得分被四舍五入到两位小数', () => {
    const code = generateRadarMermaid(
      makeDimensions([80.123, 70.456, 60, 50, 40, 30]),
      'bob',
      '实力',
    );
    expect(code).toContain('curve c1["实力"]{80.12, 70.46, 60, 50, 40, 30}');
  });
});

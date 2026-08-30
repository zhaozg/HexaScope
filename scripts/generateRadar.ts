/**
 * HexaScope 雷达图 Mermaid 生成器。
 *
 * 输出 Mermaid radar-beta 语法（https://mermaid.js.org/syntax/radar.html），
 * 由 GitHub Pages 前端通过 mermaid.js 渲染，无需自研 SVG 绘制。
 *
 * 注意：Mermaid radar 的 ID 词法不接受中文，轴名/曲线名必须使用
 * ASCII ID + ["中文标签"] 形式（已通过 @mermaid-js/parser 验证）。
 */

import type { DimensionScore } from './types.js';

/** 雷达图值域最大值（评分 0-100）。 */
export const RADAR_MAX = 100;
/** 雷达图值域最小值。 */
export const RADAR_MIN = 0;
/** 经纬网同心层数。 */
export const RADAR_TICKS = 5;

const round = (value: number): number => Math.round(value * 100) / 100;

/**
 * 生成 Mermaid radar 图表代码。
 * @param dimensions 六维得分（必须恰好 6 个）
 * @param username 被评估的 GitHub 用户名（用于标题）
 * @param seriesName 数据系列名称（默认"综合能力"）
 * @returns Mermaid radar 代码字符串
 */
export function generateRadarMermaid(
  dimensions: DimensionScore[],
  username?: string,
  seriesName = '综合能力',
): string {
  if (dimensions.length !== 6) {
    throw new Error(`雷达图需要恰好 6 个维度，当前 ${dimensions.length} 个`);
  }
  const title = username ? `HexaScope 六维能力雷达图 - ${username}` : 'HexaScope 六维能力雷达图';
  // 轴：ASCII ID + 中文标签（Mermaid ID 词法不接受中文）
  const axis = dimensions.map((d, i) => `a${i + 1}["${d.name}"]`).join(', ');
  const values = dimensions.map((d) => round(d.score)).join(', ');
  return [
    'radar-beta',
    `  title "${title}"`,
    `  axis ${axis}`,
    `  curve c1["${seriesName}"]{${values}}`,
    `  max ${RADAR_MAX}`,
    `  min ${RADAR_MIN}`,
    '  graticule circle',
    `  ticks ${RADAR_TICKS}`,
    '  showLegend false',
  ].join('\n');
}

/** CLI 入口（从 stdin 读取维度数组或报告对象，输出 Mermaid 代码）。 */
async function main(): Promise<void> {
  const input = await new Promise<string>((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
  });
  const parsed = JSON.parse(input) as
    DimensionScore[] | { dimensions?: DimensionScore[]; username?: string };
  const dimensions = Array.isArray(parsed) ? parsed : (parsed.dimensions ?? []);
  const username = !Array.isArray(parsed) ? parsed.username : undefined;
  process.stdout.write(generateRadarMermaid(dimensions, username) + '\n');
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file://').href) {
  void main();
}

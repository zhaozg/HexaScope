/**
 * HexaScope 雷达图 SVG 生成器。
 *
 * 纯字符串模板实现，无外部二进制依赖（符合"禁止动态下载外部二进制"约束）。
 * 生成六边形网格 + 数据多边形 + 维度标签。
 */

import type { DimensionScore } from './types.js';

/** 画布尺寸。 */
export const CANVAS_SIZE = 500;
/** 中心点坐标。 */
export const CENTER = CANVAS_SIZE / 2;
/** 最大半径。 */
export const MAX_RADIUS = 200;
/** 网格层数（含最外层）。 */
export const GRID_LEVELS = 5;

/** 顶点角度（从正上方开始，顺时针，弧度）。 */
function vertexAngle(index: number): number {
  return -Math.PI / 2 + (index * 2 * Math.PI) / 6;
}

/** 根据半径计算顶点坐标。 */
function point(radius: number, index: number): [number, number] {
  const angle = vertexAngle(index);
  return [CENTER + radius * Math.cos(angle), CENTER + radius * Math.sin(angle)];
}

const round = (value: number): number => Math.round(value * 100) / 100;

/** 生成网格多边形（六边形）SVG 字符串。 */
function buildGridPolygons(): string {
  const parts: string[] = [];
  for (let level = 1; level <= GRID_LEVELS; level += 1) {
    const radius = (MAX_RADIUS * level) / GRID_LEVELS;
    const pts = Array.from({ length: 6 }, (_, i) => point(radius, i).map(round).join(',')).join(
      ' ',
    );
    parts.push(`<polygon points="${pts}" fill="none" stroke="#e2e8f0" stroke-width="1" />`);
  }
  for (let i = 0; i < 6; i += 1) {
    const [x, y] = point(MAX_RADIUS, i).map(round);
    parts.push(
      `<line x1="${CENTER}" y1="${CENTER}" x2="${x}" y2="${y}" stroke="#e2e8f0" stroke-width="1" />`,
    );
  }
  return parts.join('\n  ');
}

/** 生成数据多边形 SVG 字符串。 */
function buildDataPolygon(dimensions: DimensionScore[]): string {
  const pts = dimensions
    .map((d, i) =>
      point((d.score / 100) * MAX_RADIUS, i)
        .map(round)
        .join(','),
    )
    .join(' ');
  const dots = dimensions
    .map((d, i) => {
      const [x, y] = point((d.score / 100) * MAX_RADIUS, i).map(round);
      return `<circle cx="${x}" cy="${y}" r="4" fill="#2563eb" />`;
    })
    .join('\n  ');
  return [
    `<polygon points="${pts}" fill="rgba(37, 99, 235, 0.35)" stroke="#2563eb" stroke-width="2" />`,
    dots,
  ].join('\n  ');
}

/** 生成维度标签 SVG 字符串。 */
function buildLabels(dimensions: DimensionScore[]): string {
  return dimensions
    .map((d, i) => {
      const [x, y] = point(MAX_RADIUS + 34, i).map(round);
      return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-size="13" fill="#334155" font-family="sans-serif">${d.name} ${d.score}</text>`;
    })
    .join('\n  ');
}

/**
 * 生成完整雷达图 SVG。
 * @param dimensions 六维得分（顺序决定顶点顺序，必须恰好 6 个）
 * @returns SVG 字符串
 */
export function generateRadarSvg(dimensions: DimensionScore[]): string {
  if (dimensions.length !== 6) {
    throw new Error(`雷达图需要恰好 6 个维度，当前 ${dimensions.length} 个`);
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" viewBox="0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}">`,
    `  <rect width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" fill="#ffffff" rx="12" />`,
    `  ${buildGridPolygons()}`,
    `  ${buildDataPolygon(dimensions)}`,
    `  ${buildLabels(dimensions)}`,
    `</svg>`,
  ].join('\n');
}

/** CLI 入口（从 stdin 读取维度数组或报告对象，输出 SVG）。 */
async function main(): Promise<void> {
  const input = await new Promise<string>((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
  });
  const parsed = JSON.parse(input) as DimensionScore[] | { dimensions?: DimensionScore[] };
  const dimensions = Array.isArray(parsed) ? parsed : (parsed.dimensions ?? []);
  process.stdout.write(generateRadarSvg(dimensions) + '\n');
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file://').href) {
  void main();
}

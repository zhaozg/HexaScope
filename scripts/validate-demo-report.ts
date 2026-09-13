/**
 * 演示报告结构校验 CLI（PLAN.md P0-2，CI 门禁）。
 *
 * 用法:
 *   bun run validate:demo              # 校验 frontend/demo-report.json
 *   bun scripts/validate-demo-report.ts path/to/report.json
 *
 * 退出码：0 = 通过；1 = 存在结构或一致性问题（CI 应据此失败）。
 *
 * 独立于 reportSchema.ts（纯函数）存放：本文件含文件系统与进程退出副作用，
 * 不被单元测试引用，因此不拉低覆盖率统计（与 frontend-build-cli.ts 同构）。
 */

import { validateReport, formatIssues } from './reportSchema.ts';

/** 默认校验目标：站点内置演示报告（构建时复制到 .dist/，供 ?user=demo 离线使用）。 */
const DEFAULT_REPORT_PATH = 'frontend/demo-report.json';

const target = process.argv[2] ?? DEFAULT_REPORT_PATH;

/** 读取并解析 JSON。 */
async function readJson(path: string): Promise<unknown> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`文件不存在：${path}`);
  }
  const text = await file.text();
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`JSON 解析失败（${path}）：${(err as Error).message}`);
  }
}

/** 主流程：校验并输出结论。 */
async function main(): Promise<void> {
  let value: unknown;
  try {
    value = await readJson(target);
  } catch (err) {
    console.error(`✗ ${(err as Error).message}`);
    process.exit(1);
  }

  const issues = validateReport(value);
  if (issues.length > 0) {
    console.error(`✗ ${target} 与当前报告 schema 不匹配，共 ${issues.length} 处问题：`);
    console.error(formatIssues(issues));
    console.error('\n请更新 demo-report.json 以匹配当前 schema（评分算法或结构变更后需同步）。');
    process.exit(1);
  }

  console.log(`✓ ${target} 结构校验通过`);
}

await main();

/**
 * HexaScope 前端构建 CLI 入口（Nuekit SPA → GitHub Pages 静态站点）。
 *
 * 执行流程：清理旧产物 → `nue build` → 将绝对路径资源改写为相对路径
 * （复用 frontend-build.ts 的纯函数）→ 复制内置演示报告与首页截图，
 * 适配 GitHub Pages 子路径部署，并保证 demo 演示离线可用。
 *
 * 独立于 frontend-build.ts 存放：本文件含文件系统／子进程副作用，
 * 不作为模块被单元测试引用（不影响覆盖率统计）。
 *
 * 用法: bun scripts/frontend-build-cli.ts
 */

import { $ } from 'bun';
import { copyFile, mkdir } from 'node:fs/promises';
import { rewriteIndexHtml, rewriteMountJs } from './frontend-build.ts';

const FRONTEND_DIR = './frontend';
const DIST_INDEX = `${FRONTEND_DIR}/.dist/index.html`;
const DIST_MOUNT = `${FRONTEND_DIR}/.dist/@nue/mount.js`;

/** 构建前端静态站点。 */
async function buildFrontend(): Promise<void> {
  // 1. 清理旧产物（nue build --clean 在 Bun 1.4 存在兼容问题，手动清理）
  await $`rm -rf .dist`.cwd(FRONTEND_DIR);

  // 2. Nuekit 构建
  await $`nue build`.cwd(FRONTEND_DIR);

  // 3. 绝对路径 → 相对路径（GitHub Pages 子路径部署）
  const html = await Bun.file(DIST_INDEX).text();
  await Bun.write(DIST_INDEX, rewriteIndexHtml(html));

  const mount = await Bun.file(DIST_MOUNT).text();
  await Bun.write(DIST_MOUNT, rewriteMountJs(mount));

  // 4. 内置演示报告（生产环境 demo 用户回退数据源，GitHub Pages 离线可用）
  //    Nuekit 默认会把未引用静态文件复制进 .dist（Misc files），此处显式复制确保可控
  await copyFile(`${FRONTEND_DIR}/demo-report.json`, `${FRONTEND_DIR}/.dist/demo-report.json`);

  // 5. 首页演示报告截图（静态资源，需随站点一起发布到 Pages 子路径下）
  await mkdir(`${FRONTEND_DIR}/.dist/images`, { recursive: true });
  await copyFile(
    `${FRONTEND_DIR}/images/demo-report.png`,
    `${FRONTEND_DIR}/.dist/images/demo-report.png`,
  );

  // 6. 摘要输出
  console.log('前端构建完成 → frontend/.dist/');
  console.log('资源路径已改写为相对路径（适配 GitHub Pages 子路径部署）');
}

await buildFrontend();

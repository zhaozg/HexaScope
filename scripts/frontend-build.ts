/**
 * HexaScope 前端构建脚本（Nuekit SPA → GitHub Pages 静态站点）。
 *
 * Nuekit 默认输出绝对路径资源（如 /css/base.css、/@nue/state.js），
 * 直接部署到 GitHub Pages 子路径（https://zhaozg.github.io/HexaScope/）会失效。
 * 本脚本在 `nue build` 后把产物内的绝对路径改写为相对路径，适配子路径部署。
 *
 * 用法: bun scripts/frontend-build.ts
 */

import { $ } from 'bun';

const FRONTEND_DIR = './frontend';
const DIST_INDEX = `${FRONTEND_DIR}/.dist/index.html`;

/** 构建前端静态站点。 */
async function buildFrontend(): Promise<void> {
  // 1. 清理旧产物（nue build --clean 在 Bun 1.4 存在兼容问题，手动清理）
  await $`rm -rf .dist`.cwd(FRONTEND_DIR);

  // 2. Nuekit 构建
  await $`nue build`.cwd(FRONTEND_DIR);

  // 3. 绝对路径 → 相对路径（GitHub Pages 子路径部署）
  const html = await Bun.file(DIST_INDEX).text();
  const rewritten = html
    .replaceAll('href="/css/', 'href="./css/')
    .replaceAll('src="/@nue/', 'src="./@nue/')
    .replaceAll('"/@nue/', '"./@nue/');

  await Bun.write(DIST_INDEX, rewritten);

  // 4. 摘要输出
  console.log('前端构建完成 → frontend/.dist/');
  console.log('资源路径已改写为相对路径（适配 GitHub Pages 子路径部署）');
}

await buildFrontend();

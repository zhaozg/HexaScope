/**
 * HexaScope 前端构建脚本（Nuekit SPA → GitHub Pages 静态站点）。
 *
 * Nuekit 默认输出绝对路径资源（如 /css/base.css、/@nue/state.js），
 * 直接部署到 GitHub Pages 子路径（https://zhaozg.github.io/HexaScope/）会失效。
 * 本脚本在 `nue build` 后把产物内的绝对路径改写为相对路径，适配子路径部署。
 *
 * 需要改写的产物：
 * 1. `index.html` —— `<link>/<script>` 标签的资源引用（/css/、/@nue/）；
 * 2. `@nue/mount.js` —— 运行时挂载器内部的动态 import（/@nue/nue.js、`/${n}.js`），
 *    否则浏览器会按站点根路径解析（https://zhaozg.github.io/index.html.js → 404）。
 *
 * 用法: bun scripts/frontend-build.ts
 */

import { $ } from 'bun';

const FRONTEND_DIR = './frontend';
const DIST_INDEX = `${FRONTEND_DIR}/.dist/index.html`;
const DIST_MOUNT = `${FRONTEND_DIR}/.dist/@nue/mount.js`;

/**
 * 将 index.html 中的绝对路径资源引用改写为相对路径。
 *
 * Nuekit 输出形如 `href="/css/base.css"`、`src="/@nue/mount.js"`、
 * `"@nue/state.js"`（import map）的引用，在 GitHub Pages 子路径下
 * 会被解析到站点根，必须改写为 `./` 相对路径。
 */
export function rewriteIndexHtml(html: string): string {
  return html
    .replaceAll('href="/css/', 'href="./css/')
    .replaceAll('src="/@nue/', 'src="./@nue/')
    .replaceAll('"/@nue/', '"./@nue/');
}

/**
 * 将 @nue/mount.js 内部的绝对路径动态 import 改写为相对路径。
 *
 * mount.js 部署于 `@nue/` 目录内，其动态 import 若不改写会按站点根解析：
 * - `import("/@nue/nue.js")`  → `import("./nue.js")`（同目录）
 * - `` import(`/${n}.js${i}`) `` → `` import(`../${n}.js${i}`) ``
 *   （组件库产物 index.html.js / ui/*.html.js 位于站点根，需从 @nue/ 上溯一级）
 */
export function rewriteMountJs(mountJs: string): string {
  return mountJs
    .replaceAll('"/@nue/nue.js"', '"./nue.js"')
    .replaceAll('`/${n}.js${i}`', '`../${n}.js${i}`');
}

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

  // 4. 摘要输出
  console.log('前端构建完成 → frontend/.dist/');
  console.log('资源路径已改写为相对路径（适配 GitHub Pages 子路径部署）');
}

// 仅作为 CLI 直接执行时构建；作为模块被测试 import 时不触发副作用
if (import.meta.main) {
  await buildFrontend();
}

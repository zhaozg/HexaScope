/**
 * HexaScope 前端构建纯函数（Nuekit SPA → GitHub Pages 静态站点）。
 *
 * Nuekit 默认输出绝对路径资源（如 /css/base.css、/@nue/state.js），
 * 直接部署到 GitHub Pages 子路径（https://zhaozg.github.io/HexaScope/）会失效。
 * 本模块提供将产物内绝对路径改写为相对路径的纯函数，由
 * `frontend-build-cli.ts`（CLI 入口）调用，适配子路径部署。
 *
 * 需要改写的产物：
 * 1. `index.html` —— `<link>/<script>` 标签的资源引用（/css/、/@nue/）；
 * 2. `@nue/mount.js` —— 运行时挂载器内部的动态 import（/@nue/nue.js、`/${n}.js`），
 *    否则浏览器会按站点根路径解析（https://zhaozg.github.io/index.html.js → 404）。
 */

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

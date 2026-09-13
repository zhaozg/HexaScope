/**
 * HexaScope 前端构建纯函数（Nuekit SPA → GitHub Pages 静态站点）。
 *
 * Nuekit 默认输出绝对路径资源（如 /css/base.css、/@nue/state.js），
 * 直接部署到 GitHub Pages 子路径（https://zhaozg.github.io/HexaScope/）会失效。
 * 本模块提供将产物内绝对路径改写为相对路径的纯函数，由
 * `frontend-build-cli.ts`（CLI 入口）调用，适配子路径部署。
 *
 * 需要改写的产物：
 * 1. `index.html` —— `<link>`/`<script>` 标签的资源引用（/css/、/@nue/），
 *    并把 import map 提前到首个 module 脚本之前（否则整张 import map 被忽略）；
 * 2. `@nue/mount.js` —— 运行时挂载器内部的动态 import（/@nue/nue.js、`/${n}.js`），
 *    否则浏览器会按站点根路径解析（https://zhaozg.github.io/index.html.js → 404）。
 *
 * 改写失败必须显式抛错：历史上改写规则依赖压缩器变量名，CI 环境变量改名后
 * 改写静默失效，产物携带根绝对路径上线，导致整站白屏（线上 404）。
 */

/** import map 脚本块（含尾随空白）。 */
const IMPORT_MAP_BLOCK = /<script type="importmap">[\s\S]*?<\/script>\s*/;

/** 首个 module 脚本标签。 */
const FIRST_MODULE_SCRIPT = /<script\b[^>]*\btype="module"[^>]*>/;

/**
 * 匹配 mount.js 中「按站点根解析」的组件库动态 import。
 *
 * 形如 `` import(`/${n}.js${i}`) ``：模板字符串以 `/` 起始，浏览器会把它解析到
 * 站点根（GitHub Pages 子路径部署下即 404）。此处用捕获组而非字面量匹配变量名，
 * 以兼容 esbuild 等压缩器的变量改名（不同环境下可能是 `n`、`o`……）。
 */
const ROOT_ABSOLUTE_LIB_IMPORT = /`\/\$\{([A-Za-z_$][\w$]*)\}\.js\$\{([A-Za-z_$][\w$]*)\}`/g;

/**
 * 将 index.html 中的绝对路径资源引用改写为相对路径，并修正 import map 顺序。
 *
 * Nuekit 输出形如 `href="/css/base.css"`、`src="/@nue/mount.js"`、
 * `"@nue/state.js"`（import map）的引用，在 GitHub Pages 子路径下
 * 会被解析到站点根，必须改写为 `./` 相对路径。
 */
export function rewriteIndexHtml(html: string): string {
  const rewritten = html
    .replaceAll('href="/css/', 'href="./css/')
    .replaceAll('src="/@nue/', 'src="./@nue/')
    .replaceAll('"/@nue/', '"./@nue/');

  return hoistImportMap(rewritten);
}

/**
 * 把 import map 提前到首个 module 脚本之前。
 *
 * HTML 规范要求 import map 必须在任何 module 脚本**开始加载之前**出现；
 * 否则整张 import map 被浏览器忽略（Chrome 提示
 * "An import map is added after module script load was triggered"），
 * 裸模块名（`state` / `mermaid`）无法解析，组件模块加载失败，页面空白。
 *
 * Nuekit 2.0.0-beta.2 的产物顺序恰为「module 脚本 → import map」，
 * 因此必须在构建期把 import map 提到前面。
 *
 * @param html 已完成路径改写的 index.html
 * @returns import map 位于首个 module 脚本之前的 HTML
 */
export function hoistImportMap(html: string): string {
  const block = html.match(IMPORT_MAP_BLOCK)?.[0];
  if (!block) {
    return html;
  }

  const importMapTag = block.trimEnd();
  const withoutBlock = html.replace(IMPORT_MAP_BLOCK, '');
  const firstModuleScript = withoutBlock.match(FIRST_MODULE_SCRIPT)?.[0];

  // 无 module 脚本时退化为放进 </head> 末尾，仍早于任何模块加载
  if (!firstModuleScript) {
    return withoutBlock.replace('</head>', `  ${importMapTag}\n  </head>`);
  }

  return withoutBlock.replace(firstModuleScript, `${importMapTag}\n  ${firstModuleScript}`);
}

/**
 * 将 @nue/mount.js 内部的绝对路径动态 import 改写为相对路径。
 *
 * mount.js 部署于 `@nue/` 目录内，其动态 import 若不改写会按站点根解析：
 * - `import("/@nue/nue.js")`  → `import("./nue.js")`（同目录）
 * - `` import(`/${n}.js${i}`) `` → `` import(`../${n}.js${i}`) ``
 *   （组件库产物 index.html.js / ui/*.html.js 位于站点根，需从 @nue/ 上溯一级）
 *
 * @param mountJs 原始 @nue/mount.js 内容
 * @returns 动态 import 已相对化的内容
 * @throws 产物中仍残留按站点根解析的 import（改写规则需同步更新）
 */
export function rewriteMountJs(mountJs: string): string {
  const rewritten = mountJs
    .replaceAll('"/@nue/nue.js"', '"./nue.js"')
    .replace(ROOT_ABSOLUTE_LIB_IMPORT, '`../${$1}.js${$2}`');

  assertNoRootAbsoluteImport(rewritten);
  return rewritten;
}

/**
 * 断言产物中不再存在按站点根解析的 import。
 *
 * 静默失效的改写会让线上页面整站白屏，因此这里必须「失败即报错」，
 * 让 CI 在部署前拦截，而不是把坏产物发到 GitHub Pages。
 *
 * @param js 改写后的 mount.js 内容
 * @throws 仍含根绝对路径 import 时抛出
 */
function assertNoRootAbsoluteImport(js: string): void {
  const leftover = js.match(/import\(`\/[^`]*`\)/) ?? js.match(/import\("\/[^"]*"\)/);
  if (leftover) {
    throw new Error(
      `mount.js 仍含按站点根解析的 import：${leftover[0]}。` +
        'Nuekit 产物形态可能已变化，请更新 scripts/frontend-build.ts 的改写规则' +
        '（历史故障：线上资源 404 且整站白屏）。',
    );
  }
}

/**
 * 前端构建路径改写单元测试。
 *
 * 覆盖 scripts/frontend-build.ts 的 rewriteIndexHtml / hoistImportMap / rewriteMountJs：
 * Nuekit 产物含绝对路径引用，部署到 GitHub Pages 子路径（/HexaScope/）时必须改写为
 * 相对路径，否则浏览器会向站点根发起请求（404）。
 *
 * 另覆盖两个曾导致整站白屏的历史故障：
 * 1. import map 位于 module 脚本之后 → 浏览器忽略整张 import map → 裸模块名无法解析；
 * 2. 动态 import 改写依赖压缩器变量名字面量 → CI 环境变量改名后静默失效。
 */

import { describe, expect, it } from 'bun:test';
import { hoistImportMap, rewriteIndexHtml, rewriteMountJs } from '../scripts/frontend-build.ts';

describe('rewriteIndexHtml', () => {
  it('将 <link> 的 /css/ 改写为 ./css/', () => {
    const html = '<link rel="stylesheet" href="/css/base.css">';
    expect(rewriteIndexHtml(html)).toContain('href="./css/base.css"');
  });

  it('将 <script> 的 /@nue/ 改写为 ./@nue/', () => {
    const html = '<script src="/@nue/mount.js" type="module"></script>';
    expect(rewriteIndexHtml(html)).toContain('src="./@nue/mount.js"');
  });

  it('将 import map 中的 "/@nue/ 改写为 "./@nue/', () => {
    const html = '"state":"/@nue/state.js"';
    expect(rewriteIndexHtml(html)).toContain('"./@nue/state.js"');
  });

  it('不改写 CDN 绝对 URL', () => {
    const html = '"mermaid":"https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs"';
    expect(rewriteIndexHtml(html)).toContain(
      'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs',
    );
  });

  it('把 import map 提前到首个 module 脚本之前', () => {
    // Nuekit 2.0.0-beta.2 的真实顺序：module 脚本在前，import map 在后。
    // 该顺序会让浏览器忽略整张 import map，裸模块名（state/mermaid）无法解析，
    // 组件模块加载失败，页面完全空白。
    const html =
      '<link rel="stylesheet" href="/css/base.css">' +
      '<script src="/@nue/mount.js" type="module"></script>' +
      '<script type="importmap">{"imports":{"state":"/@nue/state.js"}}</script>';
    const rewritten = rewriteIndexHtml(html);
    expect(rewritten.indexOf('type="importmap"')).toBeLessThan(rewritten.indexOf('type="module"'));
    expect(rewritten).toContain('"state":"./@nue/state.js"');
  });
});

describe('hoistImportMap', () => {
  it('无 import map 时原样返回', () => {
    const html = '<script src="./@nue/mount.js" type="module"></script>';
    expect(hoistImportMap(html)).toBe(html);
  });

  it('无 module 脚本时放入 </head> 末尾', () => {
    const html = '<head><script type="importmap">{"imports":{}}</script></head>';
    const hoisted = hoistImportMap(html);
    expect(hoisted).toContain('<script type="importmap">');
    expect(hoisted.indexOf('type="importmap"')).toBeLessThan(hoisted.indexOf('</head>'));
  });

  it('import map 内容不丢失且仅保留一份', () => {
    const html =
      '<script src="./@nue/mount.js" type="module"></script>' +
      '<script type="importmap">{"imports":{"mermaid":"https://cdn/x.mjs"}}</script>';
    const hoisted = hoistImportMap(html);
    expect(hoisted).toContain('"mermaid":"https://cdn/x.mjs"');
    expect(hoisted.match(/type="importmap"/g)).toHaveLength(1);
  });
});

describe('rewriteMountJs', () => {
  it('将 import("/@nue/nue.js") 改写为同目录 import("./nue.js")', () => {
    const mount = 'let{mount:i}=await import("/@nue/nue.js");';
    const rewritten = rewriteMountJs(mount);
    expect(rewritten).toContain('import("./nue.js")');
    expect(rewritten).not.toContain('"/@nue/');
  });

  it('将动态 import(`/${n}.js${i}`) 改写为上溯一级 import(`../${n}.js${i}`)', () => {
    const mount = 'let{lib:o}=await import(`/${n}.js${i}`);';
    const rewritten = rewriteMountJs(mount);
    expect(rewritten).toContain('import(`../${n}.js${i}`)');
    expect(rewritten).not.toContain('`/${n}.js');
  });

  it('压缩器把变量改名为 o 时同样改写（CI 与本地产物变量名可能不同）', () => {
    // 线上真实产物：esbuild 将变量命名为 o，而旧实现按字面量匹配 `/${n}.js${i}`，
    // 改写静默失效，产物保留根绝对路径 → 请求 /index.html.js → 404 → 整站白屏。
    const mount = 'let{lib:o}=await import(`/${o}.js${i}`);';
    const rewritten = rewriteMountJs(mount);
    expect(rewritten).toContain('import(`../${o}.js${i}`)');
    expect(rewritten).not.toContain('(`/${o}.js');
  });

  it('改写成功时不抛错；形态无法识别时显式抛错', () => {
    expect(() => rewriteMountJs('await import(`/${x}.js${y}`)')).not.toThrow();
    expect(() => rewriteMountJs('await import("/@nue/nue.js")')).not.toThrow();
    // 无法识别的根绝对路径形态：必须失败即报错，避免静默发布坏产物
    expect(() => rewriteMountJs('await import(`/lib/${x}.js${y}`)')).toThrow();
    expect(() => rewriteMountJs('await import("/legacy/bundle.js")')).toThrow();
  });

  it('改后不再残留任何绝对路径 import（Nuekit 2.0.0-beta.2 真实产物片段）', () => {
    // 来自 frontend/.dist/@nue/mount.js 的真实压缩代码
    const mount =
      'async function u(t){let e=document.querySelectorAll("[nue]"),n=e.length?await f(t):[];' +
      'if(!n.length)return;let{mount:i}=await import("/@nue/nue.js");' +
      'var d=0;async function f(t){let e=[];for(let n of p()){let i=n==t?`?${d++}`:"",' +
      '{lib:o}=await import(`/${n}.js${i}`);if(o)e.push(...o)}return e}';
    const rewritten = rewriteMountJs(mount);
    expect(rewritten).toContain('await import("./nue.js")');
    expect(rewritten).toContain('await import(`../${n}.js${i}`)');
    expect(rewritten).not.toMatch(/import\("\/@nue\//);
    expect(rewritten).not.toMatch(/import\(`\/\$\{n\}/);
  });
});

/**
 * 前端构建路径改写单元测试。
 *
 * 覆盖 scripts/frontend-build.ts 的 rewriteIndexHtml / rewriteMountJs：
 * Nuekit 产物含绝对路径引用，部署到 GitHub Pages 子路径（/HexaScope/）时
 * 必须改写为相对路径，否则浏览器会向站点根发起请求（404）。
 */

import { describe, expect, it } from 'bun:test';
import { rewriteIndexHtml, rewriteMountJs } from '../scripts/frontend-build.ts';

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

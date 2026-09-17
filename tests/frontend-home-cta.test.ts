/**
 * 首页安装入口（CTA）与组件脚本契约测试。
 *
 * 背景：站点此前在 `frontend/` 中**没有任何**指向 GitHub App 安装页的链接——安装入口
 * 只以纯文本出现在默认折叠的 `<details>` 内，新用户无法找到漏斗第一步（可见按钮只有
 * 「生成雷达图」与「查看演示报告」，前者对未安装用户必然失败且回收页是死胡同）。
 *
 * 本测试锁定「安装入口可点、非折叠、URL 唯一」的契约，并防止三类真实故障回归：
 * 1. 安装入口被删除或重新塞回折叠元素；
 * 2. 站点安装 URL 与 README / DESIGN 记录的规范 URL 漂移；
 * 3. 组件 `<script>` 注释里出现反引号 —— Nuekit 2.0.0-beta.2 会把脚本按模板字符串处理，
 *    注释中的反引号会错配界符，导致**后续组件**的脚本被编译成一整段损坏的字符串
 *    （表现为整站白屏，且本地 `bun run frontend:build` 不报错）。
 */

import { describe, expect, it } from 'bun:test';

/** 规范安装地址：README 徽章、DESIGN §5 使用流程与站点必须一致（AGENTS.md：GitHub First）。 */
const APP_INSTALL_URL = 'https://github.com/apps/hexascope';

const read = (path: string) => Bun.file(path).text();
const entryHtml = await read('frontend/ui/entry.html');
const indexHtml = await read('frontend/index.html');
const readme = await read('README.md');
const design = await read('DESIGN.md');
const analyzeYml = await read('.github/workflows/analyze.yml');
const baseCss = await read('frontend/css/base.css');
const componentsCss = await read('frontend/css/components.css');

/** 抽出某段 HTML 中所有 <a ...> 开始标签。 */
const anchorsOf = (html: string) => html.match(/<a\b[^>]*>/g) ?? [];

describe('首页安装入口（CTA）', () => {
  it('首页与顶栏都存在指向 App 安装页的链接（原先为 0 处）', () => {
    expect(entryHtml).toContain(APP_INSTALL_URL);
    expect(indexHtml).toContain(APP_INSTALL_URL);
  });

  it('安装入口出现在任何折叠元素之前，且页面上不再有折叠的三步说明', () => {
    const installAt = entryHtml.indexOf(APP_INSTALL_URL);
    const firstDetailsAt = entryHtml.indexOf('<details');
    expect(installAt).toBeGreaterThan(-1);
    // 折叠元素（报告证据链 / 红牌说明）只应出现在安装入口之后
    expect(installAt).toBeLessThan(firstDetailsAt);
    expect(entryHtml).not.toContain('class="howto"');
  });

  it('主 CTA 使用专用按钮样式（绿色主按钮，与查询/演示按钮区分主次）', () => {
    expect(entryHtml).toContain('class="btn btn-install btn-lg"');
    expect(baseCss).toContain('--install:');
    expect(componentsCss).toContain('.btn-install');
  });

  it('所有安装链接都带 target="_blank" 且 rel="noopener"（安全契约）', () => {
    const installAnchors = [...anchorsOf(entryHtml), ...anchorsOf(indexHtml)].filter((a) =>
      a.includes('apps/hexascope'),
    );
    expect(installAnchors.length).toBeGreaterThanOrEqual(4);
    for (const anchor of installAnchors) {
      expect(anchor).toContain('rel="noopener"');
      expect(anchor).toContain('target="_blank"');
    }
  });

  it('安装 URL 与 README / DESIGN 记录的规范地址完全一致（防漂移）', () => {
    // 站点内所有 hexascope App 地址必须逐字等于规范地址
    const siteUrls = new Set(
      [...entryHtml.matchAll(/https:\/\/github\.com\/apps\/[a-z-]+/g)].map((m) => m[0]),
    );
    expect(siteUrls).toEqual(new Set([APP_INSTALL_URL]));
    expect(readme).toContain(APP_INSTALL_URL);
    expect(design).toContain('github.com/apps/hexascope');
  });
});

describe('发起评估入口（/evaluate 指令）', () => {
  it('预填 Issue 的正文使用 analyze.yml 解析的 /evaluate 指令', () => {
    // 从工作流解析命令中提取指令名（`sed -n 's#^/evaluate...`），再断言前端预填的正文同名
    const directive = /s#\^(\/[a-z]+)/.exec(analyzeYml)?.[1];
    expect(directive).toBe('/evaluate');
    expect(entryHtml).toContain(`username ? \`${directive} ${'${username}'}\``);
  });
  it('两个组件共用同一 URL 构造助手，避免预填链接在多处硬编码', () => {
    const usages = entryHtml.match(/buildEvaluateIssueUrl\(/g) ?? [];
    // 1 处定义 + 首页三步流程 + 空态 共 3 处
    expect(usages.length).toBe(3);
    // 预填的 Issue 地址不应再以硬编码形式出现
    expect(entryHtml).not.toContain('body=%2Fevaluate');
  });
});

describe('组件脚本编译约束（Nuekit 反引号陷阱）', () => {
  it('脚本注释中不含反引号（否则后续组件的 <script> 会被编译成损坏字符串）', () => {
    const offenders = entryHtml
      .split('\n')
      .map((line, i) => ({ line: i + 1, text: line.trim() }))
      .filter(({ text }) => text.startsWith('//') && text.includes('`'));
    expect(offenders).toEqual([]);
  });

  it('反引号只出现在真实模板字符串中（数量为偶数，且脚本整体可配对）', () => {
    const scriptBodies = entryHtml.match(/<script>[\s\S]*?<\/script>/g) ?? [];
    expect(scriptBodies.length).toBeGreaterThanOrEqual(3);
    for (const body of scriptBodies) {
      const backticks = (body.match(/`/g) ?? []).length;
      expect(backticks % 2).toBe(0);
    }
  });
});

describe('CTA 配色可访问性（对比度 ≥ 4.5:1）', () => {
  /** 从 CSS 令牌中取值，避免测试与样式表各写一份颜色。 */
  const token = (name: string) => {
    const m = new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(baseCss);
    if (!m) throw new Error(`base.css 缺少颜色令牌 --${name}`);
    return m[1];
  };

  /** WCAG 2.1 相对亮度。 */
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const [r, g, b] = channels.map((v) =>
      v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
    );
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  const contrast = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  it('主 CTA 按钮的默认态与 hover 态白字对比度均 ≥ 4.5:1', () => {
    // GitHub 原版 hover 绿（#2ea043）白字仅 3.37:1，故 hover 需再深一档
    expect(contrast('#ffffff', token('install'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#ffffff', token('install-hover'))).toBeGreaterThanOrEqual(4.5);
  });

  it('正文链接色与面板底色对比度 ≥ 4.5:1', () => {
    expect(contrast(token('brand'), token('bg-panel'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('text'), token('bg'))).toBeGreaterThanOrEqual(4.5);
  });
});

/**
 * 指标启发式库单元测试。
 * @see scripts/metrics.ts
 */

import { describe, expect, it } from 'bun:test';
import {
  analyzeCommits,
  computeAutomationDepth,
  computeRepoStats,
  detectRepoSignals,
  nameSimilarityRatio,
  scoreComplexity,
  scoreModularity,
  scoreReadme,
  type CommitSample,
  type TreeEntry,
} from '../scripts/metrics.ts';

const entry = (path: string, type = 'blob'): TreeEntry => ({ path, type });

describe('detectRepoSignals', () => {
  it('识别架构文档与设计文档', () => {
    const signals = detectRepoSignals(['ARCHITECTURE.md', 'docs/design.md']);
    expect(signals.hasArchitectureMd).toBe(true);
    expect(signals.hasDesignDoc).toBe(true);
  });

  it('识别 ADR 目录形式的架构决策记录', () => {
    expect(detectRepoSignals(['adr/0001-use-bun.md']).hasDesignDoc).toBe(true);
  });

  it('识别 GitHub Actions 与其他 CI 配置', () => {
    expect(detectRepoSignals(['.github/workflows/ci.yml']).hasCiConfig).toBe(true);
    expect(detectRepoSignals(['.gitlab-ci.yml']).hasCiConfig).toBe(true);
    expect(detectRepoSignals(['Jenkinsfile']).hasCiConfig).toBe(true);
  });

  it('识别容器化与编排清单', () => {
    const signals = detectRepoSignals([
      'Dockerfile',
      'docker-compose.yml',
      'deploy/k8s/app.yaml',
    ]);
    expect(signals.hasDockerfile).toBe(true);
    expect(signals.hasDockerCompose).toBe(true);
    expect(signals.hasKubernetesManifest).toBe(true);
  });

  it('识别工程化工具链信号', () => {
    const signals = detectRepoSignals([
      '.pre-commit-config.yaml',
      '.github/dependabot.yml',
      '.github/workflows/release.yml',
      '.github/workflows/codeql-analysis.yml',
      'CHANGELOG.md',
      'CONTRIBUTING.md',
      'LICENSE',
      'docs/guide.md',
      'examples/demo.ts',
      'tests/a.test.ts',
    ]);
    expect(signals.hasPreCommitHooks).toBe(true);
    expect(signals.hasDependencyBot).toBe(true);
    expect(signals.hasReleaseWorkflow).toBe(true);
    expect(signals.hasCodeqlOrSecurityScan).toBe(true);
    expect(signals.hasChangelog).toBe(true);
    expect(signals.hasContributing).toBe(true);
    expect(signals.hasLicense).toBe(true);
    expect(signals.hasDocs).toBe(true);
    expect(signals.hasExampleCode).toBe(true);
    expect(signals.hasTestDirectory).toBe(true);
  });

  it('空文件清单时所有信号为 false', () => {
    const signals = detectRepoSignals([]);
    expect(Object.values(signals).every((value) => value === false)).toBe(true);
  });
});

describe('computeRepoStats', () => {
  it('统计文件数、源码数、测试数与目录深度', () => {
    const stats = computeRepoStats([
      entry('src/index.ts'),
      entry('src/utils/helper.ts'),
      entry('tests/index.test.ts'),
      entry('README.md'),
      entry('src', 'tree'),
    ]);
    expect(stats.fileCount).toBe(4);
    expect(stats.sourceFileCount).toBe(3);
    expect(stats.testFileCount).toBe(1);
    expect(stats.maxDepth).toBe(2);
    expect(stats.dirCount).toBe(3);
    expect(stats.topLevelDirCount).toBe(2);
  });

  it('空树时全部为 0', () => {
    const stats = computeRepoStats([]);
    expect(stats.fileCount).toBe(0);
    expect(stats.maxDepth).toBe(0);
    expect(stats.topLevelDirCount).toBe(0);
  });
});

describe('scoreModularity / scoreComplexity / computeAutomationDepth', () => {
  const richEntries: TreeEntry[] = [
    entry('src/a.ts'),
    entry('src/b/c.ts'),
    entry('src/d/e/f.ts'),
    entry('tests/a.test.ts'),
    entry('docs/readme.md'),
    entry('lib/a.ts'),
    entry('app/a.ts'),
    entry('tools/a.ts'),
    entry('infra/a.ts'),
  ];
  const signals = detectRepoSignals(richEntries.map((item) => item.path));
  const stats = computeRepoStats(richEntries);

  it('分层清晰的仓库模块化得分更高', () => {
    const flat = computeRepoStats([entry('main.ts')]);
    expect(scoreModularity(stats, signals)).toBeGreaterThan(scoreModularity(flat, signals));
  });

  it('模块化得分被限制在 0-100', () => {
    const score = scoreModularity(stats, signals);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('源码规模与语言数提升复杂度得分', () => {
    const small = scoreComplexity(computeRepoStats([entry('a.ts')]), ['TypeScript']);
    const large = scoreComplexity(stats, ['TypeScript', 'Rust', 'Go']);
    expect(large).toBeGreaterThan(small);
  });

  it('自动化深度随工具链信号增加', () => {
    const none = computeAutomationDepth(detectRepoSignals([]));
    const full = computeAutomationDepth(
      detectRepoSignals([
        '.github/workflows/ci.yml',
        '.github/workflows/release.yml',
        '.github/workflows/codeql.yml',
        '.pre-commit-config.yaml',
        '.github/dependabot.yml',
        'Dockerfile',
        'docker-compose.yml',
        'deploy/k8s/app.yaml',
      ]),
    );
    expect(none).toBe(0);
    expect(full).toBe(1);
  });
});

describe('scoreReadme', () => {
  it('章节完整、含徽章与截图的 README 得分较高', () => {
    const rich = [
      '# Project',
      '',
      '![build](https://img.shields.io/badge/build-passing)',
      '![demo](https://example.com/screenshot.png)',
      '',
      '## Installation',
      '```bash',
      'npm i demo',
      '```',
      '## Usage',
      '```js',
      'demo();',
      '```',
      '## API',
      '## License',
      '## Contributing',
      ...Array.from({ length: 60 }, () => '详细说明文字。'),
    ].join('\n');
    const result = scoreReadme(rich);
    expect(result.score).toBeGreaterThan(60);
    expect(result.hasInstallSection).toBe(true);
    expect(result.hasUsageSection).toBe(true);
    expect(result.hasUseCasesDoc).toBe(true);
    expect(result.hasBadges).toBe(true);
    expect(result.hasScreenshots).toBe(true);
    expect(result.hasExampleCode).toBe(true);
  });

  it('空 README 得分为 0', () => {
    const result = scoreReadme('');
    expect(result.score).toBe(0);
    expect(result.length).toBe(0);
  });

  it('得分被限制在 0-100', () => {
    const result = scoreReadme('# A\n## Installation\n## Usage\n## API\n## License');
    expect(result.score).toBeLessThanOrEqual(100);
  });
});

describe('analyzeCommits', () => {
  const mk = (message: string, date: string): CommitSample => ({ message, date });

  it('空样本返回中性结果（方差未知）', () => {
    const result = analyzeCommits([]);
    expect(result.sampleSize).toBe(0);
    expect(result.contributionVariance).toBeNull();
    expect(result.botLikeCommitPattern).toBe(false);
    expect(result.aiCodeProbability).toBe(0);
    expect(result.samples).toEqual([]);
  });

  it('识别无意义提交信息', () => {
    const result = analyzeCommits([
      mk('update', '2026-01-01T10:00:00Z'),
      mk('fix', '2026-01-02T10:00:00Z'),
      mk('tmp', '2026-01-03T10:00:00Z'),
      mk('feat(api): add endpoint', '2026-01-04T10:00:00Z'),
    ]);
    expect(result.meaninglessRatio).toBeCloseTo(0.75, 5);
    expect(result.samples).toContain('feat(api): add endpoint');
  });

  it('统计 Bug 修复与规范提交比例', () => {
    const result = analyzeCommits([
      mk('fix(parser): handle empty input', '2026-01-01T10:00:00Z'),
      mk('feat: add parser', '2026-01-02T10:00:00Z'),
      mk('docs: update guide', '2026-01-03T10:00:00Z'),
      mk('hack something', '2026-01-04T10:00:00Z'),
    ]);
    expect(result.bugfixCount).toBe(1);
    expect(result.conventionalRatio).toBeCloseTo(0.75, 5);
  });

  it('检测 Copilot 共同署名等 AI 痕迹', () => {
    const result = analyzeCommits([
      mk('feat: a\n\nCo-authored-by: Copilot <175728472+Copilot@users.noreply.github.com>', '2026-01-01T10:00:00Z'),
      mk('feat: b\n\nCo-authored-by: Copilot <175728472+Copilot@users.noreply.github.com>', '2026-01-02T10:00:00Z'),
      mk('feat: c', '2026-01-03T10:00:00Z'),
    ]);
    expect(result.aiCodeProbability).toBeGreaterThan(0.3);
  });

  it('提交时间高度集中时判定为 Bot 模式（需足够样本）', () => {
    const botty = analyzeCommits(
      Array.from({ length: 12 }, (_, i) => mk(`chore: tick ${i}`, `2026-01-0${(i % 9) + 1}T03:00:00Z`)),
    );
    expect(botty.botLikeCommitPattern).toBe(true);

    const human = analyzeCommits([
      mk('feat: a', '2026-01-01T03:00:00Z'),
      mk('feat: b', '2026-01-01T15:00:00Z'),
    ]);
    expect(human.botLikeCommitPattern).toBe(false);
  });

  it('采样跨度 ≥7 天时计算变异系数', () => {
    const commits = Array.from({ length: 10 }, (_, i) =>
      mk(`feat: day ${i}`, `2026-01-${String(i + 1).padStart(2, '0')}T10:00:00Z`),
    );
    const result = analyzeCommits(commits);
    expect(result.contributionVariance).not.toBeNull();
    expect(result.contributionVariance).toBeGreaterThanOrEqual(0);
  });

  it('采样跨度不足 7 天时方差为 null（不臆测）', () => {
    const result = analyzeCommits([
      mk('feat: a', '2026-01-01T10:00:00Z'),
      mk('feat: b', '2026-01-02T10:00:00Z'),
    ]);
    expect(result.contributionVariance).toBeNull();
  });

  it('忽略非法时间戳而不抛错', () => {
    const result = analyzeCommits([mk('feat: a', 'not-a-date')]);
    expect(result.sampleSize).toBe(1);
    expect(result.contributionVariance).toBeNull();
  });
});

describe('nameSimilarityRatio', () => {
  it('空列表返回 0', () => {
    expect(nameSimilarityRatio([])).toBe(0);
  });

  it('模板克隆（同名带后缀）比例接近 1', () => {
    const ratio = nameSimilarityRatio(['demo', 'demo-v2', 'demo-copy', 'demo-api']);
    expect(ratio).toBeGreaterThanOrEqual(0.9);
  });

  it('命名各异时比例较低', () => {
    expect(nameSimilarityRatio(['alpha', 'beta', 'gamma'])).toBeLessThan(0.5);
  });
});

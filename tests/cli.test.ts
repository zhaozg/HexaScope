/**
 * CLI 入口（main）单元测试。
 *
 * 通过依赖注入（stdout/stderr/fetchInput）在测试进程内直接驱动 main，
 * 避免真实网络调用，同时保证 Bun 覆盖率统计生效（子进程不计入覆盖率）。
 */

import { describe, expect, it } from 'bun:test';
import { main } from '../scripts/cli.ts';
import type { EvaluationInput } from '../scripts/types.ts';

/** 构造最小评估输入（空仓库 + 零活动）。 */
function makeMinimalInput(username = 'alice'): EvaluationInput {
  return {
    username,
    repos: [],
    activity: {
      avgIssueResponseHours: 0,
      bugfixPrCount: 0,
      prMergeRate: 0,
      avgPrDescriptionLength: 0,
      reviewCommentCount: 0,
      issueDiscussionCount: 0,
      uniqueCollaborators: 0,
      selfMergedPrRatio: 0,
      forkRatio: 0,
      aiCodeProbability: 0,
      botLikeCommitPattern: false,
      starFollowRatio: 0,
      emptyRepoRatio: 0,
      duplicateRepoRatio: 0,
      meaninglessCommitRatio: 0,
      selfResolvedIssueRatio: 0,
      contributionVariance: 0,
    },
  };
}

function makeWriter() {
  const chunks: string[] = [];
  return {
    chunks,
    stream: { write: (s: string) => (chunks.push(s), true) },
  };
}

describe('cli main（evaluate 命令）', () => {
  it('调用数据采集并输出 JSON 报告', async () => {
    const out = makeWriter();
    const code = await main(['evaluate', 'alice'], {
      stdout: out.stream,
      fetchInput: async (username: string) => makeMinimalInput(username),
    });
    expect(code).toBe(0);
    const report = JSON.parse(out.chunks.join(''));
    expect(report.username).toBe('alice');
    expect(report.dimensions).toHaveLength(6);
    expect(report.redFlags).toHaveLength(10);
    expect(report.overallScore).toBeGreaterThanOrEqual(0);
  });
});

describe('cli main（score 命令）', () => {
  it('读取 JSON 输入并输出报告', async () => {
    const out = makeWriter();
    const code = await main(['score', JSON.stringify(makeMinimalInput('bob'))], {
      stdout: out.stream,
    });
    expect(code).toBe(0);
    const report = JSON.parse(out.chunks.join(''));
    expect(report.username).toBe('bob');
    expect(report.dimensions).toHaveLength(6);
  });
});

describe('cli main（用法错误）', () => {
  it('无参数时输出用法并返回 1', async () => {
    const err = makeWriter();
    const code = await main([], {
      stderr: err.stream,
    });
    expect(code).toBe(1);
    expect(err.chunks.join('')).toContain('用法');
  });
});

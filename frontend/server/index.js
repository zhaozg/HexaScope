/*
  HexaScope 前端开发服务器路由（仅 nue dev 使用）。

  生产环境（GitHub Pages 静态托管）不经过此服务器：
  前端组件直接调用 raw.githubusercontent.com 读取 results/ 下的评估报告（ADR-001）。

  - GET /api/report/:username
    开发环境数据源：username == 'demo' 返回本地演示数据（server/demo.json），
    其余用户名代理转发 raw.githubusercontent.com 上的真实评估报告。
*/

import demoReport from './demo.json'

const RAW_BASE = 'https://raw.githubusercontent.com/zhaozg/HexaScope/main/results'

get('/api/report/:username', async (c) => {
  const username = c.req.param('username')

  // 本地演示数据（离线开发 / 快速预览）
  if (username === 'demo') {
    return c.json(demoReport)
  }

  // 其余用户名：代理 raw 上的真实报告
  try {
    const res = await fetch(`${RAW_BASE}/${username}/report.json`)
    if (!res.ok) return c.json({ error: `results/${username}/report.json 不存在` }, 404)
    return c.json(await res.json())
  } catch (err) {
    return c.json({ error: '代理请求失败' }, 502)
  }
})

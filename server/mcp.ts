import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getState, save } from './store.ts'
import { runTool, tools } from './tools.ts'

// The agent connector, served over stdio (Claude Desktop, Claude Code) or HTTP (server/index.ts).

const AGENT = process.env.AGENT_NAME ?? 'Claude'

const instructions = `This connector is the user's private financial dashboard: their holdings (stocks, crypto, real estate syndications, cash) and a Monte Carlo "freedom plan" that says when they can stop working and how much they can spend each year.
Call get_overview first; it has every number in the app. Use get_plan with whatIf to explore a change before saving it, and update_plan to save plan changes, which move the same sliders the user sees. All plan amounts are in today's dollars.`

export const errorText = (e: unknown) =>
  e instanceof z.ZodError
    ? e.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ')
    : String((e as Error).message ?? e)

export function mcpServer() {
  const server = new McpServer({ name: 'freedom-dashboard', version: '0.1.0' }, { instructions })
  for (const t of tools) {
    server.registerTool(t.name, { description: t.description, inputSchema: t.input }, async (args: unknown) => {
      const s = getState()
      s.agentSeenAt = new Date().toISOString()
      save(s)
      try {
        return { content: [{ type: 'text' as const, text: await runTool(t.name, args, AGENT) }] }
      } catch (e) {
        return { isError: true, content: [{ type: 'text' as const, text: errorText(e) }] }
      }
    })
  }
  return server
}

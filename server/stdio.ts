import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { mcpServer } from './mcp.ts'
import { refreshIfStale } from './tools.ts'

// Claude Desktop and Claude Code start this process themselves; see the README.
await mcpServer().connect(new StdioServerTransport())
// Keeps prices current when Claude is used without the web app running.
refreshIfStale()

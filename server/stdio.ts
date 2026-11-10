import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { mcpServer } from './mcp.ts'

// Claude Desktop and Claude Code start this process themselves; see the README.
await mcpServer().connect(new StdioServerTransport())

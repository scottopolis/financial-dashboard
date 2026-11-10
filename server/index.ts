import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { connectorToken, getState, repoDir } from './store.ts'
import { overview, refreshIfStale, runTool, tools } from './tools.ts'
import { errorText, mcpServer } from './mcp.ts'

// The local server:
//   /                the web app, from dist/ after `npm run build`
//   /api/*           the web app's data and tools
//   /mcp/<token>     the agent connector over HTTP, for clients that take a URL

const PORT = Number(process.env.PORT ?? 8787)
const HOST = process.env.HOST ?? '127.0.0.1'
const MCP_PATH = `/mcp/${connectorToken()}`
const DIST = path.join(repoDir, 'dist')
const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }

async function readBody(req: http.IncomingMessage) {
  let raw = ''
  for await (const chunk of req) raw += chunk
  return raw ? JSON.parse(raw) : undefined
}

function send(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': typeof body === 'string' ? 'text/markdown; charset=utf-8' : 'application/json' })
  res.end(typeof body === 'string' ? body : JSON.stringify(body))
}

function sendFile(res: http.ServerResponse, pathname: string) {
  let file = path.join(DIST, path.normalize(pathname))
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html')
  if (!fs.existsSync(file)) return send(res, 404, { error: 'Run `npm run build` first, or use `npm run dev`.' })
  res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
}

const connector = {
  path: MCP_PATH,
  node: process.execPath,
  stdioScript: path.join(repoDir, 'server', 'stdio.ts'),
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    try {
      if (url.pathname === MCP_PATH) {
        const server = mcpServer()
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
        res.on('close', () => {
          transport.close()
          server.close()
        })
        await server.connect(transport)
        await transport.handleRequest(req, res, req.method === 'POST' ? await readBody(req) : undefined)
        return
      }
      if (req.method === 'GET' && url.pathname === '/api/state') return send(res, 200, getState())
      if (req.method === 'GET' && url.pathname === '/api/connector') return send(res, 200, connector)
      if (req.method === 'GET' && url.pathname === '/api/overview') return send(res, 200, overview())
      if (req.method === 'GET' && url.pathname === '/api/tools')
        return send(res, 200, tools.map((t) => ({ name: t.name, description: t.description })))
      const call = url.pathname.match(/^\/api\/tools\/([a-z_]+)$/)
      if (req.method === 'POST' && call) {
        const result = await runTool(call[1], await readBody(req), 'You')
        return send(res, 200, { result, state: getState() })
      }
      if (url.pathname.startsWith('/api/')) return send(res, 404, { error: 'Not found' })
      if (req.method === 'GET') return sendFile(res, url.pathname)
      send(res, 404, { error: 'Not found' })
    } catch (e) {
      if (!res.headersSent) send(res, 400, { error: errorText(e) })
    }
  })
  .listen(PORT, HOST, () => {
    console.log(`Dashboard: http://localhost:${PORT}`)
  })

// Prices update once a day: on start, then checked every hour.
refreshIfStale()
setInterval(refreshIfStale, 60 * 60 * 1000)

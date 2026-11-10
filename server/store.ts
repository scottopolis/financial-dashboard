import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { accrueInterest, migrate, recordHistory, sampleState, type State } from '../src/model.ts'

// All data lives in one JSON file next to the code, so the web server and the agent's stdio
// server (a separate process Claude starts) read and write the same data.

export const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dir = path.resolve(process.env.DATA_DIR ?? path.join(repoDir, 'data'))
const file = path.join(dir, 'state.json')
fs.mkdirSync(dir, { recursive: true })

let state: State = structuredClone(sampleState)

/** Reads the latest state from disk, since another process may have changed it, and adds any interest due. */
export function getState() {
  if (fs.existsSync(file)) state = JSON.parse(fs.readFileSync(file, 'utf8'))
  const migrated = migrate(state)
  const accrued = accrueInterest(state)
  if (recordHistory(state) || migrated || accrued) save()
  return state
}

export function save(next: State = state) {
  state = next
  fs.writeFileSync(file + '.tmp', JSON.stringify(state, null, 2))
  fs.renameSync(file + '.tmp', file)
}

/** The secret in the HTTP connector URL. Set MCP_TOKEN, or one is generated and kept in data/mcp-token. */
export function connectorToken() {
  if (process.env.MCP_TOKEN) return process.env.MCP_TOKEN
  const tokenFile = path.join(dir, 'mcp-token')
  if (!fs.existsSync(tokenFile)) fs.writeFileSync(tokenFile, randomBytes(24).toString('base64url'), { mode: 0o600 })
  return fs.readFileSync(tokenFile, 'utf8').trim()
}

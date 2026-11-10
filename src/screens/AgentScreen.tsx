import { useEffect, useState } from 'react'
import { ago, type State } from '../model.ts'
import { fetchConnector, fetchOverview, fetchTools, type Connector } from '../api.ts'
import { ChangeFeed } from './ChangeFeed'

const prompts = [
  'When can I stop working, and how sure is that?',
  'What if I saved an extra $20k a year? Save it if it gets me there sooner.',
  'I bought 25 shares of VOO.',
  'The Austin multifamily paid a $2,250 distribution today.',
  'Plan a $150k house down payment in 2029.',
  'Add my Ally savings: $25,000 at 4.2% APY.',
  'Create a Real estate portfolio and move the syndications into it.',
]

export function AgentScreen({ state }: { state: State }) {
  const [tools, setTools] = useState<{ name: string; description: string }[]>([])
  const [overview, setOverview] = useState('')
  const [conn, setConn] = useState<Connector | null>(null)
  useEffect(() => {
    fetchTools().then(setTools)
    fetchConnector().then(setConn)
  }, [])
  useEffect(() => {
    fetchOverview().then(setOverview)
  }, [state])

  const desktop = conn
    ? JSON.stringify({ mcpServers: { freedom: { command: conn.node, args: [conn.stdioScript] } } }, null, 2)
    : ''
  const code = conn ? `claude mcp add freedom -- "${conn.node}" "${conn.stdioScript}"` : ''

  return (
    <div className="stack-lg">
      <section className="stack-xs">
        <h1 className="hero-sm">Your agent</h1>
        <span className="caption">
          {state.agentSeenAt ? `Claude last used the connector ${ago(state.agentSeenAt)}.` : 'No agent has connected yet.'}
        </span>
      </section>

      <section className="stack-sm">
        <h2 className="section">Connect Claude on this computer</h2>
        <div className="card stack-md">
          <div className="stack-sm">
            <span>
              <span className="strong">Claude Desktop:</span> open Settings, Developer, Edit Config, add this to{' '}
              <code className="mono">claude_desktop_config.json</code>, and restart Claude.
            </span>
            <CopyBlock text={desktop} />
          </div>
          <div className="stack-sm">
            <span>
              <span className="strong">Claude Code:</span> run this once in a terminal.
            </span>
            <CopyBlock text={code} />
          </div>
          <span className="caption">
            Claude starts the connector itself and reads the same data file as this app, so this page doesn't need to be
            open. Nothing leaves your computer except what Claude sends to Anthropic in the chat.
          </span>
        </div>
      </section>

      <section className="stack-sm">
        <h2 className="section">Try asking</h2>
        <div className="chips">
          {prompts.map((p) => (
            <span key={p} className="chip">
              {p}
            </span>
          ))}
        </div>
      </section>

      <section className="stack-sm">
        <h2 className="section">Tools Claude can use</h2>
        <div className="card list">
          {tools.map((t) => (
            <div key={t.name} className="list-row tool">
              <code className="mono">{t.name}</code>
              <span className="caption">{t.description}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="stack-sm">
        <h2 className="section">What Claude sees (get_overview)</h2>
        <pre className="card overview">{overview}</pre>
      </section>

      <section className="stack-sm">
        <h2 className="section">All changes</h2>
        <ChangeFeed changes={state.changes.slice(0, 30)} />
      </section>
    </div>
  )
}

function CopyBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="copy-block">
      <pre className="mono">{text || 'Loading…'}</pre>
      <button
        className="btn"
        onClick={() => {
          navigator.clipboard?.writeText(text)
          setCopied(true)
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

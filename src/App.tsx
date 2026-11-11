import { useCallback, useEffect, useState } from 'react'
import { ago, type State } from './model.ts'
import { callTool, fetchState } from './api.ts'
import { Home } from './screens/Home'
import { PlanScreen } from './screens/PlanScreen'
import { HoldingScreen } from './screens/HoldingScreen'
import { AgentScreen } from './screens/AgentScreen'
import { AddScreen } from './screens/AddScreen'

type Route = { name: 'home' } | { name: 'plan' } | { name: 'add' } | { name: 'agent' } | { name: 'holding'; id: string }

function parseRoute(): Route {
  const [, page, id] = location.hash.split('/')
  if (page === 'plan') return { name: 'plan' }
  if (page === 'agent') return { name: 'agent' }
  if (page === 'add') return { name: 'add' }
  if (page === 'holding' && id) return { name: 'holding', id }
  return { name: 'home' }
}

const tabs = [
  { href: '#/', label: 'Portfolio', route: 'home', icon: 'M3 12l9-8 9 8M5 10v10h14V10' },
  { href: '#/plan', label: 'Plan', route: 'plan', icon: 'M4 19h16M7 16V9m5 7V5m5 11v-4' },
  { href: '#/agent', label: 'Agent', route: 'agent', icon: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9z' },
] as const

export default function App() {
  const [route, setRoute] = useState(parseRoute)
  const [state, setState] = useState<State | null>(null)
  const [error, setError] = useState('')

  // Poll so changes the agent makes show up within a few seconds.
  const refresh = useCallback(() => fetchState().then(setState, (e) => setError(String(e.message ?? e))), [])
  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, 4000)
    const onHash = () => {
      setRoute(parseRoute())
      scrollTo(0, 0)
    }
    addEventListener('hashchange', onHash)
    return () => {
      clearInterval(timer)
      removeEventListener('hashchange', onHash)
    }
  }, [refresh])

  const act = useCallback(async (tool: string, args: object) => {
    try {
      setState((await callTool(tool, args)).state)
      setError('')
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    }
  }, [])

  const active = route.name === 'holding' ? 'home' : route.name

  let screen
  if (!state) screen = <p className="muted">{error || 'Loading…'}</p>
  else if (route.name === 'plan') screen = <PlanScreen state={state} act={act} />
  else if (route.name === 'add') screen = <AddScreen state={state} act={act} />
  else if (route.name === 'agent') screen = <AgentScreen state={state} />
  else if (route.name === 'holding') {
    const h = state.holdings.find((x) => x.id === route.id)
    screen = h ? <HoldingScreen holding={h} state={state} act={act} /> : <p className="muted">That holding was removed.</p>
  } else screen = <Home state={state} act={act} />

  return (
    <>
      <header className="app-header">
        <div className="app-header-inner">
          <a className="brand" href="#/">
            Freedom
          </a>
          <nav className="top-tabs" aria-label="Sections">
            {tabs.map((t) => (
              <a key={t.route} href={t.href} aria-current={active === t.route ? 'page' : undefined}>
                {t.label}
              </a>
            ))}
          </nav>
          <a className="status" href="#/agent">
            <span className={state?.agentSeenAt ? 'dot good' : 'dot'} />
            {state?.agentSeenAt ? `Claude ${ago(state.agentSeenAt)}` : 'Claude not connected'}
          </a>
        </div>
      </header>

      <main className="page">
        {error && state && <p className="error">{error}</p>}
        {screen}
      </main>

      <nav className="bottom-tabs" aria-label="Sections">
        {tabs.map((t) => (
          <a key={t.route} href={t.href} aria-current={active === t.route ? 'page' : undefined}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d={t.icon} />
            </svg>
            {t.label}
          </a>
        ))}
      </nav>
    </>
  )
}

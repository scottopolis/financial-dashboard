import { useMemo } from 'react'
import { ago, describe, START_YEAR, type State } from '../model.ts'
import { exact, makePlan, money, netWorthOf, signedPct } from '../plan.ts'
import { FreedomCard } from './FreedomCard'
import { ChangeFeed } from './ChangeFeed'
import { NetWorthChart } from '../charts/NetWorthChart'

export function Home({ state }: { state: State }) {
  const { holdings, assumptions: a } = state
  const netWorth = netWorthOf(holdings)
  const plan = useMemo(() => makePlan(a, holdings, START_YEAR), [a, holdings])
  const today = holdings.reduce((s, h) => s + (h.dayChangePct ? (h.value * h.dayChangePct) / (100 + h.dayChangePct) : 0), 0)
  const groups = state.portfolios.map((p, i) => {
    const hs = holdings.filter((h) => h.portfolioId === p.id)
    return { ...p, holdings: hs, value: netWorthOf(hs), color: `var(--series-${(i % 6) + 1})` }
  })
  const funded = groups.filter((g) => g.value > 0)

  return (
    <div className="stack-lg">
      <section className="stack-sm">
        <NetWorthChart history={state.history ?? []} netWorth={netWorth} today={today} />
        <div className="alloc">
          {funded.map((g) => (
            <span key={g.id} style={{ flex: g.value, background: g.color }} />
          ))}
        </div>
        <div className="legend">
          {funded.map((g) => (
            <span key={g.id}>
              <i style={{ background: g.color }} />
              {g.name} {Math.round((g.value / netWorth) * 100)}%
            </span>
          ))}
        </div>
      </section>

      <FreedomCard plan={plan} assumptions={a} link />

      <div className="cols">
        <section className="stack-md">
          <div className="row-between">
            <span className="label">Portfolios</span>
            <a className="link" href="#/add">
              + Add
            </a>
          </div>
          {groups.map((g) => (
            <div key={g.id} className="stack-sm">
              <div className="row-between">
                <span className="group-name">
                  <span className="kind-dot" style={{ background: g.color }} />
                  {g.name}
                  {g.name !== g.kind && <span className="caption">{g.kind}</span>}
                </span>
                <span className="num">{money(g.value)}</span>
              </div>
              <div className="card list">
                {g.holdings.length === 0 && <p className="list-row muted">No holdings yet.</p>}
                {g.holdings.map((h) => (
                  <a key={h.id} className="list-row" href={`#/holding/${h.id}`}>
                    <span className="grow">
                      <span className="block">{h.name}</span>
                      <span className="caption">{describe(h)}</span>
                    </span>
                    <span className="right">
                      <span className="block num">{money(h.value)}</span>
                      <span className={h.dayChangePct ? (h.dayChangePct > 0 ? 'caption up' : 'caption down') : 'caption'}>
                        {h.dayChangePct !== null
                          ? h.dayChangePct === 0
                            ? '0.0%'
                            : signedPct(h.dayChangePct)
                          : h.interestPct
                            ? `+${exact(h.interestEarned ?? 0)} interest`
                            : 'Manual'}
                      </span>
                    </span>
                    <span className="chev" aria-hidden="true">
                      ›
                    </span>
                  </a>
                ))}
              </div>
            </div>
          ))}
          <p className="caption">
            {state.pricesUpdatedAt ? `Prices updated ${ago(state.pricesUpdatedAt)}, daily from Yahoo Finance. ` : ''}Add holdings
            here or ask Claude.
          </p>
        </section>
        <section className="stack-sm">
          <div className="row-between">
            <span className="label">Recent changes</span>
            <a className="link" href="#/agent">
              All
            </a>
          </div>
          <ChangeFeed changes={state.changes.slice(0, 4)} />
          {state.changes[0] && <span className="caption">Last change {ago(state.changes[0].at)}</span>}
        </section>
      </div>
    </div>
  )
}

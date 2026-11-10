import { useMemo, useState } from 'react'
import { ago, assetKinds, describe, START_YEAR, type State } from '../model.ts'
import { exact, makePlan, MAX_STOP, money, netWorthOf, signedPct } from '../plan.ts'
import { FanChart } from '../charts/FanChart'
import { ChangeFeed } from './ChangeFeed'

const yearsLabel = (x: number) => (x === 0 ? 'now' : x === 1 ? 'in 1 year' : `in ${x} years`)

export function Home({ state }: { state: State }) {
  const { holdings, assumptions: a } = state
  const netWorth = netWorthOf(holdings)
  const plan = useMemo(() => makePlan(a, netWorth, START_YEAR), [a, netWorth])
  const today = holdings.reduce((s, h) => s + (h.dayChangePct ? (h.value * h.dayChangePct) / (100 + h.dayChangePct) : 0), 0)
  const byKind = assetKinds
    .map((kind) => ({ kind, value: netWorthOf(holdings.filter((h) => h.kind === kind)) }))
    .filter((b) => b.value > 0)
  const [picked, setStop] = useState<number | null>(null)
  const stop = picked ?? (plan.freeAt >= 0 ? plan.freeAt : 10)
  const spend = plan.spendByStop[stop]

  return (
    <div className="stack-lg">
      <section className="stack-sm">
        <div className="stack-xs">
          <span className="label">Net worth</span>
          <div className="row">
            <span className="big num">{exact(netWorth)}</span>
            <span className={today >= 0 ? 'delta up' : 'delta down'}>
              {today >= 0 ? '+' : '−'}
              {exact(Math.abs(today))} today
            </span>
          </div>
        </div>
        <div className="alloc">
          {byKind.map((b) => (
            <span key={b.kind} style={{ flex: b.value, background: `var(--kind-${b.kind})` }} />
          ))}
        </div>
        <div className="legend">
          {byKind.map((b) => (
            <span key={b.kind}>
              <i style={{ background: `var(--kind-${b.kind})` }} />
              {b.kind} {Math.round((b.value / netWorth) * 100)}%
            </span>
          ))}
        </div>
      </section>

      <section className="card stack-md">
        <div className="row-between">
          <span className="label">Freedom</span>
          <a className="link" href="#/plan">
            Adjust plan
          </a>
        </div>
        <p className="hero">
          Stop working {yearsLabel(stop)}, in {START_YEAR + stop} at {a.currentAge + stop}, and you could spend{' '}
          <em>{money(spend)} a year</em> for life.
        </p>
        <div className="stack-xs">
          <input
            type="range"
            className="range"
            min={0}
            max={MAX_STOP}
            value={stop}
            onChange={(e) => setStop(Number(e.target.value))}
            aria-label="Years until you stop working"
            style={{ '--fill': `${(stop / MAX_STOP) * 100}%` } as React.CSSProperties}
          />
          <div className="row-between caption">
            <span>Now</span>
            <span>{MAX_STOP} years</span>
          </div>
        </div>
        <FanChart bands={plan.bands(stop, spend)} stop={stop} startYear={START_YEAR} endAge={a.planToAge} />
        <p className="caption">
          Portfolio in today's dollars, middle half of {plan.runs} simulated markets. {money(spend)} a year lasts to{' '}
          {a.planToAge} in {a.confidencePct}% of them.
        </p>
      </section>

      <div className="cols">
        <section className="stack-sm">
          <span className="label">Holdings</span>
          <div className="card list">
            {holdings.map((h) => (
              <a key={h.id} className="list-row" href={`#/holding/${h.id}`}>
                <span className="kind-dot" style={{ background: `var(--kind-${h.kind})` }} />
                <span className="grow">
                  <span className="block">{h.name}</span>
                  <span className="caption">{describe(h)}</span>
                </span>
                <span className="right">
                  <span className="block num">{money(h.value)}</span>
                  <span className={h.dayChangePct ? (h.dayChangePct > 0 ? 'caption up' : 'caption down') : 'caption'}>
                    {h.dayChangePct === null ? 'Manual' : h.dayChangePct === 0 ? '0.0%' : signedPct(h.dayChangePct)}
                  </span>
                </span>
                <span className="chev" aria-hidden="true">
                  ›
                </span>
              </a>
            ))}
          </div>
          <p className="caption">
            {state.pricesUpdatedAt ? `Prices updated ${ago(state.pricesUpdatedAt)}, daily from Yahoo Finance. ` : ''}To add or
            change holdings, ask Claude.
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

import { describe, shortDate, valueHistory, type Holding, type State } from '../model.ts'
import { exact, money, netWorthOf, signedPct } from '../plan.ts'
import { useWidth } from '../useWidth'

function ValueChart({ values }: { values: number[] }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const w = Math.max(260, width)
  const h = 140
  const pad = 6
  const lo = Math.min(...values) * 0.97
  const hi = Math.max(...values) * 1.01
  const x = (i: number) => (i / (values.length - 1)) * w
  const y = (v: number) => pad + (1 - (v - lo) / (hi - lo || 1)) * (h - pad * 2 - 16)
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  return (
    <div ref={ref}>
      {width > 0 && (
        <svg className="chart" width={w} height={h} role="img" aria-label="Value over the last year">
          <path d={`${d}L${w},${h - 16}L0,${h - 16}Z`} className="band" />
          <path d={d} className="median" />
          <text x={0} y={h - 2}>
            12 months ago
          </text>
          <text x={w} y={h - 2} textAnchor="end">
            Today
          </text>
        </svg>
      )}
    </div>
  )
}

export function HoldingScreen({ holding: h, state }: { holding: Holding; state: State }) {
  const gain = h.value - h.costBasis
  const paid = h.distributions.reduce((s, d) => s + d.amount, 0)
  const manual = h.dayChangePct === null
  const netWorth = netWorthOf(state.holdings)

  return (
    <div className="stack-lg">
      <a className="link back" href="#/">
        ‹ Portfolio
      </a>
      <section className="stack-xs">
        <span className="label">
          {h.name} · {h.kind}
        </span>
        <div className="row">
          <span className="big num">{exact(h.value)}</span>
          {!manual && (
            <span className={h.dayChangePct! >= 0 ? 'delta up' : 'delta down'}>{signedPct(h.dayChangePct!)} today</span>
          )}
        </div>
        <span className="caption">
          {describe(h)} · id <code>{h.id}</code>
        </span>
      </section>

      <section className="card stack-sm">
        <ValueChart values={valueHistory(h)} />
        <p className="caption">
          {manual ? 'Changes when Claude records a new valuation.' : 'Updated once a day from the price feed.'}
        </p>
      </section>

      <section className="card stats">
        <div>
          <span className="caption">Cost basis</span>
          <span className="block num">{money(h.costBasis)}</span>
        </div>
        <div>
          <span className="caption">Gain</span>
          <span className={`block num ${gain > 0 ? 'up' : gain < 0 ? 'down' : ''}`}>
            {gain === 0 ? '$0' : `${gain > 0 ? '+' : '−'}${money(Math.abs(gain))}`}
          </span>
        </div>
        <div>
          <span className="caption">Of portfolio</span>
          <span className="block num">{((h.value / netWorth) * 100).toFixed(1)}%</span>
        </div>
        {paid > 0 && (
          <div>
            <span className="caption">Paid out</span>
            <span className="block num">{money(paid)}</span>
          </div>
        )}
      </section>

      {h.distributions.length > 0 && (
        <section className="stack-sm">
          <h2 className="section">Distributions</h2>
          <div className="card list">
            {h.distributions.map((d, i) => (
              <div key={d.date + i} className="list-row">
                <span className="grow">{shortDate(d.date)}</span>
                <span className="num">{exact(d.amount)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {h.note && (
        <section className="stack-sm">
          <h2 className="section">Notes</h2>
          <p className="card">{h.note}</p>
        </section>
      )}

      <p className="caption">
        {manual ? `Ask Claude: “${h.name} is now worth $105k” or “Log a $2,250 distribution from ${h.name}.”` : `Ask Claude: “I bought 10 more ${h.symbol}.”`}
      </p>
    </div>
  )
}

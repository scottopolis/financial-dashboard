import { useState } from 'react'
import { describe, shortDate, valueHistory, type Holding, type State } from '../model.ts'
import type { Act } from '../api.ts'
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

export function HoldingScreen({ holding: h, state, act }: { holding: Holding; state: State; act: Act }) {
  const [editing, setEditing] = useState(false)
  const [draftValue, setDraftValue] = useState('')
  const [draftApy, setDraftApy] = useState('')
  const portfolio = state.portfolios.find((p) => p.id === h.portfolioId)
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
          {h.name} · {portfolio?.name ?? h.kind}
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

      {manual && <InterestControl holding={h} act={act} />}

      <section className="card stack-sm">
        <ValueChart values={valueHistory(h)} />
        <p className="caption">
          {!manual
            ? 'Updated once a day from the price feed.'
            : h.interestPct
              ? `Grows daily at ${h.interestPct}% APY. Update the balance when you add or withdraw money.`
              : 'Changes when you or Claude record a new value.'}
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
        {h.interestPct ? (
          <div>
            <span className="caption">Interest added</span>
            <span className="block num up">+{exact(h.interestEarned ?? 0)}</span>
          </div>
        ) : null}
        {paid > 0 && (
          <div>
            <span className="caption">Paid out</span>
            <span className="block num">{money(paid)}</span>
          </div>
        )}
      </section>

      {manual && (
        <section className="stack-sm">
          <h2 className="section">{h.kind === 'Cash' ? 'Balance and interest' : 'Value'}</h2>
          <div className="card">
            {editing ? (
              <form
                className="inline-form"
                onSubmit={async (e) => {
                  e.preventDefault()
                  const args: Record<string, unknown> = { id: h.id }
                  const v = Number(draftValue.replace(/[$,]/g, ''))
                  if (draftValue.trim() && Number.isFinite(v) && v !== Math.round(h.value)) args.value = v
                  const r = Number(draftApy)
                  if (draftApy.trim() !== String(h.interestPct ?? '') && Number.isFinite(r)) args.interestPct = draftApy.trim() ? r : 0
                  if (Object.keys(args).length === 1 || (await act('update_holding', args))) setEditing(false)
                }}
              >
                <label className="field grow">
                  <span className="field-label">{h.kind === 'Cash' ? 'Balance' : 'Value'}</span>
                  <span className="input">
                    <span className="affix">$</span>
                    <input inputMode="decimal" autoFocus value={draftValue} onChange={(e) => setDraftValue(e.target.value)} />
                  </span>
                </label>
                <label className="field grow">
                  <span className="field-label">Interest</span>
                  <span className="input">
                    <input inputMode="decimal" value={draftApy} onChange={(e) => setDraftApy(e.target.value)} placeholder="None" />
                    <span className="affix">% APY</span>
                  </span>
                </label>
                <button type="submit" className="btn primary">
                  Save
                </button>
                <button type="button" className="btn" onClick={() => setEditing(false)}>
                  Cancel
                </button>
              </form>
            ) : (
              <div className="row-between center wrap">
                <span>
                  {h.valuedOn ? `Last set ${shortDate(h.valuedOn)}` : 'Never set'}
                  {h.interestPct ? `, ${h.interestPct}% APY` : ''}
                </span>
                <button
                  className="btn"
                  onClick={() => {
                    setDraftValue(String(Math.round(h.value)))
                    setDraftApy(h.interestPct ? String(h.interestPct) : '')
                    setEditing(true)
                  }}
                >
                  Update
                </button>
              </div>
            )}
          </div>
        </section>
      )}

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
        {manual ? (h.kind === 'Cash' ? `Or ask Claude: “My ${h.name} balance is $45,000.”` : `Or ask Claude: “${h.name} is now worth $105k” or “Log a $2,250 distribution from ${h.name}.”`) : `Ask Claude: “I bought 10 more ${h.symbol}.”`}
      </p>
    </div>
  )
}

/** The interest rate on a cash or other manual holding, always visible and saved as you let go. */
function InterestControl({ holding: h, act }: { holding: Holding; act: Act }) {
  const [draft, setDraft] = useState<number | null>(null)
  const apy = draft ?? h.interestPct ?? 0
  const save = async () => {
    if (draft === null) return
    if (draft !== (h.interestPct ?? 0)) await act('update_holding', { id: h.id, interestPct: draft })
    setDraft(null)
  }
  return (
    <section className="card stack-xs">
      <label className="slider">
        <span className="row-between">
          <span>Interest rate</span>
          <span className="num strong apy">{apy ? `${+apy.toFixed(2)}% APY` : 'None'}</span>
        </span>
        <input
          type="range"
          className="range"
          min={0}
          max={8}
          step={0.05}
          value={apy}
          onChange={(e) => setDraft(Number(e.target.value))}
          onPointerUp={save}
          onKeyUp={save}
          onBlur={save}
          style={{ '--fill': `${(apy / 8) * 100}%` } as React.CSSProperties}
        />
        <span className="caption">
          {apy
            ? `Adds about ${exact((h.value * apy) / 100)} a year to this balance, daily. The plan grows cash at this rate, not the market return.`
            : 'Set a rate for savings accounts. Interest is added daily, and the plan grows cash at it.'}
        </span>
      </label>
    </section>
  )
}

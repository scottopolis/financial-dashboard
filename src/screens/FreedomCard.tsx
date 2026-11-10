import { useState } from 'react'
import { START_YEAR, type Assumptions } from '../model.ts'
import { MAX_STOP, money, type Plan } from '../plan.ts'
import { FanChart } from '../charts/FanChart'

const STOP_KEY = 'freedom.stopYears'

const yearsLabel = (x: number) => (x === 0 ? 'now' : x === 1 ? 'in 1 year' : `in ${x} years`)

/** The freedom answer with its stop-year slider and range chart, shared by Home and Plan. */
export function FreedomCard({ plan, assumptions: a, link }: { plan: Plan; assumptions: Assumptions; link?: boolean }) {
  // The stop year you pick is kept in this browser, so it survives reloads and page changes.
  const [picked, setPicked] = useState<number | null>(() => {
    const v = localStorage.getItem(STOP_KEY)
    return v === null ? null : Math.min(MAX_STOP, Math.max(0, Number(v)))
  })
  const setStop = (v: number) => {
    localStorage.setItem(STOP_KEY, String(v))
    setPicked(v)
  }
  const stop = picked ?? (plan.freeAt >= 0 ? plan.freeAt : 10)
  const spend = plan.spendByStop[stop]
  const lasts = Math.round(plan.lastsAt(stop) * 100)

  return (
    <section className="card stack-md">
      <div className="row-between">
        <span className="label">Freedom</span>
        {link && (
          <a className="link" href="#/plan">
            Adjust plan
          </a>
        )}
      </div>
      <p className="hero">
        {plan.withdrawalPct ? (
          <>
            Stop working {yearsLabel(stop)}, in {START_YEAR + stop} at {a.currentAge + stop}, and withdrawing {plan.withdrawalPct}% gives
            you <em>{money(spend)} a year</em>, lasting in {lasts}% of markets.
          </>
        ) : (
          <>
            Stop working {yearsLabel(stop)}, in {START_YEAR + stop} at {a.currentAge + stop}, and you could spend{' '}
            <em>{money(spend)} a year</em> for life.
          </>
        )}
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
        Portfolio in today's dollars, middle half of {plan.runs} simulated markets. {money(spend)} a year lasts to {a.planToAge} in{' '}
        {lasts}% of them.
      </p>
    </section>
  )
}

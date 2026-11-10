import { useEffect, useMemo, useRef, useState } from 'react'
import { formatSlider, planSliders, START_YEAR, type Assumptions, type SliderKey, type State } from '../model.ts'
import { exact, makePlan, MAX_STOP, money, netWorthOf } from '../plan.ts'
import type { Act } from '../api.ts'
import { FanChart } from '../charts/FanChart'

const groups = ['Savings and income', 'Goal', 'Markets'] as const

export function PlanScreen({ state, act }: { state: State; act: Act }) {
  // Slider moves show instantly from a local draft; they save through update_plan after a short pause,
  // the same tool the agent uses.
  const [draft, setDraft] = useState<Partial<Record<SliderKey, number>>>({})
  const pending = useRef<Partial<Record<SliderKey, number>>>({})
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  const a: Assumptions = { ...state.assumptions, ...draft }
  const netWorth = netWorthOf(state.holdings)
  const key = JSON.stringify(a)
  const plan = useMemo(() => makePlan(JSON.parse(key), netWorth, START_YEAR), [key, netWorth])
  const stop = plan.freeAt >= 0 ? plan.freeAt : MAX_STOP
  const spend = plan.freeAt >= 0 ? a.retireSpending : plan.spendByStop[MAX_STOP]

  const move = (key: SliderKey, v: number) => {
    setDraft((d) => ({ ...d, [key]: v }))
    pending.current[key] = v
    clearTimeout(timer.current)
    timer.current = window.setTimeout(async () => {
      const args = pending.current
      pending.current = {}
      await act('update_plan', args)
      setDraft((d) => {
        const next = { ...d }
        for (const k of Object.keys(args) as SliderKey[]) if (next[k] === args[k]) delete next[k]
        return next
      })
    }, 400)
  }

  const answer =
    plan.freeAt >= 0 ? (
      <>
        Free to stop in <em>{START_YEAR + plan.freeAt}</em>, at {a.currentAge + plan.freeAt}, spending {money(a.retireSpending)} a year.
      </>
    ) : (
      <>
        Not free within {MAX_STOP} years. Stopping in {START_YEAR + MAX_STOP} supports <em>{money(spend)} a year</em>.
      </>
    )

  return (
    <div className="stack-lg">
      <section className="card stack-sm plan-top">
        <p className="hero-sm">{answer}</p>
        <FanChart bands={plan.bands(stop, spend)} stop={stop} startYear={START_YEAR} endAge={a.planToAge} height={150} />
      </section>

      {groups.map((g) => (
        <section key={g} className="stack-sm">
          <h2 className="section">{g}</h2>
          <div className="card sliders">
            {planSliders
              .filter((s) => s.group === g)
              .map((s) => (
                <label key={s.key} className={s.key === 'extraSavings' ? 'slider featured' : 'slider'}>
                  <span className="row-between">
                    <span>{s.label}</span>
                    <span className="num strong">{formatSlider(s, a[s.key])}</span>
                  </span>
                  <input
                    type="range"
                    className="range"
                    min={s.min}
                    max={s.max}
                    step={s.step}
                    value={a[s.key]}
                    onChange={(e) => move(s.key, Number(e.target.value))}
                    style={{ '--fill': `${((a[s.key] - s.min) / (s.max - s.min)) * 100}%` } as React.CSSProperties}
                  />
                  {s.hint && <span className="caption">{s.hint}</span>}
                </label>
              ))}
          </div>
        </section>
      ))}

      <section className="stack-sm">
        <h2 className="section">Big purchases</h2>
        <div className="card list">
          {a.purchases.length === 0 && <p className="list-row muted">None planned.</p>}
          {a.purchases.map((p) => (
            <div key={p.id} className="list-row">
              <span className="grow">
                <span className="block">{p.label}</span>
                <span className="caption">{p.year}</span>
              </span>
              <span className="num">{exact(p.amount)}</span>
              <button className="icon-btn" aria-label={`Remove ${p.label}`} onClick={() => act('remove_big_purchase', { id: p.id })}>
                ×
              </button>
            </div>
          ))}
        </div>
        <p className="caption">To add a purchase, ask Claude: “Plan a $60k car in 2030.”</p>
      </section>

      <p className="caption">
        Chart: portfolio of {exact(netWorth)} in today's dollars, middle half of {plan.runs} simulated markets. Spending lasts
        to {a.planToAge} in {a.confidencePct}% of them. Slider changes save to the same plan Claude reads.
      </p>
    </div>
  )
}

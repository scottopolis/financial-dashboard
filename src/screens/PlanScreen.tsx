import { useEffect, useMemo, useRef, useState } from 'react'
import { formatSlider, planSliders, returnKeys, sliderValue, START_YEAR, type Assumptions, type SliderKey, type State } from '../model.ts'
import { exact, makePlan, netWorthOf } from '../plan.ts'
import type { Act } from '../api.ts'
import { FreedomCard } from './FreedomCard'

const groups = ['Savings and income', 'Goal', 'Markets'] as const

export function PlanScreen({ state, act }: { state: State; act: Act }) {
  // Slider moves show instantly from a local draft; they save through update_plan after a short pause,
  // the same tool the agent uses.
  // null sends a per-type return back to following the average return.
  type Draft = Partial<Record<SliderKey, number | null>>
  const [draft, setDraft] = useState<Draft>({})
  const pending = useRef<Draft>({})
  const timer = useRef<number | undefined>(undefined)
  // Leaving the page saves any slider move still waiting on its pause.
  const actRef = useRef(act)
  useEffect(() => {
    actRef.current = act
  }, [act])
  useEffect(
    () => () => {
      clearTimeout(timer.current)
      if (Object.keys(pending.current).length) actRef.current('update_plan', pending.current)
    },
    [],
  )

  const a = { ...state.assumptions, ...draft } as Assumptions
  const netWorth = netWorthOf(state.holdings)
  const key = JSON.stringify(a)
  const plan = useMemo(() => makePlan(JSON.parse(key), state.holdings, START_YEAR), [key, state.holdings])
  // Per-type returns show only for types you hold.
  const held = new Set<SliderKey>(plan.mix.filter((m) => m.sharePct > 0).map((m) => returnKeys[m.kind as keyof typeof returnKeys]))
  const move = (key: SliderKey, v: number | null) => {
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

  return (
    <div className="stack-lg">
      <FreedomCard plan={plan} assumptions={a} />

      {groups.map((g) => (
        <section key={g} className="stack-sm">
          <h2 className="section">{g}</h2>
          <div className="card sliders">
            {planSliders
              .filter((s) => s.group === g && (!s.defaultsToReturn || held.has(s.key)))
              .map((s) => {
                const v = sliderValue(a, s)
                const isDefault = s.defaultsToReturn && a[s.key] == null
                return (
                  <label key={s.key} className={s.key === 'extraSavings' ? 'slider featured' : 'slider'}>
                    <span className="row-between">
                      <span>{s.label}</span>
                      <span className="num strong">
                        {isDefault && <span className="muted">Default </span>}
                        {formatSlider(s, v)}
                      </span>
                    </span>
                    <input
                      type="range"
                      className="range"
                      min={s.min}
                      max={s.max}
                      step={s.step}
                      value={v}
                      onChange={(e) => move(s.key, Number(e.target.value))}
                      style={{ '--fill': `${((v - s.min) / (s.max - s.min)) * 100}%` } as React.CSSProperties}
                    />
                    {s.defaultsToReturn ? (
                      <span className="row-between caption">
                        <span>{isDefault ? 'Follows the average return.' : 'Yearly, before inflation.'}</span>
                        {!isDefault && (
                          <button type="button" className="link" onClick={() => move(s.key, null)}>
                            Use default
                          </button>
                        )}
                      </span>
                    ) : (
                      s.hint && <span className="caption">{s.hint}</span>
                    )}
                  </label>
                )
              })}
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
        Net worth {exact(netWorth)}. Slider changes save to the same plan Claude reads.
      </p>
    </div>
  )
}

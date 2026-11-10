import type { Assumptions } from './model.ts'

// Monte Carlo freedom plan. Every amount is in today's dollars: returns are made real by
// dividing out inflation, so spending stays constant in purchasing power.

const RUNS = 400
export const MAX_STOP = 20

export type Band = { low: number; mid: number; high: number }

// Seeded draws, so the same assumptions always give the same answer.
function draws(runs: number, years: number) {
  let seed = 20261110
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand())
  return Array.from({ length: runs }, () => Float64Array.from({ length: years }, gauss))
}

export function makePlan(a: Assumptions, netWorth: number, startYear: number) {
  const years = a.planToAge - a.currentAge
  const z = draws(RUNS, years)
  const nominal = a.returnPct / 100
  const vol = a.volatilityPct / 100
  const inflation = a.inflationPct / 100
  const ret = (run: number, i: number) => Math.max(-0.9, (1 + nominal + vol * z[run][i]) / (1 + inflation) - 1)

  // Money in (+) or out (−) in year i when you stop after `stop` years, before spending.
  const flow = (i: number, stop: number) => {
    let f = 0
    for (const p of a.purchases) if (startYear + i === p.year) f -= p.amount
    if (i < stop) f += a.savings + a.extraSavings
    else {
      if (i < stop + a.sideIncomeYears) f += a.sideIncome
      if (a.currentAge + i >= a.socialSecurityAge) f += a.socialSecurity
    }
    return f
  }

  // The largest constant yearly spend W that never runs out in this run. At the start of
  // retirement year k: B + Σ f_i / G_i ≥ W · Σ 1 / G_i, where G_i is growth since stopping.
  const maxSpend = (stop: number) => {
    const out = new Float64Array(RUNS)
    for (let run = 0; run < RUNS; run++) {
      let b = netWorth
      for (let i = 0; i < stop; i++) b = (b + flow(i, stop)) * (1 + ret(run, i))
      let growth = 1
      let flows = 0
      let annuity = 0
      let min = Infinity
      for (let i = stop; i < years; i++) {
        flows += flow(i, stop) / growth
        annuity += 1 / growth
        min = Math.min(min, (b + flows) / annuity)
        growth *= 1 + ret(run, i)
      }
      out[run] = Math.max(0, min)
    }
    return out.sort()
  }

  const spendRuns = Array.from({ length: MAX_STOP + 1 }, (_, stop) => maxSpend(stop))
  const spendByStop = spendRuns.map((s) => s[Math.floor((1 - a.confidencePct / 100) * RUNS)])

  // Portfolio balance by year: the middle half of runs and the median.
  const bands = (stop: number, spend: number): Band[] => {
    const cols = Array.from({ length: years + 1 }, () => new Float64Array(RUNS))
    for (let run = 0; run < RUNS; run++) {
      let b = netWorth
      cols[0][run] = b
      for (let i = 0; i < years; i++) {
        b = Math.max(0, b + flow(i, stop) - (i >= stop ? spend : 0)) * (1 + ret(run, i))
        cols[i + 1][run] = b
      }
    }
    const q = (c: Float64Array, k: number) => c.sort()[Math.floor(k * (RUNS - 1))]
    return cols.map((c) => ({ low: q(c, 0.25), mid: q(c, 0.5), high: q(c, 0.75) }))
  }

  return {
    runs: RUNS,
    startYear,
    /** Spending that lasts in `confidencePct` of markets, indexed by years until you stop. */
    spendByStop,
    /** Years until you can stop and spend `retireSpending`, or −1 if not within MAX_STOP. */
    freeAt: spendByStop.findIndex((s) => s >= a.retireSpending),
    /** Share of markets in which `retireSpending` lasts if you stop after `stop` years. */
    successAt: (stop: number) => spendRuns[stop].filter((s) => s >= a.retireSpending).length / RUNS,
    bands,
  }
}

export type Plan = ReturnType<typeof makePlan>

export const money = (v: number) =>
  v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : `$${Math.round(v / 1000).toLocaleString('en-US')}k`
export const exact = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`
export const signedPct = (pct: number) => `${pct < 0 ? '−' : '+'}${Math.abs(pct).toFixed(1)}%`
export const netWorthOf = (holdings: { value: number }[]) => holdings.reduce((s, h) => s + h.value, 0)

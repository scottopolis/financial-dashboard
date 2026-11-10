import { assetKinds, returnKeys, type Assumptions, type Holding } from './model.ts'

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

/**
 * How the plan grows each portfolio type: its share of the portfolio and its yearly return, both in percent.
 * Cash earns its holdings' value-weighted APY; other types use their own return when set, else returnPct.
 */
export function returnMix(a: Assumptions, holdings: Holding[]) {
  const net = netWorthOf(holdings)
  return assetKinds.map((kind) => {
    const hs = holdings.filter((h) => h.kind === kind)
    const total = netWorthOf(hs)
    const own = kind === 'Cash' ? undefined : a[returnKeys[kind]]
    return {
      kind,
      sharePct: net > 0 ? (total / net) * 100 : 0,
      returnPct:
        kind === 'Cash'
          ? total > 0
            ? hs.reduce((t, h) => t + h.value * (h.interestPct ?? 0), 0) / total
            : 0
          : (own ?? a.returnPct),
      /** False when the type follows returnPct. */
      custom: own != null,
    }
  })
}

export function makePlan(a: Assumptions, holdings: Holding[], startYear: number) {
  const netWorth = netWorthOf(holdings)
  const years = a.planToAge - a.currentAge
  const z = draws(RUNS, years)
  const vol = a.volatilityPct / 100
  const inflation = a.inflationPct / 100
  // Each type grows at its own return, and the mix stays as it is today. Cash has no swings; the
  // rest share one market draw, so their blend is a weighted average return with volatilityPct swings.
  const mix = returnMix(a, holdings)
  const cash = mix.find((m) => m.kind === 'Cash')!
  const c = cash.sharePct / 100
  const cashReal = (1 + cash.returnPct / 100) / (1 + inflation) - 1
  const nominal = c < 1 ? mix.reduce((t, m) => t + (m.kind === 'Cash' ? 0 : m.sharePct * m.returnPct), 0) / 100 / 100 / (1 - c) : 0
  const ret = (run: number, i: number) =>
    Math.max(-0.9, (1 - c) * ((1 + nominal + vol * z[run][i]) / (1 + inflation) - 1) + c * cashReal)

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
    const atStop = new Float64Array(RUNS)
    for (let run = 0; run < RUNS; run++) {
      let b = netWorth
      for (let i = 0; i < stop; i++) b = (b + flow(i, stop)) * (1 + ret(run, i))
      atStop[run] = Math.max(0, b)
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
    return { spends: out, atStop }
  }

  const sims = Array.from({ length: MAX_STOP + 1 }, (_, stop) => maxSpend(stop))
  const spendRuns = sims.map((s) => Float64Array.from(s.spends).sort())
  const medianAtStop = sims.map((s) => Float64Array.from(s.atStop).sort()[RUNS >> 1])
  /** Share of runs in which spending w a year lasts if you stop after `stop` years. */
  const lasts = (stop: number, w: number) => spendRuns[stop].filter((s) => s >= w).length / RUNS
  const rate = (a.withdrawalPct ?? 0) / 100
  const confidence = a.confidencePct / 100
  // With a withdrawal rate, each simulated market withdraws that share of its own portfolio when you
  // stop, as the 4% rule does. Shown spending is the typical (median) withdrawal.
  // In auto mode, spending is the most that lasts in confidencePct of markets.
  const share = (stop: number, ok: (w: number, max: number) => boolean) =>
    sims[stop].spends.filter((max, run) => ok(rate * sims[stop].atStop[run], max)).length / RUNS
  const spendByStop = sims.map((_, stop) => (rate ? rate * medianAtStop[stop] : spendRuns[stop][Math.floor((1 - confidence) * RUNS)]))
  const lastsAt = (stop: number) => (rate ? share(stop, (w, max) => w <= max) : lasts(stop, spendByStop[stop]))

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
    /** Each portfolio type's share of the portfolio and the yearly return the plan grows it at, in percent. */
    mix,
    /** Withdrawal rate in percent, or 0 in auto mode. */
    withdrawalPct: a.withdrawalPct ?? 0,
    /** Median portfolio in today's dollars when you stop, indexed by years until you stop. */
    portfolioAtStop: medianAtStop,
    /** Spending that lasts in `confidencePct` of markets, indexed by years until you stop. */
    spendByStop,
    /** Years until you can stop and spend `retireSpending`, or −1 if not within MAX_STOP. */
    /** With a withdrawal rate: the first stop where, in `confidencePct` of markets, the withdrawal covers the target and lasts. */
    freeAt: rate
      ? spendByStop.findIndex((_, stop) => share(stop, (w, max) => w >= a.retireSpending && w <= max) >= confidence)
      : spendByStop.findIndex((s) => s >= a.retireSpending),
    /** Share of markets in which `retireSpending` lasts if you stop after `stop` years. */
    successAt: (stop: number) => lasts(stop, a.retireSpending),
    /** Share of markets in which spendByStop[stop] lasts. */
    lastsAt,
    bands,
  }
}

export type Plan = ReturnType<typeof makePlan>

export const money = (v: number) =>
  v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : `$${Math.round(v / 1000).toLocaleString('en-US')}k`
export const exact = (v: number) => `${v < -0.5 ? '−' : ''}$${Math.abs(Math.round(v)).toLocaleString('en-US')}`
export const signedPct = (pct: number) => `${pct < 0 ? '−' : '+'}${Math.abs(pct).toFixed(1)}%`
export const netWorthOf = (holdings: { value: number }[]) => holdings.reduce((s, h) => s + h.value, 0)

// The app's data model, shared by the web app and the agent server.
// Percentages are stored as percent numbers (7.5 means 7.5%) so agents can set them directly.

/** A portfolio's type, which decides how its holdings are valued. */
export type AssetKind = 'Stocks' | 'Crypto' | 'Alternatives' | 'Cash'
export const assetKinds: AssetKind[] = ['Stocks', 'Crypto', 'Alternatives', 'Cash']
export const kindInfo: Record<AssetKind, string> = {
  Stocks: 'stocks, ETFs, and funds by ticker and shares; priced daily',
  Crypto: 'coins by symbol and amount; priced daily',
  Alternatives: 'syndications, real estate, private funds; you enter the value',
  Cash: 'savings and checking; you enter the balance, and interest accrues daily at its APY',
}
export const isPriced = (k: AssetKind) => k === 'Stocks' || k === 'Crypto'

/** A group of holdings, such as Stocks or Real estate. */
export type Portfolio = { id: string; name: string; kind: AssetKind }

export type Distribution = { date: string; amount: number }

export type Holding = {
  id: string
  name: string
  portfolioId: string
  /** The portfolio's type, copied when the holding is added. */
  kind: AssetKind
  /** Current value in dollars. For priced holdings this is quantity × price. */
  value: number
  costBasis: number
  /** Ticker, quantity, and last price for stocks and crypto. */
  symbol?: string
  quantity?: number
  price?: number
  /** Today's price change in percent; null for manually valued holdings. */
  dayChangePct: number | null
  /** Date (YYYY-MM-DD) of the last manual valuation. */
  valuedOn?: string
  distributions: Distribution[]
  note?: string
  /** Yearly interest (APY, in percent) that accrues daily into value. Cash holdings only. */
  interestPct?: number
  /** Date (YYYY-MM-DD) interest has been added through, and the total added so far. */
  accruedOn?: string
  interestEarned?: number
}

export type Purchase = { id: string; label: string; year: number; amount: number }

export type Assumptions = {
  currentAge: number
  /** Yearly spending in retirement, in today's dollars. */
  retireSpending: number
  /** Share of the portfolio withdrawn each year after you stop, in percent. 0 means auto: the most that lasts at confidencePct. */
  withdrawalPct: number
  planToAge: number
  /** Share of simulated markets in which the money must last, in percent. */
  confidencePct: number
  /** Yearly return before inflation for every portfolio type without its own return below. */
  returnPct: number
  /** Optional returns for one portfolio type; unset means returnPct. Cash grows at its holdings' APY instead. */
  stocksReturnPct?: number
  cryptoReturnPct?: number
  alternativesReturnPct?: number
  volatilityPct: number
  inflationPct: number
  /** Saved each year until you stop working. */
  savings: number
  /** Saved each year on top of `savings`, until you stop working. */
  extraSavings: number
  /** Income after you stop, such as consulting, for `sideIncomeYears` years. */
  sideIncome: number
  sideIncomeYears: number
  socialSecurity: number
  socialSecurityAge: number
  purchases: Purchase[]
}

export type Change = { at: string; by: string; text: string; key?: string }

export type State = {
  portfolios: Portfolio[]
  holdings: Holding[]
  assumptions: Assumptions
  changes: Change[]
  /** Last time the price feed ran. */
  pricesUpdatedAt?: string
  /** Last time an agent called the connector. */
  agentSeenAt?: string
  /** Net worth at the end of each day, oldest first. */
  history?: { date: string; value: number }[]
}

export const START_YEAR = new Date().getFullYear()

export type SliderKey = Exclude<keyof Assumptions, 'purchases'>
export type SliderSpec = {
  key: SliderKey
  label: string
  group: 'Savings and income' | 'Goal' | 'Markets'
  min: number
  max: number
  step: number
  unit: '$/yr' | '%' | 'yrs' | 'age'
  hint?: string
  /** Unset means it follows returnPct. Set it to null to go back to that default. */
  defaultsToReturn?: true
}

/** The plan's return for each portfolio type other than cash, which grows at its own APY. */
export const returnKeys = { Stocks: 'stocksReturnPct', Crypto: 'cryptoReturnPct', Alternatives: 'alternativesReturnPct' } as const
export type ReturnKind = keyof typeof returnKeys

/** A slider's current value; per-type returns fall back to returnPct. */
export const sliderValue = (a: Assumptions, s: Pick<SliderSpec, 'key' | 'defaultsToReturn'>) => a[s.key] ?? (s.defaultsToReturn ? a.returnPct : 0)

/** Every plan assumption the app shows as a slider. The agent's update_plan tool uses the same list and ranges. */
export const planSliders: SliderSpec[] = [
  { key: 'extraSavings', label: 'Save an extra', group: 'Savings and income', min: 0, max: 100000, step: 1000, unit: '$/yr', hint: 'On top of your current savings, until you stop' },
  { key: 'savings', label: 'Current savings', group: 'Savings and income', min: 0, max: 300000, step: 5000, unit: '$/yr', hint: 'What you save each year now' },
  { key: 'sideIncome', label: 'Extra income after you stop', group: 'Savings and income', min: 0, max: 150000, step: 1000, unit: '$/yr', hint: 'Consulting, rentals, part-time work' },
  { key: 'sideIncomeYears', label: 'Extra income lasts', group: 'Savings and income', min: 0, max: 30, step: 1, unit: 'yrs' },
  { key: 'socialSecurity', label: 'Social Security', group: 'Savings and income', min: 0, max: 60000, step: 1000, unit: '$/yr' },
  { key: 'socialSecurityAge', label: 'Social Security starts at', group: 'Savings and income', min: 62, max: 70, step: 1, unit: 'age' },
  { key: 'retireSpending', label: 'Spending in retirement', group: 'Goal', min: 20000, max: 300000, step: 5000, unit: '$/yr', hint: "In today's dollars" },
  { key: 'withdrawalPct', label: 'Withdrawal rate', group: 'Goal', min: 0, max: 8, step: 0.5, unit: '%', hint: 'Share of your portfolio you take out each year after you stop. Auto finds the most that lasts at your confidence.' },
  { key: 'currentAge', label: 'Current age', group: 'Goal', min: 18, max: 55, step: 1, unit: 'age' },
  { key: 'planToAge', label: 'Money lasts until', group: 'Goal', min: 80, max: 105, step: 1, unit: 'age' },
  { key: 'confidencePct', label: 'Confidence', group: 'Goal', min: 50, max: 99, step: 1, unit: '%', hint: 'Share of simulated markets where the money lasts' },
  { key: 'returnPct', label: 'Average return', group: 'Markets', min: 0, max: 12, step: 0.25, unit: '%', hint: 'Yearly, before inflation. Used for every portfolio type without its own return. Cash grows at its own APY instead.' },
  ...(Object.entries(returnKeys) as [ReturnKind, SliderKey][]).map(([kind, key]): SliderSpec => ({
    key,
    label: `${kind} return`,
    group: 'Markets',
    min: 0,
    max: 20,
    step: 0.25,
    unit: '%',
    hint: `Yearly, before inflation, for ${kind} portfolios. Follows the average return until you set it.`,
    defaultsToReturn: true,
  })),
  { key: 'volatilityPct', label: 'Yearly swings', group: 'Markets', min: 0, max: 30, step: 1, unit: '%', hint: 'Standard deviation; a stock index is about 15%' },
  { key: 'inflationPct', label: 'Inflation', group: 'Markets', min: 0, max: 8, step: 0.25, unit: '%' },
]

export function formatSlider(s: Pick<SliderSpec, 'unit' | 'key'>, v: number) {
  if (s.key === 'withdrawalPct' && !v) return 'Auto'
  if (s.unit === '$/yr') return `$${Math.round(v).toLocaleString('en-US')}/yr`
  if (s.unit === '%') return `${+v.toFixed(2)}%`
  if (s.unit === 'yrs') return `${v} ${v === 1 ? 'year' : 'years'}`
  return `${v}`
}

export function describe(h: Holding) {
  if (h.symbol && h.quantity !== undefined)
    return `${h.symbol}, ${h.quantity.toLocaleString('en-US')} ${h.kind === 'Crypto' ? h.symbol : 'sh'}`
  if (h.interestPct) return `${+h.interestPct.toFixed(2)}% APY, interest added daily`
  if (h.valuedOn) return `${h.kind === 'Cash' ? 'Cash' : 'Manual'}, valued ${shortDate(h.valuedOn)}`
  return h.kind
}

export const shortDate = (iso: string) =>
  new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

export function ago(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  if (min < 60 * 24) return `${Math.round(min / 60)} h ago`
  return `${Math.round(min / 1440)} days ago`
}

/** Twelve monthly values ending at today's value, a stand-in until price history is stored. */
export function valueHistory(h: Holding): number[] {
  if (h.dayChangePct === null) return Array.from({ length: 12 }, (_, i) => (i < 7 ? h.costBasis : h.value))
  let seed = [...h.id].reduce((s, c) => (s * 31 + c.charCodeAt(0)) % 2147483648, 7)
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
  const swing = h.kind === 'Crypto' ? 0.12 : 0.04
  const out = [h.value]
  for (let i = 0; i < 11; i++) out.unshift(out[0] / (1 + 0.01 + swing * (rand() - 0.5) * 2))
  return out
}

export const today = () => new Date().toISOString().slice(0, 10)

/** Adds interest earned since the last accrual to every holding with an APY. Returns whether anything changed. */
export function accrueInterest(s: State, on = today()) {
  let changed = false
  for (const h of s.holdings) {
    if (!h.interestPct || h.kind !== 'Cash') continue
    const from = h.accruedOn ?? h.valuedOn ?? on
    const days = (Date.parse(on) - Date.parse(from)) / 86400000
    if (days <= 0) continue
    const next = h.value * Math.pow(1 + h.interestPct / 100, days / 365)
    h.interestEarned = (h.interestEarned ?? 0) + next - h.value
    h.value = next
    h.accruedOn = on
    changed = true
  }
  return changed
}

export const defaultPortfolios: Portfolio[] = assetKinds.map((kind) => ({ id: kind.toLowerCase(), name: kind, kind }))

/** Records today's net worth in the daily history. Returns whether anything changed. */
export function recordHistory(s: State, on = today()) {
  const value = Math.round(s.holdings.reduce((t, h) => t + h.value, 0))
  s.history ??= []
  const last = s.history[s.history.length - 1]
  if (last?.date === on) {
    if (last.value === value) return false
    last.value = value
  } else s.history.push({ date: on, value })
  return true
}

/** Brings data saved by older versions up to date. Returns whether anything changed. */
export function migrate(s: State) {
  let changed = false
  if (s.assumptions.withdrawalPct === undefined) {
    s.assumptions.withdrawalPct = 0
    changed = true
  }
  if (!s.portfolios) {
    s.portfolios = structuredClone(defaultPortfolios)
    changed = true
  }
  for (const h of s.holdings)
    if (h.interestPct !== undefined && h.kind !== 'Cash') {
      delete h.interestPct
      changed = true
    }
  for (const h of s.holdings)
    if (!h.portfolioId) {
      h.portfolioId = s.portfolios.find((p) => p.kind === h.kind)!.id
      changed = true
    }
  return changed
}

const daysAgo = (d: number) => new Date(Date.now() - d * 86400000).toISOString()

export const defaultAssumptions: Assumptions = {
  currentAge: 42,
  retireSpending: 80000,
  withdrawalPct: 0,
  planToAge: 95,
  confidencePct: 85,
  returnPct: 7.5,
  volatilityPct: 14,
  inflationPct: 3,
  savings: 70000,
  extraSavings: 0,
  sideIncome: 20000,
  sideIncomeYears: 5,
  socialSecurity: 28000,
  socialSecurityAge: 67,
  purchases: [{ id: 'college', label: 'College', year: 2034, amount: 80000 }],
}

/** Sample data the server starts with until real holdings are added. */
export const sampleState: State = {
  portfolios: defaultPortfolios,
  holdings: [
    { id: 'vti', portfolioId: 'stocks', name: 'Vanguard Total Market', kind: 'Stocks', symbol: 'VTI', quantity: 1320, price: 312.58, value: 412605.6, costBasis: 301000, dayChangePct: 0.4, distributions: [] },
    { id: 'aapl', portfolioId: 'stocks', name: 'Apple', kind: 'Stocks', symbol: 'AAPL', quantity: 160, price: 240, value: 38400, costBasis: 22100, dayChangePct: -0.8, distributions: [] },
    { id: 'btc', portfolioId: 'crypto', name: 'Bitcoin', kind: 'Crypto', symbol: 'BTC', quantity: 0.85, price: 96000, value: 81600, costBasis: 41000, dayChangePct: 2.1, distributions: [] },
    { id: 'eth', portfolioId: 'crypto', name: 'Ethereum', kind: 'Crypto', symbol: 'ETH', quantity: 5.2, price: 3404, value: 17700.8, costBasis: 14300, dayChangePct: 1.6, distributions: [] },
    {
      id: 'austin-multifamily',
      portfolioId: 'alternatives',
      name: 'Austin multifamily',
      kind: 'Alternatives',
      value: 100000,
      costBasis: 100000,
      dayChangePct: null,
      valuedOn: '2026-09-30',
      distributions: [
        { date: '2026-11-10', amount: 2250 },
        { date: '2026-08-10', amount: 2250 },
        { date: '2026-05-10', amount: 2000 },
        { date: '2026-02-10', amount: 2000 },
      ],
      note: 'Real estate syndication. 5-year hold, 1.6x target multiple. Sponsor sends quarterly statements.',
    },
    {
      id: 'self-storage-fund',
      portfolioId: 'alternatives',
      name: 'Self-storage fund',
      kind: 'Alternatives',
      value: 50000,
      costBasis: 50000,
      dayChangePct: null,
      valuedOn: '2026-06-30',
      distributions: [
        { date: '2026-10-01', amount: 875 },
        { date: '2026-07-01', amount: 875 },
      ],
    },
    { id: 'savings', portfolioId: 'cash', name: 'High-yield savings', kind: 'Cash', value: 42000, costBasis: 42000, dayChangePct: null, valuedOn: '2026-11-01', interestPct: 4.1, accruedOn: '2026-11-01', distributions: [] },
  ],
  assumptions: defaultAssumptions,
  changes: [
    { at: daysAgo(0.08), by: 'Claude', text: 'logged a $2,250 distribution from Austin multifamily' },
    { at: daysAgo(1), by: 'Claude', text: 'set College to $80,000 in 2034' },
    { at: daysAgo(1.3), by: 'Price feed', text: 'updated 4 prices' },
  ],
}

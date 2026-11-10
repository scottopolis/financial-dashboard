// The app's data model, shared by the web app and the agent server.
// Percentages are stored as percent numbers (7.5 means 7.5%) so agents can set them directly.

export type AssetKind = 'Stocks' | 'Crypto' | 'Alternatives' | 'Cash'
export const assetKinds: AssetKind[] = ['Stocks', 'Crypto', 'Alternatives', 'Cash']

export type Distribution = { date: string; amount: number }

export type Holding = {
  id: string
  name: string
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
}

export type Purchase = { id: string; label: string; year: number; amount: number }

export type Assumptions = {
  currentAge: number
  /** Yearly spending in retirement, in today's dollars. */
  retireSpending: number
  planToAge: number
  /** Share of simulated markets in which the money must last, in percent. */
  confidencePct: number
  returnPct: number
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
  holdings: Holding[]
  assumptions: Assumptions
  changes: Change[]
  /** Last time an agent called the connector. */
  agentSeenAt?: string
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
}

/** Every plan assumption the app shows as a slider. The agent's update_plan tool uses the same list and ranges. */
export const planSliders: SliderSpec[] = [
  { key: 'extraSavings', label: 'Save an extra', group: 'Savings and income', min: 0, max: 100000, step: 1000, unit: '$/yr', hint: 'On top of your current savings, until you stop' },
  { key: 'savings', label: 'Current savings', group: 'Savings and income', min: 0, max: 300000, step: 5000, unit: '$/yr', hint: 'What you save each year now' },
  { key: 'sideIncome', label: 'Extra income after you stop', group: 'Savings and income', min: 0, max: 150000, step: 1000, unit: '$/yr', hint: 'Consulting, rentals, part-time work' },
  { key: 'sideIncomeYears', label: 'Extra income lasts', group: 'Savings and income', min: 0, max: 30, step: 1, unit: 'yrs' },
  { key: 'socialSecurity', label: 'Social Security', group: 'Savings and income', min: 0, max: 60000, step: 1000, unit: '$/yr' },
  { key: 'socialSecurityAge', label: 'Social Security starts at', group: 'Savings and income', min: 62, max: 70, step: 1, unit: 'age' },
  { key: 'retireSpending', label: 'Spending in retirement', group: 'Goal', min: 20000, max: 300000, step: 5000, unit: '$/yr', hint: "In today's dollars" },
  { key: 'currentAge', label: 'Current age', group: 'Goal', min: 18, max: 55, step: 1, unit: 'age' },
  { key: 'planToAge', label: 'Money lasts until', group: 'Goal', min: 80, max: 105, step: 1, unit: 'age' },
  { key: 'confidencePct', label: 'Confidence', group: 'Goal', min: 50, max: 99, step: 1, unit: '%', hint: 'Share of simulated markets where the money lasts' },
  { key: 'returnPct', label: 'Average return', group: 'Markets', min: 0, max: 12, step: 0.25, unit: '%', hint: 'Yearly, before inflation' },
  { key: 'volatilityPct', label: 'Yearly swings', group: 'Markets', min: 0, max: 30, step: 1, unit: '%', hint: 'Standard deviation; a stock index is about 15%' },
  { key: 'inflationPct', label: 'Inflation', group: 'Markets', min: 0, max: 8, step: 0.25, unit: '%' },
]

export function formatSlider(s: Pick<SliderSpec, 'unit'>, v: number) {
  if (s.unit === '$/yr') return `$${Math.round(v).toLocaleString('en-US')}/yr`
  if (s.unit === '%') return `${+v.toFixed(2)}%`
  if (s.unit === 'yrs') return `${v} ${v === 1 ? 'year' : 'years'}`
  return `${v}`
}

export function describe(h: Holding) {
  if (h.symbol && h.quantity !== undefined)
    return `${h.symbol}, ${h.quantity.toLocaleString('en-US')} ${h.kind === 'Crypto' ? h.symbol : 'sh'}`
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

const daysAgo = (d: number) => new Date(Date.now() - d * 86400000).toISOString()

export const defaultAssumptions: Assumptions = {
  currentAge: 42,
  retireSpending: 80000,
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
  holdings: [
    { id: 'vti', name: 'Vanguard Total Market', kind: 'Stocks', symbol: 'VTI', quantity: 1320, price: 312.58, value: 412605.6, costBasis: 301000, dayChangePct: 0.4, distributions: [] },
    { id: 'aapl', name: 'Apple', kind: 'Stocks', symbol: 'AAPL', quantity: 160, price: 240, value: 38400, costBasis: 22100, dayChangePct: -0.8, distributions: [] },
    { id: 'btc', name: 'Bitcoin', kind: 'Crypto', symbol: 'BTC', quantity: 0.85, price: 96000, value: 81600, costBasis: 41000, dayChangePct: 2.1, distributions: [] },
    { id: 'eth', name: 'Ethereum', kind: 'Crypto', symbol: 'ETH', quantity: 5.2, price: 3404, value: 17700.8, costBasis: 14300, dayChangePct: 1.6, distributions: [] },
    {
      id: 'austin-multifamily',
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
    { id: 'savings', name: 'Savings', kind: 'Cash', value: 42000, costBasis: 42000, dayChangePct: null, valuedOn: '2026-11-01', distributions: [], note: 'High-yield savings, 4.1% APY.' },
  ],
  assumptions: defaultAssumptions,
  changes: [
    { at: daysAgo(0.08), by: 'Claude', text: 'logged a $2,250 distribution from Austin multifamily' },
    { at: daysAgo(1), by: 'Claude', text: 'set College to $80,000 in 2034' },
    { at: daysAgo(1.3), by: 'Price feed', text: 'updated 4 prices' },
  ],
}

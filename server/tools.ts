import { z } from 'zod'
import {
  assetKinds,
  formatSlider,
  planSliders,
  START_YEAR,
  type Assumptions,
  type Holding,
  type SliderKey,
  type State,
} from '../src/model.ts'
import { exact, makePlan, MAX_STOP, netWorthOf } from '../src/plan.ts'
import { getState, save } from './store.ts'
import { fetchQuote } from './prices.ts'

// Every action on the data, used by both the agent (over MCP) and the web app (over /api/tools).
// Each tool returns plain text written for an agent to read.

type Tool = { name: string; description: string; input: z.ZodRawShape; run: (args: never, by: string) => string | Promise<string> }

function tool<S extends z.ZodRawShape>(t: {
  name: string
  description: string
  input: S
  run: (args: z.infer<z.ZodObject<S>>, by: string) => string | Promise<string>
}): Tool {
  return t as unknown as Tool
}

const today = () => new Date().toISOString().slice(0, 10)
const pct = (v: number) => `${Math.round(v * 100)}%`

/** Records a change for the activity feed. Repeated edits of the same thing by the same actor merge. */
function log(s: State, by: string, text: string, key?: string) {
  const last = s.changes[0]
  const recent = last && Date.now() - new Date(last.at).getTime() < 10 * 60000
  if (key && recent && last.by === by && last.key === key) s.changes.shift()
  s.changes.unshift({ at: new Date().toISOString(), by, text, key })
  s.changes.length = Math.min(s.changes.length, 200)
}

function freedomLine(a: Assumptions, netWorth: number) {
  const p = makePlan(a, netWorth, START_YEAR)
  if (p.freeAt >= 0)
    return `Free to stop working in ${START_YEAR + p.freeAt} (in ${p.freeAt} years, at age ${a.currentAge + p.freeAt}), spending ${exact(a.retireSpending)}/yr until age ${a.planToAge} in ${a.confidencePct}% of simulated markets.`
  return `Not free within ${MAX_STOP} years at ${exact(a.retireSpending)}/yr. Stopping in ${START_YEAR + MAX_STOP} supports ${exact(p.spendByStop[MAX_STOP])}/yr in ${a.confidencePct}% of markets.`
}

function planDetail(a: Assumptions, netWorth: number) {
  const p = makePlan(a, netWorth, START_YEAR)
  const rows = p.spendByStop.map(
    (s, i) =>
      `| ${START_YEAR + i} | ${a.currentAge + i} | ${exact(s)} | ${pct(p.successAt(i))} |`,
  )
  return [
    freedomLine(a, netWorth),
    '',
    `By the year you stop working: the yearly spending that lasts in ${a.confidencePct}% of markets, and the chance ${exact(a.retireSpending)}/yr lasts.`,
    '',
    '| Stop in | Age | Spending that lasts | Chance target lasts |',
    '| --- | --- | --- | --- |',
    ...rows,
  ].join('\n')
}

function assumptionsText(a: Assumptions) {
  return [
    ...planSliders.map((s) => `- ${s.key}: ${formatSlider(s, a[s.key])} (${s.label}; range ${s.min}–${s.max})`),
    '',
    'Big purchases (one-time costs, in today\'s dollars):',
    ...(a.purchases.length ? a.purchases.map((p) => `- ${p.id}: ${p.label}, ${exact(p.amount)} in ${p.year}`) : ['- none']),
  ].join('\n')
}

export function overview(s: State = getState()) {
  const net = netWorthOf(s.holdings)
  const todayChange = s.holdings.reduce(
    (t, h) => t + (h.dayChangePct ? (h.value * h.dayChangePct) / (100 + h.dayChangePct) : 0),
    0,
  )
  const alloc = assetKinds
    .map((k) => ({ k, v: netWorthOf(s.holdings.filter((h) => h.kind === k)) }))
    .filter((x) => x.v > 0)
    .map((x) => `- ${x.k}: ${exact(x.v)} (${pct(x.v / net)})`)
  const rows = s.holdings.map((h) => {
    const detail = h.symbol ? `${h.quantity} ${h.symbol} at ${exact(h.price ?? 0)}` : `valued ${h.valuedOn ?? 'never'}`
    const paid = h.distributions.reduce((t, d) => t + d.amount, 0)
    return `| ${h.id} | ${h.name} | ${h.kind} | ${exact(h.value)} | ${exact(h.costBasis)} | ${exact(h.value - h.costBasis)} | ${h.dayChangePct === null ? 'manual' : h.dayChangePct.toFixed(2) + '%'} | ${paid ? exact(paid) : '—'} | ${detail} |`
  })
  const dists = s.holdings
    .flatMap((h) => h.distributions.map((d) => ({ ...d, name: h.name })))
    .sort((x, y) => y.date.localeCompare(x.date))
    .map((d) => `- ${d.date}: ${exact(d.amount)} from ${d.name}`)
  const notes = s.holdings.filter((h) => h.note).map((h) => `- ${h.name}: ${h.note}`)
  return [
    `# Portfolio and freedom plan, as of ${today()}`,
    '',
    `Net worth: ${exact(net)} (${todayChange >= 0 ? '+' : '−'}${exact(Math.abs(todayChange))} today).`,
    `Stock and crypto prices from Yahoo Finance, last updated ${s.pricesUpdatedAt ? s.pricesUpdatedAt.slice(0, 16).replace('T', ' ') + ' UTC' : 'never'}. Alternatives and cash are valued manually.`,
    '',
    '## Allocation',
    ...alloc,
    '',
    '## Holdings',
    '| id | name | kind | value | cost basis | gain | today | distributions | detail |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
    '## Freedom plan',
    planDetail(s.assumptions, net),
    '',
    '## Plan assumptions (change with update_plan)',
    'All plan amounts are in today\'s dollars. Returns are simulated 400 times with the given average and yearly swings.',
    assumptionsText(s.assumptions),
    '',
    '## Distributions',
    ...(dists.length ? dists : ['- none']),
    ...(notes.length ? ['', '## Notes', ...notes] : []),
    '',
    '## Recent changes',
    ...s.changes.slice(0, 15).map((c) => `- ${c.at.slice(0, 16).replace('T', ' ')} ${c.by} ${c.text}`),
  ].join('\n')
}

const sliderShape = Object.fromEntries(
  planSliders.map((s) => [
    s.key,
    z
      .number()
      .min(s.min)
      .max(s.max)
      .optional()
      .describe(`${s.label}${s.hint ? ` (${s.hint})` : ''}. Unit: ${s.unit}.`),
  ]),
) as Record<SliderKey, z.ZodOptional<z.ZodNumber>>

const kind = z.enum(assetKinds as [string, ...string[]])

function slug(s: State, name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item'
  let id = base
  for (let n = 2; s.holdings.some((h) => h.id === id) || s.assumptions.purchases.some((p) => p.id === id); n++) id = `${base}-${n}`
  return id
}

function findHolding(s: State, id: string) {
  const h = s.holdings.find((x) => x.id === id)
  if (!h) throw new Error(`No holding with id "${id}". Ids: ${s.holdings.map((x) => x.id).join(', ')}`)
  return h
}

export const tools: Tool[] = [
  tool({
    name: 'get_overview',
    description:
      'Everything in the dashboard as one Markdown report: net worth, allocation, every holding with value, cost basis, gain and distributions, the freedom plan (when you can stop working and how much you can spend), every plan assumption with its allowed range, big purchases, and recent changes. Call this first to answer any question.',
    input: {},
    run: () => overview(),
  }),
  tool({
    name: 'get_plan',
    description:
      'The freedom plan by stop year: for each year you could stop working in the next 20 years, the yearly spending that lasts and the chance the target spending lasts. Pass whatIf to try different assumptions without saving them, such as { "extraSavings": 20000 } to see the effect of saving $20k more a year.',
    input: {
      whatIf: z.object(sliderShape).partial().optional().describe('Assumptions to try without saving. Same keys and units as update_plan.'),
    },
    run: ({ whatIf }) => {
      const s = getState()
      const net = netWorthOf(s.holdings)
      if (!whatIf || !Object.keys(whatIf).length) return planDetail(s.assumptions, net)
      const tried = { ...s.assumptions, ...whatIf }
      return `Current plan: ${freedomLine(s.assumptions, net)}\n\nWith ${Object.entries(whatIf).map(([k, v]) => `${k} = ${v}`).join(', ')} (not saved):\n${planDetail(tried, net)}`
    },
  }),
  tool({
    name: 'update_plan',
    description:
      'Change plan assumptions and save them. These are the same values the sliders on the Plan page show, with the same ranges. Pass only the ones to change. Dollar amounts are per year in today\'s dollars; percentages are percent numbers, so 6.5 means 6.5%.',
    input: sliderShape,
    run: (args, by) => {
      const s = getState()
      const changed = planSliders.filter((p) => args[p.key] !== undefined && args[p.key] !== s.assumptions[p.key])
      if (!changed.length) return 'Nothing changed.\n' + freedomLine(s.assumptions, netWorthOf(s.holdings))
      for (const p of changed) s.assumptions[p.key] = args[p.key]!
      log(s, by, `set ${changed.map((p) => `${p.label.toLowerCase()} to ${formatSlider(p, s.assumptions[p.key])}`).join(', ')}`, 'plan:' + changed.map((p) => p.key).join(','))
      save()
      return `Saved. ${freedomLine(s.assumptions, netWorthOf(s.holdings))}`
    },
  }),
  tool({
    name: 'set_big_purchase',
    description:
      'Add or change a planned one-time expense, such as a house, car, or college, in today\'s dollars. Omit id to add a new one; pass an existing id to change it.',
    input: {
      id: z.string().optional().describe('Id of an existing purchase to change.'),
      label: z.string().optional(),
      year: z.number().int().min(START_YEAR).max(START_YEAR + 60).optional(),
      amount: z.number().min(0).optional().describe('Cost in dollars.'),
    },
    run: ({ id, label, year, amount }, by) => {
      const s = getState()
      let p = id ? s.assumptions.purchases.find((x) => x.id === id) : undefined
      if (id && !p) throw new Error(`No purchase with id "${id}".`)
      if (!p) {
        if (!label || year === undefined || amount === undefined) throw new Error('A new purchase needs label, year, and amount.')
        p = { id: slug(s, label), label, year, amount }
        s.assumptions.purchases.push(p)
      } else Object.assign(p, { label: label ?? p.label, year: year ?? p.year, amount: amount ?? p.amount })
      log(s, by, `set ${p.label} to ${exact(p.amount)} in ${p.year}`, 'purchase:' + p.id)
      save()
      return `Saved purchase ${p.id}. ${freedomLine(s.assumptions, netWorthOf(s.holdings))}`
    },
  }),
  tool({
    name: 'remove_big_purchase',
    description: 'Remove a planned one-time expense by id.',
    input: { id: z.string() },
    run: ({ id }, by) => {
      const s = getState()
      const p = s.assumptions.purchases.find((x) => x.id === id)
      if (!p) throw new Error(`No purchase with id "${id}".`)
      s.assumptions.purchases = s.assumptions.purchases.filter((x) => x !== p)
      log(s, by, `removed ${p.label}`)
      save()
      return `Removed ${p.label}. ${freedomLine(s.assumptions, netWorthOf(s.holdings))}`
    },
  }),
  tool({
    name: 'add_holding',
    description:
      'Add an investment. For stocks, funds, and crypto pass symbol and quantity; the current price is looked up (pass price only to override it), and it updates daily after that. For alternatives such as real estate syndications, and for cash, pass value.',
    input: {
      name: z.string(),
      kind,
      symbol: z.string().optional(),
      quantity: z.number().positive().optional(),
      price: z.number().positive().optional().describe('Price per share or coin. Omit to look it up.'),
      value: z.number().min(0).optional().describe('Current value, for holdings without a price.'),
      costBasis: z.number().min(0).optional().describe('Total amount invested. Defaults to the current value.'),
      note: z.string().optional(),
    },
    run: async (a, by) => {
      const priced = a.symbol !== undefined
      if (priced && a.quantity === undefined) throw new Error('A holding with a symbol needs quantity.')
      let dayChangePct = 0
      if (priced && a.price === undefined) {
        const q = await fetchQuote(a.symbol!.toUpperCase(), a.kind as Holding['kind']).catch((e) => {
          throw new Error(`${e.message}. Check the symbol, or pass price.`)
        })
        a.price = q.price
        dayChangePct = q.dayChangePct
      }
      const s = getState()
      const value = priced ? a.quantity! * a.price! : a.value
      if (value === undefined) throw new Error('Pass value, or symbol, quantity, and price.')
      const h: Holding = {
        id: slug(s, a.symbol ?? a.name),
        name: a.name,
        kind: a.kind as Holding['kind'],
        value,
        costBasis: a.costBasis ?? value,
        dayChangePct: priced ? dayChangePct : null,
        distributions: [],
        ...(priced ? { symbol: a.symbol!.toUpperCase(), quantity: a.quantity, price: a.price } : { valuedOn: today() }),
        ...(a.note ? { note: a.note } : {}),
      }
      s.holdings.push(h)
      log(s, by, `added ${h.name} at ${exact(h.value)}`)
      save()
      return `Added ${h.id}. Net worth is now ${exact(netWorthOf(s.holdings))}. ${freedomLine(s.assumptions, netWorthOf(s.holdings))}`
    },
  }),
  tool({
    name: 'update_holding',
    description:
      'Change a holding by id: record a new valuation for an alternative (value), change shares (quantity) or price for stocks and crypto, or edit name, cost basis, or note.',
    input: {
      id: z.string(),
      name: z.string().optional(),
      value: z.number().min(0).optional().describe('New valuation. Sets the valuation date to today.'),
      quantity: z.number().min(0).optional(),
      price: z.number().positive().optional(),
      costBasis: z.number().min(0).optional(),
      note: z.string().optional(),
    },
    run: ({ id, ...patch }, by) => {
      const s = getState()
      const h = findHolding(s, id)
      const before = h.value
      if (patch.name !== undefined) h.name = patch.name
      if (patch.costBasis !== undefined) h.costBasis = patch.costBasis
      if (patch.note !== undefined) h.note = patch.note
      if (h.symbol) {
        if (patch.quantity !== undefined) h.quantity = patch.quantity
        if (patch.price !== undefined) h.price = patch.price
        h.value = (h.quantity ?? 0) * (h.price ?? 0)
      } else if (patch.value !== undefined) {
        h.value = patch.value
        h.valuedOn = today()
      }
      log(s, by, h.value !== before ? `updated ${h.name} to ${exact(h.value)}` : `edited ${h.name}`, 'holding:' + h.id)
      save()
      return `Updated ${h.id}: ${exact(h.value)}. Net worth is now ${exact(netWorthOf(s.holdings))}.`
    },
  }),
  tool({
    name: 'remove_holding',
    description: 'Remove a holding by id, such as after selling it or when a syndication exits.',
    input: { id: z.string() },
    run: ({ id }, by) => {
      const s = getState()
      const h = findHolding(s, id)
      s.holdings = s.holdings.filter((x) => x !== h)
      log(s, by, `removed ${h.name}`)
      save()
      return `Removed ${h.name}. Net worth is now ${exact(netWorthOf(s.holdings))}.`
    },
  }),
  tool({
    name: 'record_distribution',
    description: 'Record a cash distribution, dividend, or payout received from a holding.',
    input: {
      holdingId: z.string(),
      amount: z.number().positive(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('YYYY-MM-DD. Defaults to today.'),
    },
    run: ({ holdingId, amount, date }, by) => {
      const s = getState()
      const h = findHolding(s, holdingId)
      h.distributions.push({ date: date ?? today(), amount })
      h.distributions.sort((x, y) => y.date.localeCompare(x.date))
      log(s, by, `logged a ${exact(amount)} distribution from ${h.name}`)
      save()
      return `Recorded ${exact(amount)} from ${h.name}. Total paid out: ${exact(h.distributions.reduce((t, d) => t + d.amount, 0))}.`
    },
  }),
  tool({
    name: 'refresh_prices',
    description:
      'Fetch current prices for every stock, fund, and crypto holding now and update their values. Prices also refresh automatically once a day.',
    input: {},
    run: () => refreshPrices(),
  }),
]

/** Updates every priced holding from the price feed. Holdings whose price can't be found keep their last price. */
export async function refreshPrices() {
  const priced = getState().holdings.filter((h) => h.symbol)
  const quotes = await Promise.allSettled(priced.map((h) => fetchQuote(h.symbol!, h.kind)))
  // Read again after the network calls, since the app or the agent may have saved meanwhile.
  const s = getState()
  const failed: string[] = []
  let updated = 0
  priced.forEach((p, i) => {
    const q = quotes[i]
    const h = s.holdings.find((x) => x.id === p.id)
    if (!h) return
    if (q.status === 'rejected') return void failed.push(`${h.symbol} (${(q.reason as Error).message})`)
    h.price = q.value.price
    h.dayChangePct = q.value.dayChangePct
    h.value = (h.quantity ?? 0) * h.price
    updated++
  })
  s.pricesUpdatedAt = new Date().toISOString()
  if (updated) log(s, 'Price feed', `updated ${updated} ${updated === 1 ? 'price' : 'prices'}`, 'prices')
  save()
  return [
    `Updated ${updated} of ${priced.length} prices. Net worth is now ${exact(netWorthOf(s.holdings))}.`,
    ...(failed.length ? [`Couldn't price: ${failed.join('; ')}.`] : []),
  ].join(' ')
}

/** Refreshes prices if they haven't been updated today (local time). */
export async function refreshIfStale() {
  const last = getState().pricesUpdatedAt
  if (last && new Date(last).toDateString() === new Date().toDateString()) return
  try {
    console.error(await refreshPrices())
  } catch (e) {
    console.error('Price refresh failed:', (e as Error).message)
  }
}

/** Runs a tool by name after validating its arguments. Throws with a readable message on bad input. */
export async function runTool(name: string, args: unknown, by: string) {
  const t = tools.find((x) => x.name === name)
  if (!t) throw new Error(`Unknown tool "${name}".`)
  const parsed = z.object(t.input).strict().parse(args ?? {})
  return t.run(parsed as never, by)
}

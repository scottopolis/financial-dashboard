import { z } from 'zod'
import {
  assetKinds,
  isPriced,
  kindInfo,
  formatSlider,
  planSliders,
  sliderValue,
  START_YEAR,
  today,
  type Assumptions,
  type Holding,
  type Portfolio,
  type SliderKey,
  type State,
} from '../src/model.ts'
import { exact, makePlan, MAX_STOP, netWorthOf, returnMix } from '../src/plan.ts'
import { getState, save } from './store.ts'
import { fetchHistory, fetchQuote } from './prices.ts'

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

const pct = (v: number) => `${Math.round(v * 100)}%`

/** Records a change for the activity feed. Repeated edits of the same thing by the same actor merge. */
function log(s: State, by: string, text: string, key?: string) {
  const last = s.changes[0]
  const recent = last && Date.now() - new Date(last.at).getTime() < 10 * 60000
  if (key && recent && last.by === by && last.key === key) s.changes.shift()
  s.changes.unshift({ at: new Date().toISOString(), by, text, key })
  s.changes.length = Math.min(s.changes.length, 200)
}

function freedomLine(a: Assumptions, holdings: Holding[]) {
  const p = makePlan(a, holdings, START_YEAR)
  const r = p.withdrawalPct
  if (p.freeAt >= 0) {
    const at = `Free to stop working in ${START_YEAR + p.freeAt} (in ${p.freeAt} years, at age ${a.currentAge + p.freeAt})`
    if (!r) return `${at}, spending ${exact(a.retireSpending)}/yr until age ${a.planToAge} in ${a.confidencePct}% of simulated markets.`
    return `${at}: withdrawing ${r}% of the portfolio gives at least the ${exact(a.retireSpending)}/yr target in ${a.confidencePct}% of simulated markets; typically ${exact(p.spendByStop[p.freeAt])}/yr from a ${exact(p.portfolioAtStop[p.freeAt])} portfolio. A ${r}% withdrawal lasts until age ${a.planToAge} in ${pct(p.lastsAt(p.freeAt))} of simulated markets.`
  }
  if (!r)
    return `Not free within ${MAX_STOP} years at ${exact(a.retireSpending)}/yr. Stopping in ${START_YEAR + MAX_STOP} supports ${exact(p.spendByStop[MAX_STOP])}/yr in ${a.confidencePct}% of markets.`
  return `Not free within ${MAX_STOP} years at a ${r}% withdrawal rate (needs at least ${exact(a.retireSpending)}/yr that lasts, in ${a.confidencePct}% of markets). Stopping in ${START_YEAR + MAX_STOP} gives ${exact(p.spendByStop[MAX_STOP])}/yr, which lasts in ${pct(p.lastsAt(MAX_STOP))} of markets.`
}

function planDetail(a: Assumptions, holdings: Holding[]) {
  const p = makePlan(a, holdings, START_YEAR)
  const r = p.withdrawalPct
  const rows = p.spendByStop.map(
    (s, i) =>
      `| ${START_YEAR + i} | ${a.currentAge + i} | ${exact(p.portfolioAtStop[i])} | ${exact(s)} | ${pct(p.lastsAt(i))} | ${pct(p.successAt(i))} |`,
  )
  return [
    freedomLine(a, holdings),
    '',
    r
      ? `By the year you stop working: the typical (median) portfolio then, a ${r}% withdrawal of it per year, the chance that withdrawal lasts until ${a.planToAge}, and the chance ${exact(a.retireSpending)}/yr lasts.`
      : `By the year you stop working: the typical (median) portfolio then, the yearly spending that lasts in ${a.confidencePct}% of markets (withdrawal rate is on auto), the chance it lasts, and the chance ${exact(a.retireSpending)}/yr lasts.`,
    '',
    `| Stop in | Age | Portfolio | ${r ? `${r}% withdrawal` : 'Spending'} | Chance it lasts | Chance target lasts |`,
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n')
}

function assumptionsText(a: Assumptions) {
  return [
    ...planSliders.map(
      (s) =>
        `- ${s.key}: ${s.defaultsToReturn && a[s.key] == null ? 'not set, follows returnPct' : formatSlider(s, sliderValue(a, s))} (${s.label}; range ${s.min}–${s.max} in steps of ${s.step}${s.key === 'withdrawalPct' ? '; 0 means auto' : ''}${s.defaultsToReturn ? '; null goes back to following returnPct' : ''})`,
    ),
    '',
    'Big purchases (one-time costs, in today\'s dollars):',
    ...(a.purchases.length ? a.purchases.map((p) => `- ${p.id}: ${p.label}, ${exact(p.amount)} in ${p.year}`) : ['- none']),
  ].join('\n')
}

/** Net worth at points in the past, from the daily history. */
function historySummary(s: State) {
  const h = s.history ?? []
  if (h.length < 2) return 'Not enough history yet; it is recorded daily.'
  const now = h[h.length - 1].value
  const at = (days: number) => {
    const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
    return h.find((x) => x.date >= cutoff) ?? h[0]
  }
  const rows = [7, 30, 90, 182, 365].map((d) => {
    const x = at(d)
    const change = now - x.value
    return `| ${x.date} | ${exact(x.value)} | ${change >= 0 ? '+' : ''}${exact(change)} (${x.value ? ((change / x.value) * 100).toFixed(1) : '0'}%) |`
  })
  return [
    `Daily history from ${h[0].date}. Days before tracking began are estimated from price history with today's quantities. Use get_net_worth_history for every day.`,
    '| Date | Net worth | Change to today |',
    '| --- | --- | --- |',
    ...rows,
  ].join('\n')
}

export function overview(s: State = getState()) {
  const net = netWorthOf(s.holdings)
  const todayChange = s.holdings.reduce(
    (t, h) => t + (h.dayChangePct ? (h.value * h.dayChangePct) / (100 + h.dayChangePct) : 0),
    0,
  )
  const row = (h: Holding) => {
    const detail = h.symbol
      ? `${h.quantity} ${h.symbol} at ${exact(h.price ?? 0)}`
      : h.interestPct
        ? `${h.interestPct}% APY, ${exact(h.interestEarned ?? 0)} interest added since ${h.valuedOn ?? 'added'}`
        : `valued ${h.valuedOn ?? 'never'}`
    const paid = h.distributions.reduce((t, d) => t + d.amount, 0)
    return `| ${h.id} | ${h.name} | ${exact(h.value)} | ${exact(h.costBasis)} | ${exact(h.value - h.costBasis)} | ${h.dayChangePct === null ? 'manual' : h.dayChangePct.toFixed(2) + '%'} | ${paid ? exact(paid) : '—'} | ${detail} |`
  }
  const groups = s.portfolios.flatMap((p) => {
    const hs = s.holdings.filter((h) => h.portfolioId === p.id)
    const v = netWorthOf(hs)
    return [
      '',
      `### ${p.name} (id ${p.id}, type ${p.kind}): ${exact(v)}, ${net ? pct(v / net) : '0%'} of net worth`,
      ...(hs.length
        ? ['| id | name | value | cost basis | gain | today | distributions | detail |', '| --- | --- | --- | --- | --- | --- | --- | --- |', ...hs.map(row)]
        : ['No holdings yet.']),
    ]
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
    `Stock and crypto prices from Yahoo Finance, last updated ${s.pricesUpdatedAt ? s.pricesUpdatedAt.slice(0, 16).replace('T', ' ') + ' UTC' : 'never'}. Alternatives and cash are valued manually; cash with an APY grows daily.`,
    '',
    '## Net worth over time',
    historySummary(s),
    '',
    '## Portfolios and holdings',
    `Each portfolio has a type that decides how its holdings are valued: ${assetKinds.map((k) => `${k} (${kindInfo[k]})`).join('; ')}.`,
    ...groups,
    '',
    '## Freedom plan',
    planDetail(s.assumptions, s.holdings),
    '',
    '## Plan assumptions (change with update_plan)',
    `All plan amounts are in today's dollars. Returns are simulated 400 times. Each portfolio type grows at its own yearly return, keeping today's mix: ${returnMix(s.assumptions, s.holdings)
      .map((m) => `${m.kind} ${Math.round(m.sharePct)}% of the portfolio at ${+m.returnPct.toFixed(2)}%${m.kind === 'Cash' ? " (its holdings' weighted APY, no swings)" : m.custom ? '' : ' (returnPct)'}`)
      .join('; ')}. Everything except cash swings by volatilityPct a year.`,
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
  planSliders.map((s) => {
    const n = z.number().min(s.min).max(s.max)
    return [
      s.key,
      (s.defaultsToReturn ? n.nullable() : n)
        .optional()
        .describe(`${s.label}${s.hint ? ` (${s.hint})` : ''}. Unit: ${s.unit}.${s.defaultsToReturn ? ' Pass null to follow returnPct again.' : ''}`),
    ]
  }),
) as Record<SliderKey, z.ZodOptional<z.ZodNullable<z.ZodNumber>>>

const kind = z.enum(assetKinds as [string, ...string[]])
const interestPct = z.number().min(0).max(25).describe('Yearly interest (APY) in percent, such as 4.1. It is added to the value daily.')

function slug(s: State, name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item'
  let id = base
  for (let n = 2; [...s.holdings, ...s.portfolios, ...s.assumptions.purchases].some((x) => x.id === id); n++) id = `${base}-${n}`
  return id
}

function findPortfolio(s: State, idOrName: string) {
  const p = s.portfolios.find((x) => x.id === idOrName || x.name.toLowerCase() === idOrName.toLowerCase())
  if (!p) throw new Error(`No portfolio "${idOrName}". Portfolios: ${s.portfolios.map((x) => `${x.id} (${x.kind})`).join(', ')}. Create one with add_portfolio.`)
  return p
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
      'Everything in the dashboard as one Markdown report: net worth, every portfolio with its holdings with value, cost basis, gain and distributions, the freedom plan (when you can stop working and how much you can spend), every plan assumption with its allowed range, big purchases, and recent changes. Call this first to answer any question.',
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
      if (!whatIf || !Object.keys(whatIf).length) return planDetail(s.assumptions, s.holdings)
      const tried = { ...s.assumptions, ...whatIf } as Assumptions
      return `Current plan: ${freedomLine(s.assumptions, s.holdings)}\n\nWith ${Object.entries(whatIf).map(([k, v]) => `${k} = ${v}`).join(', ')} (not saved):\n${planDetail(tried, s.holdings)}`
    },
  }),
  tool({
    name: 'update_plan',
    description:
      'Change plan assumptions and save them. These are the same values the sliders on the Plan page show, with the same ranges. Pass only the ones to change. Dollar amounts are per year in today\'s dollars; percentages are percent numbers, so 6.5 means 6.5%.',
    input: sliderShape,
    run: (args, by) => {
      const s = getState()
      // null clears a per-type return, so it follows returnPct again.
      const want = (p: (typeof planSliders)[number]) => args[p.key] ?? undefined
      const changed = planSliders.filter((p) => args[p.key] !== undefined && want(p) !== s.assumptions[p.key])
      if (!changed.length) return 'Nothing changed.\n' + freedomLine(s.assumptions, s.holdings)
      const a = s.assumptions as Record<SliderKey, number | undefined>
      for (const p of changed) {
        if (want(p) === undefined) delete a[p.key]
        else a[p.key] = want(p)
      }
      const said = (p: (typeof planSliders)[number]) =>
        a[p.key] === undefined ? `${p.label.toLowerCase()} back to the average return` : `${p.label.toLowerCase()} to ${formatSlider(p, sliderValue(s.assumptions, p))}`
      log(s, by, `set ${changed.map(said).join(', ')}`, 'plan:' + changed.map((p) => p.key).join(','))
      save()
      return `Saved. ${freedomLine(s.assumptions, s.holdings)}`
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
      return `Saved purchase ${p.id}. ${freedomLine(s.assumptions, s.holdings)}`
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
      return `Removed ${p.label}. ${freedomLine(s.assumptions, s.holdings)}`
    },
  }),
  tool({
    name: 'add_holding',
    description:
      'Add an investment to a portfolio. In a Stocks or Crypto portfolio pass symbol and quantity; the current price is looked up (pass price only to override it), and it updates daily after that. In an Alternatives or Cash portfolio pass value; in a Cash portfolio also interestPct for savings accounts.',
    input: {
      portfolio: z.string().describe('Portfolio id or name, from get_overview.'),
      name: z.string(),
      symbol: z.string().optional(),
      quantity: z.number().positive().optional(),
      price: z.number().positive().optional().describe('Price per share or coin. Omit to look it up.'),
      value: z.number().min(0).optional().describe('Current value, for holdings without a price.'),
      costBasis: z.number().min(0).optional().describe('Total amount invested. Defaults to the current value.'),
      interestPct: interestPct.optional(),
      note: z.string().optional(),
    },
    run: async (a, by) => {
      const portfolio = findPortfolio(getState(), a.portfolio)
      const k = portfolio.kind
      const priced = isPriced(k)
      if (priced && a.symbol === undefined) throw new Error(`${portfolio.name} is a ${k} portfolio, so pass symbol and quantity.`)
      if (!priced && a.symbol !== undefined) throw new Error(`${portfolio.name} is valued manually, so pass value instead of symbol.`)
      if (priced && a.quantity === undefined) throw new Error('A holding with a symbol needs quantity.')
      if (a.interestPct && k !== 'Cash') throw new Error(`Only cash holdings earn interest. ${k} holdings grow at the plan's ${k.toLowerCase()} return; set it with update_plan.`)
      let dayChangePct = 0
      if (priced && a.price === undefined) {
        const q = await fetchQuote(a.symbol!.toUpperCase(), k).catch((e) => {
          throw new Error(`${e.message}. Check the symbol, or pass price.`)
        })
        a.price = q.price
        dayChangePct = q.dayChangePct
      }
      const s = getState()
      const value = priced ? a.quantity! * a.price! : a.value
      if (value === undefined) throw new Error('Pass value.')
      const h: Holding = {
        id: slug(s, a.symbol ?? a.name),
        name: a.name,
        portfolioId: portfolio.id,
        kind: k,
        value,
        costBasis: a.costBasis ?? value,
        dayChangePct: priced ? dayChangePct : null,
        distributions: [],
        ...(priced
          ? { symbol: a.symbol!.toUpperCase(), quantity: a.quantity, price: a.price }
          : { valuedOn: today(), ...(a.interestPct ? { interestPct: a.interestPct, accruedOn: today(), interestEarned: 0 } : {}) }),
        ...(a.note ? { note: a.note } : {}),
      }
      s.holdings.push(h)
      log(s, by, `added ${h.name} to ${portfolio.name} at ${exact(h.value)}`)
      save()
      return `Added ${h.id}. Net worth is now ${exact(netWorthOf(s.holdings))}. ${freedomLine(s.assumptions, s.holdings)}`
    },
  }),
  tool({
    name: 'update_holding',
    description:
      'Change a holding by id: record a new value or balance for an alternative or cash holding (value), set the interest rate of a cash holding (interestPct, 0 to stop), change shares (quantity) or price for stocks and crypto, move it to another portfolio of the same type, or edit name, cost basis, or note.',
    input: {
      id: z.string(),
      name: z.string().optional(),
      value: z.number().min(0).optional().describe('New valuation. Sets the valuation date to today.'),
      quantity: z.number().min(0).optional(),
      price: z.number().positive().optional(),
      costBasis: z.number().min(0).optional(),
      interestPct: interestPct.optional(),
      portfolio: z.string().optional().describe('Portfolio id or name to move it to.'),
      note: z.string().optional(),
    },
    run: ({ id, ...patch }, by) => {
      const s = getState()
      const h = findHolding(s, id)
      const before = h.value
      if (patch.name !== undefined) h.name = patch.name
      if (patch.costBasis !== undefined) h.costBasis = patch.costBasis
      if (patch.note !== undefined) h.note = patch.note
      if (patch.portfolio !== undefined) {
        const p = findPortfolio(s, patch.portfolio)
        if (isPriced(p.kind) !== isPriced(h.kind)) throw new Error(`Can't move ${h.name} into ${p.name}: one is priced by symbol and the other valued manually.`)
        h.portfolioId = p.id
        h.kind = p.kind
        if (h.kind !== 'Cash') delete h.interestPct
      }
      if (patch.interestPct && h.kind !== 'Cash') throw new Error(`Only cash holdings earn interest. ${h.kind} holdings grow at the plan's ${h.kind.toLowerCase()} return; set it with update_plan.`)
      if (patch.interestPct !== undefined && h.kind === 'Cash') {
        h.interestPct = patch.interestPct || undefined
        h.accruedOn = today()
      }
      if (h.symbol) {
        if (patch.quantity !== undefined) h.quantity = patch.quantity
        if (patch.price !== undefined) h.price = patch.price
        h.value = (h.quantity ?? 0) * (h.price ?? 0)
      } else if (patch.value !== undefined) {
        h.value = patch.value
        h.valuedOn = today()
        h.accruedOn = today()
        h.interestEarned = 0
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
    name: 'get_net_worth_history',
    description: 'Daily net worth history as a CSV of date,value. Pass from and to (YYYY-MM-DD) to limit the range.',
    input: {
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    },
    run: ({ from, to }) => {
      const rows = (getState().history ?? []).filter((x) => (!from || x.date >= from) && (!to || x.date <= to))
      return ['date,value', ...rows.map((x) => `${x.date},${x.value}`)].join('\n')
    },
  }),
  tool({
    name: 'add_portfolio',
    description: `Create a portfolio to group holdings, such as "Retirement accounts" or "Real estate". Its type decides how holdings in it are valued: ${assetKinds.map((k) => `${k}: ${kindInfo[k]}`).join('; ')}.`,
    input: { name: z.string(), kind },
    run: ({ name, kind: k }, by) => {
      const s = getState()
      const p: Portfolio = { id: slug(s, name), name, kind: k as Portfolio['kind'] }
      s.portfolios.push(p)
      log(s, by, `created the ${name} portfolio`)
      save()
      return `Created portfolio ${p.id} (${p.kind}).`
    },
  }),
  tool({
    name: 'rename_portfolio',
    description: 'Rename a portfolio.',
    input: { id: z.string(), name: z.string() },
    run: ({ id, name }, by) => {
      const s = getState()
      const p = findPortfolio(s, id)
      log(s, by, `renamed ${p.name} to ${name}`)
      p.name = name
      save()
      return `Renamed ${p.id} to ${name}.`
    },
  }),
  tool({
    name: 'remove_portfolio',
    description: 'Remove an empty portfolio. Move or remove its holdings first.',
    input: { id: z.string() },
    run: ({ id }, by) => {
      const s = getState()
      const p = findPortfolio(s, id)
      const n = s.holdings.filter((h) => h.portfolioId === p.id).length
      if (n) throw new Error(`${p.name} still has ${n} holdings. Move them with update_holding or remove them first.`)
      s.portfolios = s.portfolios.filter((x) => x !== p)
      log(s, by, `removed the ${p.name} portfolio`)
      save()
      return `Removed ${p.name}.`
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

/**
 * Fills in a year of daily net worth from price history when there is little recorded history.
 * It assumes today's quantities were held all year; manual holdings count at today's value,
 * less interest for cash with an APY.
 */
export async function backfillHistory() {
  if ((getState().history?.length ?? 0) > 7) return
  const priced = getState().holdings.filter((h) => h.symbol)
  const series = await Promise.all(priced.map((h) => fetchHistory(h.symbol!, h.kind)))
  const s = getState()
  const start = series.reduce((d, m) => (m.keys().next().value! > d ? m.keys().next().value! : d), '')
  const dates = [...new Set(series.flatMap((m) => [...m.keys()]))].filter((d) => d >= start && d < today()).sort()
  const last = new Map<number, number>()
  const recorded = new Map((s.history ?? []).map((x) => [x.date, x.value]))
  for (const date of dates) {
    if (recorded.has(date)) continue
    let v = 0
    priced.forEach((h, i) => {
      const c = series[i].get(date)
      if (c) last.set(i, c)
      v += (h.quantity ?? 0) * (last.get(i) ?? 0)
    })
    for (const h of s.holdings)
      if (!h.symbol) {
        const years = (Date.parse(today()) - Date.parse(date)) / (365 * 86400000)
        v += h.interestPct ? h.value / Math.pow(1 + h.interestPct / 100, years) : h.value
      }
    recorded.set(date, Math.round(v))
  }
  s.history = [...recorded].map(([date, value]) => ({ date, value })).sort((x, y) => x.date.localeCompare(y.date))
  save()
}

/** Refreshes prices if they haven't been updated today (local time), and fills in missing history. */
export async function refreshIfStale() {
  const last = getState().pricesUpdatedAt
  try {
    if (!last || new Date(last).toDateString() !== new Date().toDateString()) console.error(await refreshPrices())
    await backfillHistory()
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

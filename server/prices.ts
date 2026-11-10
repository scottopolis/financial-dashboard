import type { AssetKind } from '../src/model.ts'

// Prices from Yahoo Finance's public chart endpoint: free, no key, and it covers stocks, ETFs,
// mutual funds, and crypto (as BTC-USD). Swap this function to change the source.

export type Quote = { price: number; dayChangePct: number }

export async function fetchQuote(symbol: string, kind: AssetKind): Promise<Quote> {
  const ticker = kind === 'Crypto' ? `${symbol}-USD` : symbol
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1d`
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(10000) })
  const body: any = await res.json().catch(() => null) // eslint-disable-line @typescript-eslint/no-explicit-any
  const meta = body?.chart?.result?.[0]?.meta
  if (!meta?.regularMarketPrice)
    throw new Error(`No price for ${symbol}: ${body?.chart?.error?.description ?? `HTTP ${res.status}`}`)
  const price: number = meta.regularMarketPrice
  const prev: number | undefined = meta.previousClose ?? meta.chartPreviousClose
  return { price, dayChangePct: prev ? Math.round(((price - prev) / prev) * 10000) / 100 : 0 }
}

import { useState } from 'react'
import { assetKinds, isPriced, kindInfo, type AssetKind, type State } from '../model.ts'
import type { Act } from '../api.ts'

const NEW = '__new__'
const num = (s: string) => Number(s.replace(/[$,%\s]/g, ''))

/** Manual entry for holdings and portfolios. It calls the same tools the agent uses. */
export function AddScreen({ state, act }: { state: State; act: Act }) {
  const [portfolioId, setPortfolioId] = useState(state.portfolios.find((p) => p.kind === 'Cash')?.id ?? state.portfolios[0]?.id ?? NEW)
  const [newName, setNewName] = useState('')
  const [newKind, setNewKind] = useState<AssetKind>('Cash')
  const [name, setName] = useState('')
  const [symbol, setSymbol] = useState('')
  const [quantity, setQuantity] = useState('')
  const [value, setValue] = useState('')
  const [apy, setApy] = useState('')
  const [cost, setCost] = useState('')
  const [busy, setBusy] = useState(false)

  const creating = portfolioId === NEW
  const portfolio = state.portfolios.find((p) => p.id === portfolioId)
  const kind = creating ? newKind : portfolio!.kind
  const priced = isPriced(kind)
  const ready =
    (!creating || newName.trim() !== '') &&
    (priced ? symbol.trim() !== '' && num(quantity) > 0 : name.trim() !== '' && num(value) >= 0 && value.trim() !== '')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ready || busy) return
    setBusy(true)
    let target = portfolio?.id ?? newName.trim()
    if (creating && !(await act('add_portfolio', { name: newName.trim(), kind: newKind }))) return setBusy(false)
    if (creating) target = newName.trim()
    const args = priced
      ? { portfolio: target, name: name.trim() || symbol.trim().toUpperCase(), symbol: symbol.trim(), quantity: num(quantity) }
      : { portfolio: target, name: name.trim(), value: num(value), ...(kind === 'Cash' && apy.trim() && num(apy) > 0 ? { interestPct: num(apy) } : {}) }
    const ok = await act('add_holding', { ...args, ...(cost.trim() ? { costBasis: num(cost) } : {}) })
    setBusy(false)
    if (ok) location.hash = '#/'
  }

  return (
    <form className="stack-lg" onSubmit={submit}>
      <div className="stack-xs">
        <h1 className="hero-sm">Add a holding</h1>
        <span className="caption">Or ask Claude: “Add my Ally savings, $25,000 at 4.2% APY.”</span>
      </div>

      <section className="stack-sm">
        <h2 className="section">Portfolio</h2>
        <div className="card fields">
          <label className="field">
            <span className="field-label">Add to</span>
            <span className="input">
              <select value={portfolioId} onChange={(e) => setPortfolioId(e.target.value)}>
                {state.portfolios.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.kind})
                  </option>
                ))}
                <option value={NEW}>New portfolio…</option>
              </select>
            </span>
            {!creating && <span className="caption">{kindInfo[kind]}</span>}
          </label>
          {creating && (
            <>
              <label className="field">
                <span className="field-label">Name</span>
                <span className="input">
                  <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Retirement accounts" />
                </span>
              </label>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <span className="field-label">Type</span>
                <div className="seg-light wide" role="group" aria-label="Type">
                  {assetKinds.map((k) => (
                    <button type="button" key={k} aria-pressed={k === newKind} onClick={() => setNewKind(k)}>
                      {k === 'Alternatives' ? 'Alternative' : k}
                    </button>
                  ))}
                </div>
                <span className="caption">{kindInfo[newKind]}</span>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="stack-sm">
        <h2 className="section">Holding</h2>
        <div className="card fields">
          {priced ? (
            <>
              <label className="field">
                <span className="field-label">{kind === 'Crypto' ? 'Coin' : 'Ticker'}</span>
                <span className="input">
                  <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder={kind === 'Crypto' ? 'BTC' : 'VOO'} autoCapitalize="characters" autoCorrect="off" />
                </span>
                <span className="caption">The price is looked up and updated daily.</span>
              </label>
              <label className="field">
                <span className="field-label">{kind === 'Crypto' ? 'Amount' : 'Shares'}</span>
                <span className="input">
                  <input inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" />
                </span>
              </label>
            </>
          ) : (
            <>
              <label className="field">
                <span className="field-label">Name</span>
                <span className="input">
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === 'Cash' ? 'Ally savings' : 'Phoenix industrial syndication'} />
                </span>
              </label>
              <label className="field">
                <span className="field-label">{kind === 'Cash' ? 'Balance' : 'Current value'}</span>
                <span className="input">
                  <span className="affix">$</span>
                  <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0" />
                </span>
              </label>
              {kind === 'Cash' && <label className="field">
                <span className="field-label">Interest rate</span>
                <span className="input">
                  <input inputMode="decimal" value={apy} onChange={(e) => setApy(e.target.value)} placeholder="4.1" />
                  <span className="affix">% APY</span>
                </span>
                <span className="caption">Added to the balance daily. Leave empty for none.</span>
              </label>}
            </>
          )}
          <label className="field">
            <span className="field-label">Amount invested</span>
            <span className="input">
              <span className="affix">$</span>
              <input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="Optional" />
            </span>
          </label>
        </div>
      </section>

      <div className="row-between center wrap">
        <span className="caption">Saved through the same tools Claude uses.</span>
        <button type="submit" className="btn primary" disabled={!ready || busy}>
          {busy ? 'Adding…' : 'Add holding'}
        </button>
      </div>
    </form>
  )
}

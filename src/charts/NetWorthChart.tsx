import { useState } from 'react'
import { exact, money } from '../plan.ts'
import { useWidth } from '../useWidth'
import { useScrub } from './useScrub'

type Point = { date: string; value: number }

const ranges = [
  { id: '1M', days: 30 },
  { id: '3M', days: 91 },
  { id: '1Y', days: 365 },
  { id: 'All', days: Infinity },
] as const

const longDate = (iso: string) =>
  new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

/** Net worth with its history. Hovering, dragging, or arrow keys on the chart show the value on that day. */
export function NetWorthChart({ history, netWorth, today }: { history: Point[]; netWorth: number; today: number }) {
  const [range, setRange] = useState<(typeof ranges)[number]['id']>(() => (localStorage.getItem('freedom.range') as never) ?? '1Y')
  const [ref, width] = useWidth<HTMLDivElement>()

  const days = ranges.find((r) => r.id === range)!.days
  const latest = history[history.length - 1]?.date
  const cutoff = days === Infinity || !latest ? '' : new Date(Date.parse(latest) - days * 86400000).toISOString().slice(0, 10)
  const points = history.filter((p) => p.date >= cutoff)
  const enough = points.length >= 2
  const w = Math.max(260, width)
  const { hover, clear, props } = useScrub(points.length, (px) => (px / w) * (points.length - 1))
  const i = hover ?? points.length - 1
  const shown = hover === null ? netWorth : points[i].value
  const base = points[0]?.value ?? netWorth
  const change = shown - base

  const h = 150
  const pad = 8
  const lo = Math.min(...points.map((p) => p.value))
  const hi = Math.max(...points.map((p) => p.value))
  const x = (k: number) => (k / Math.max(1, points.length - 1)) * w
  const y = (v: number) => pad + (1 - (v - lo) / (hi - lo || 1)) * (h - pad * 2)
  const d = points.map((p, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)},${y(p.value).toFixed(1)}`).join('')

  return (
    <div className="stack-sm">
      <div className="stack-xs">
        <span className="label">{hover === null ? 'Net worth' : longDate(points[i].date)}</span>
        <div className="row">
          <span className="big num">{exact(shown)}</span>
          {hover === null && (
            <span className={today >= 0 ? 'delta up' : 'delta down'}>
              {today >= 0 ? '+' : '−'}
              {exact(Math.abs(today))} today
            </span>
          )}
        </div>
        {enough && (
          <span className={`caption num ${change > 0 ? 'up' : change < 0 ? 'down' : ''}`}>
            {change >= 0 ? '+' : '−'}
            {exact(Math.abs(change))} ({base ? ((Math.abs(change) / base) * 100).toFixed(1) : '0'}%) since {longDate(points[0].date)}
          </span>
        )}
      </div>

      <div ref={ref} className="nw">
        {width > 0 && enough && (
          <svg
            {...props}
            width={w}
            height={h}
            role="img"
            aria-label={`Net worth from ${points[0].date} to ${points[points.length - 1].date}`}
          >
            <path d={`${d}L${w},${h}L0,${h}Z`} className="band" />
            <path d={d} className="median" />
            <text x={0} y={pad + 4} dominantBaseline="hanging">
              {money(hi)}
            </text>
            <text x={0} y={h - pad}>
              {money(lo)}
            </text>
            {hover !== null && (
              <>
                <line x1={x(i)} x2={x(i)} y1={0} y2={h} className="marker" />
                <circle cx={x(i)} cy={y(points[i].value)} r={4} className="scrub-dot" />
              </>
            )}
          </svg>
        )}
        {!enough && <p className="caption">History builds up as the app records your net worth each day.</p>}
      </div>

      <div className="seg-light nw-ranges" role="group" aria-label="Range">
        {ranges.map((r) => (
          <button
            key={r.id}
            aria-pressed={r.id === range}
            onClick={() => {
              localStorage.setItem('freedom.range', r.id)
              setRange(r.id)
              clear()
            }}
          >
            {r.id}
          </button>
        ))}
      </div>
    </div>
  )
}

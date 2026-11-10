import { money, type Band } from '../plan.ts'
import { useWidth } from '../useWidth'

type Props = { bands: Band[]; stop: number; startYear: number; endAge: number; height?: number }

/** The middle half of simulated portfolio balances by year, with the median as a line. */
export function FanChart({ bands, stop, startYear, endAge, height = 180 }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const w = Math.max(280, width)
  const h = height + 12
  // The stop label gets its own strip above the data so lines never run through it.
  const top = 24
  const bottom = 22
  const left = 48
  const years = bands.length - 1
  const ymax = Math.max(...bands.map((b) => b.high)) * 1.05
  const x = (i: number) => left + (i / years) * (w - left - 4)
  const y = (v: number) => top + (1 - Math.min(v, ymax) / ymax) * (h - top - bottom)
  const line = (k: keyof Band) => bands.map((b, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(b[k]).toFixed(1)}`).join('')
  const area =
    line('high') +
    bands
      .map((b, i) => `L${x(i).toFixed(1)},${y(b.low).toFixed(1)}`)
      .reverse()
      .join('') +
    'Z'
  const mag = Math.pow(10, Math.floor(Math.log10(ymax / 2)))
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => ymax / s <= (height < 160 ? 3 : 5))!
  const ticks: number[] = []
  for (let v = 0; v <= ymax; v += step) ticks.push(v)

  return (
    <div ref={ref}>
      {width > 0 && (
        <svg className="chart" width={w} height={h} role="img" aria-label="Portfolio range by year">
          {ticks.map((v) => (
            <g key={v}>
              <line x1={left} x2={w} y1={y(v)} y2={y(v)} className={v ? 'grid' : 'axis'} />
              <text x={0} y={y(v) + 4}>
                {v ? money(v) : '$0'}
              </text>
            </g>
          ))}
          <path d={area} className="band" />
          <path d={line('mid')} className="median" />
          <line x1={x(stop)} x2={x(stop)} y1={16} y2={h - bottom} className="marker" />
          <text x={Math.min(x(stop), w - 80) + 6} y={12} className="strong">
            Stop {startYear + stop}
          </text>
          <text x={x(0)} y={h - 4}>
            Now
          </text>
          <text x={w} y={h - 4} textAnchor="end">
            Age {endAge}
          </text>
        </svg>
      )}
    </div>
  )
}

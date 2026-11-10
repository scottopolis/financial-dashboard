import { useState } from 'react'

/**
 * Hover, drag, or arrow-key selection of one point on a chart.
 * `indexAt` maps a pointer x (in px from the chart's left edge) to a point index; `start` is
 * where arrow keys begin. Spread `props` onto the chart's svg.
 */
export function useScrub(count: number, indexAt: (x: number) => number, start = count - 1) {
  const [hover, setHover] = useState<number | null>(null)
  const clamp = (k: number) => Math.max(0, Math.min(count - 1, k))
  const pick = (e: React.PointerEvent<SVGSVGElement>) =>
    setHover(clamp(Math.round(indexAt(e.clientX - e.currentTarget.getBoundingClientRect().left))))
  const props = {
    className: 'chart scrub',
    tabIndex: 0,
    onPointerMove: pick,
    onPointerDown: pick,
    onPointerLeave: () => setHover(null),
    onBlur: () => setHover(null),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') setHover(null)
      const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
      if (!step) return
      e.preventDefault()
      setHover((h) => clamp((h ?? start) + step))
    },
  }
  return { hover: hover !== null && hover < count ? hover : null, clear: () => setHover(null), props }
}
